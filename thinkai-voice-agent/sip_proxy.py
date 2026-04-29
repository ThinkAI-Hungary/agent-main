"""
sip_callback.py -- Inbound SIP bridge LiveKit callback megoldással.
Folyamat:
  1. SBC -> INVITE -> mi (5060)
  2. Mi: room letrehozas + agent dispatch + CreateSIPParticipant(46.107.64.195:5070)
  3. LiveKit -> INVITE -> mi (5070)
  4. Mi: kapcsoljuk a ket RTP oldalt
"""
import hashlib, os, re, socket, ssl, struct, threading, time, uuid, asyncio
from datetime import datetime

# --- Konfig ---
SIP_SERVER   = "sbc2.opennet.hu"
SIP_PORT     = 5060
USERNAME     = "3617001622"
PASSWORD     = "wOw9nfnlIg"
LOCAL_PORT   = 5060
CB_PORT      = 5070          # LiveKit visszahivas portja
EXPIRES      = 60
RE_REG_SEC   = 50

LK_URL         = "https://thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud"
LK_KEY         = "APIYS7bZkZBFZpt"
LK_SECRET      = "ufxdDeubWjmzKMYoHTePc8vwCVhzBn36i2HCjSddgrSB"
LK_AGENT       = "thinkai-dobozos-local"
LK_BRIDGE_TRUNK = "ST_GVH52cSjTSFH"  # 46.107.64.195:5070
LK_OUT_TRUNK    = "ST_2wJZqGsWZBC3"   # Meglevo kimeno trunk (sbc2)

def log(m): print(f"[{datetime.now().strftime('%H:%M:%S')}] {m}", flush=True)
def md5x(s): return hashlib.md5(s.encode()).hexdigest()
def br(): return "z9hG4bk"+uuid.uuid4().hex[:10]
def tg(): return uuid.uuid4().hex[:8]
def ci(): return uuid.uuid4().hex[:12]

def hdr(m,n):
    x=re.search(rf"^{re.escape(n)}\s*:\s*(.+)$",m,re.I|re.M)
    return x.group(1).strip() if x else ""

def www_auth(m):
    l=hdr(m,"WWW-Authenticate") or hdr(m,"Proxy-Authenticate")
    r=re.search(r'realm="([^"]+)"',l); n=re.search(r'nonce="([^"]+)"',l)
    return (r.group(1) if r else ""), (n.group(1) if n else "")

def digest(realm,nonce,method,uri):
    h1=md5x(f"{USERNAME}:{realm}:{PASSWORD}"); h2=md5x(f"{method}:{uri}")
    return (f'Digest username="{USERNAME}",realm="{realm}",'
            f'nonce="{nonce}",uri="{uri}",response="{md5x(f"{h1}:{nonce}:{h2}")}",algorithm=MD5')

def get_pub_ip(sock):
    for host,port in [("stun.l.google.com",19302),("stun.cloudflare.com",3478)]:
        try:
            tid=os.urandom(12); sock.sendto(struct.pack(">HHI",0x0001,0,0x2112A442)+tid,(host,port))
            sock.settimeout(3); data,_=sock.recvfrom(1024); off=20
            while off+4<=len(data):
                at=struct.unpack(">H",data[off:off+2])[0]; al=struct.unpack(">H",data[off+2:off+4])[0]
                v=data[off+4:off+4+al]
                if at==0x0020 and len(v)>=8:
                    return ".".join(str((struct.unpack(">I",v[4:8])[0]^0x2112A442)>>(24-k*8)&0xFF)for k in range(4)),struct.unpack(">H",v[2:4])[0]^0x2112
                if at==0x0001 and len(v)>=8: return ".".join(str(b)for b in v[4:8]),struct.unpack(">H",v[2:4])[0]
                off+=4+al+(4-al%4)%4
        except: pass
    return None,None

def parse_sdp(body):
    c=re.search(r"^c=IN IP4 (.+)$",body,re.M); m=re.search(r"^m=audio (\d+)",body,re.M)
    return (c.group(1).strip() if c else ""),(int(m.group(1)) if m else 0)

def make_sdp(ip,port):
    return (f"v=0\r\no=- 0 0 IN IP4 {ip}\r\ns=ThinkAI\r\nc=IN IP4 {ip}\r\nt=0 0\r\n"
            f"m=audio {port} RTP/AVP 0 8 101\r\na=rtpmap:0 PCMU/8000\r\n"
            f"a=rtpmap:8 PCMA/8000\r\na=rtpmap:101 telephone-event/8000\r\n"
            f"a=fmtp:101 0-15\r\na=sendrecv\r\n")

def alloc_udp():
    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.bind(("0.0.0.0",0)); return s,s.getsockname()[1]

def sip_resp(code,reason,via,frm,to,cid,cseq,contact="",sdp=""):
    to2=to if "tag=" in to else f"{to};tag={tg()}"
    body=sdp.encode() if sdp else b""
    ls=[f"SIP/2.0 {code} {reason}",f"Via: {via}",f"From: {frm}",f"To: {to2}",
        f"Call-ID: {cid}",f"CSeq: {cseq}"]
    if contact: ls.append(f"Contact: <{contact}>")
    if sdp: ls.append("Content-Type: application/sdp")
    ls+=[f"Content-Length: {len(body)}",""]; return "\r\n".join(ls).encode()+b"\r\n"+body

def make_reg(pub_ip,pub_port,seq,cid,ftag,auth=""):
    ls=[f"REGISTER sip:{SIP_SERVER} SIP/2.0",
        f"Via: SIP/2.0/UDP {pub_ip}:{pub_port};branch={br()};rport",
        f"From: <sip:{USERNAME}@{SIP_SERVER}>;tag={ftag}",
        f"To: <sip:{USERNAME}@{SIP_SERVER}>",
        f"Call-ID: {cid}",f"CSeq: {seq} REGISTER",
        f"Contact: <sip:{USERNAME}@{pub_ip}:{pub_port}>",
        "Max-Forwards: 70",f"Expires: {EXPIRES}","User-Agent: ThinkAI/1.0","Content-Length: 0"]
    if auth: ls.insert(-1,f"Authorization: {auth}")
    return "\r\n".join(ls)+"\r\n\r\n"

def rtp_bridge(sa,sb,stop_evt):
    sa.settimeout(1); sb.settimeout(1)
    sbc_dst=[None]; lk_dst=[None]
    def a_to_b():
        while not stop_evt.is_set():
            try:
                d,addr=sa.recvfrom(4096)
                if sbc_dst[0] is None: sbc_dst[0]=addr; log(f"[RTP] SBC: {addr}")
                if lk_dst[0]: sb.sendto(d,lk_dst[0])
            except socket.timeout: pass
    def b_to_a():
        while not stop_evt.is_set():
            try:
                d,addr=sb.recvfrom(4096)
                if lk_dst[0] is None: lk_dst[0]=addr; log(f"[RTP] LK: {addr}")
                if sbc_dst[0]: sa.sendto(d,sbc_dst[0])
            except socket.timeout: pass
    threading.Thread(target=a_to_b,daemon=True).start()
    threading.Thread(target=b_to_a,daemon=True).start()

# Pendingcallok: cb_token -> session
pending = {}

def lk_callback_and_bridge(sess, pub_ip, main_sock):
    """LiveKit API-n keresztul szobat hoz letre, dispatch-el, majd SIP participant-et keszit."""
    async def _run():
        from livekit import api as lk
        client = lk.LiveKitAPI(url=LK_URL, api_key=LK_KEY, api_secret=LK_SECRET)
        try:
            room_name = f"call-{ci()}"
            # 1. Szoba letrehozasa
            await client.room.create_room(lk.CreateRoomRequest(name=room_name, empty_timeout=120))
            log(f"[LK] Szoba: {room_name}")

            # 2. Agent dispatch
            await client.agent_dispatch.create_dispatch(
                lk.CreateAgentDispatchRequest(agent_name=LK_AGENT, room=room_name, metadata="inbound_sip")
            )
            log(f"[LK] Agent dispatched -> {room_name}")

            # 3. SIP participant - LiveKit hivja a mi callback portunkat
            cb_uri = f"sip:bridge@{pub_ip}:{CB_PORT}"
            token = ci()  # azonosito a callback-hoz
            sess["lk_room"] = room_name
            sess["cb_token"] = token
            pending[token] = sess

            await client.sip.create_sip_participant(lk.CreateSIPParticipantRequest(
                sip_trunk_id=LK_BRIDGE_TRUNK,
                sip_call_to="+3617001622",
                room_name=room_name,
                participant_identity=f"sip-bridge-{token}",
                participant_name="SBC Bridge",
                wait_until_answered=False,
            ))
            log(f"[LK] SIP participant letrehozva -> bridge trunk")
        except Exception as e:
            log(f"[LK] HIBA: {e}")
            main_sock.sendto(sip_resp("503","Service Unavailable",
                sess["sbc_via"],sess["sbc_from"],sess["sbc_to"],
                sess["sbc_cid"],sess["sbc_cseq"]), sess["sbc_addr"])
        finally:
            await client.aclose()
    asyncio.run(_run())

def handle_lk_invite(msg, addr, cb_sock, pub_ip, main_sock):
    """Fogadja a LiveKit visszahivast (5070-es porton)."""
    via=hdr(msg,"Via"); frm=hdr(msg,"From"); to=hdr(msg,"To")
    cid=hdr(msg,"Call-ID"); cseq=hdr(msg,"CSeq")
    body=msg.split("\r\n\r\n",1)[1] if "\r\n\r\n" in msg else ""
    lk_rtp_ip, lk_rtp_port = parse_sdp(body)
    log(f"[CB] LiveKit visszahivas! LK RTP: {lk_rtp_ip}:{lk_rtp_port}")

    # Megkeressuk a matching session-t (az elso pending-et hasznaljuk)
    sess = None
    if pending:
        token = next(iter(pending))
        sess = pending.pop(token)

    if not sess:
        log("[CB] Nem talalhato session! Elutasitjuk.")
        cb_sock.sendto(sip_resp("486","Busy Here",via,frm,to,cid,cseq), addr)
        return

    # Valaszolunk a LiveKit hivas-ra
    rtp_b, port_b = alloc_udp()
    our_sdp = make_sdp(pub_ip, port_b)
    cb_sock.sendto(sip_resp("200","OK",via,frm,to,cid,cseq,
                             contact=f"sip:bridge@{pub_ip}:{CB_PORT}",sdp=our_sdp), addr)
    log(f"[CB] 200 OK -> LiveKit | port_b={port_b}")

    # RTP bridge inditasa
    sess["lk_rtp_ip"] = lk_rtp_ip
    sess["lk_rtp_port"] = lk_rtp_port
    rtp_a = sess["rtp_a"]
    stop_evt = threading.Event()
    rtp_bridge(rtp_a, rtp_b, stop_evt)

    # SBC-nek 200 OK
    sbc_sdp = make_sdp(pub_ip, sess["my_rtp_port_a"])
    main_sock.sendto(sip_resp("200","OK",
        sess["sbc_via"],sess["sbc_from"],sess["sbc_to"],
        sess["sbc_cid"],sess["sbc_cseq"],
        contact=f"sip:{USERNAME}@{pub_ip}:{LOCAL_PORT}",
        sdp=sbc_sdp), sess["sbc_addr"])
    log(f"[TX] 200 OK -> SBC | port_a={sess['my_rtp_port_a']}")

def cb_listener(cb_sock, pub_ip, main_sock):
    """5070-es UDP socket - LiveKit visszahivasokat fogad."""
    cb_sock.settimeout(1)
    while True:
        try:
            data,addr = cb_sock.recvfrom(8192)
            msg = data.decode(errors="replace")
            first = msg.splitlines()[0] if msg.splitlines() else ""
            if first.startswith("INVITE "):
                threading.Thread(target=handle_lk_invite,
                                 args=(msg,addr,cb_sock,pub_ip,main_sock),daemon=True).start()
            elif first.startswith("ACK "):
                log(f"[CB] ACK <- {addr[0]}")
            elif first.startswith("BYE "):
                via=hdr(msg,"Via"); frm=hdr(msg,"From"); to=hdr(msg,"To")
                cid=hdr(msg,"Call-ID"); cseq=hdr(msg,"CSeq")
                cb_sock.sendto(sip_resp("200","OK",via,frm,to,cid,cseq), addr)
        except socket.timeout: pass
        except Exception as e: log(f"[CB] ERR: {e}")

def main():
    sock = socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    sock.bind(("0.0.0.0",LOCAL_PORT))

    cb_sock = socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    cb_sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    cb_sock.bind(("0.0.0.0",CB_PORT))

    log("[INFO] STUN..."); pub_ip,pub_port=get_pub_ip(sock)
    if not pub_ip: pub_ip=socket.gethostbyname(socket.gethostname()); pub_port=LOCAL_PORT
    log(f"[STUN] {pub_ip}:{pub_port}")
    sock.settimeout(1)

    # Callback listener thread
    threading.Thread(target=cb_listener,args=(cb_sock,pub_ip,sock),daemon=True).start()
    log(f"[INFO] Callback listener: {pub_ip}:{CB_PORT}")

    reg_seq=1; reg_cid=ci(); reg_tag=tg()
    reg_realm=reg_nonce=""; reg_state="idle"; last_reg=0.0

    def send_reg(auth=False):
        nonlocal reg_seq
        a=digest(reg_realm,reg_nonce,"REGISTER",f"sip:{SIP_SERVER}") if auth and reg_realm else ""
        sock.sendto(make_reg(pub_ip,pub_port,reg_seq,reg_cid,reg_tag,a).encode(),(SIP_SERVER,SIP_PORT))
        reg_seq+=1; log(f"[TX] REGISTER -> {SIP_SERVER}")

    send_reg(); reg_state="wait_401"; last_reg=time.time()
    log(f"[INFO] SBC listener: {pub_ip}:{pub_port}")

    while True:
        try:
            data,addr=sock.recvfrom(8192)
            msg=data.decode(errors="replace")
            first=msg.splitlines()[0] if msg.splitlines() else ""
            call_id=hdr(msg,"Call-ID")

            if first.startswith("SIP/2.0"):
                code=first.split()[1] if len(first.split())>1 else ""
                if code=="401" and reg_state=="wait_401":
                    reg_realm,reg_nonce=www_auth(msg); send_reg(True); reg_state="wait_200"
                elif code=="200" and reg_state=="wait_200":
                    reg_state="registered"; last_reg=time.time(); log("[OK] REGISTERED!")

            elif first.startswith("INVITE "):
                via=hdr(msg,"Via"); frm=hdr(msg,"From"); to=hdr(msg,"To"); cseq=hdr(msg,"CSeq")
                body=msg.split("\r\n\r\n",1)[1] if "\r\n\r\n" in msg else ""
                sbc_rtp_ip,sbc_rtp_port=parse_sdp(body)
                caller_m=re.search(r"sip:([+\d]+)@",frm)
                caller=caller_m.group(1) if caller_m else "?"
                log(f"[INVITE] <- {addr[0]} | caller:{caller}")

                # 180 Ringing - tartjuk eletben az SBC-t
                sock.sendto(sip_resp("180","Ringing",via,frm,to,call_id,cseq,
                                     contact=f"sip:{USERNAME}@{pub_ip}:{pub_port}"), addr)

                rtp_a,port_a=alloc_udp()
                sess={
                    "sbc_addr":addr,"sbc_via":via,"sbc_from":frm,"sbc_to":to,
                    "sbc_cid":call_id,"sbc_cseq":cseq,
                    "sbc_rtp_ip":sbc_rtp_ip,"sbc_rtp_port":sbc_rtp_port,
                    "rtp_a":rtp_a,"my_rtp_port_a":port_a,
                }
                threading.Thread(target=lk_callback_and_bridge,
                                 args=(sess,pub_ip,sock),daemon=True).start()

            elif first.startswith("ACK "): log(f"[RX] ACK <- {addr[0]}")
            elif first.startswith("BYE "):
                via=hdr(msg,"Via"); frm=hdr(msg,"From"); to=hdr(msg,"To"); cseq=hdr(msg,"CSeq")
                sock.sendto(sip_resp("200","OK",via,frm,to,call_id,cseq),addr)
            elif first.startswith("OPTIONS "):
                via=hdr(msg,"Via"); frm=hdr(msg,"From"); to=hdr(msg,"To"); cseq=hdr(msg,"CSeq")
                sock.sendto(sip_resp("200","OK",via,frm,to,call_id,cseq),addr)

        except socket.timeout:
            if reg_state=="registered" and time.time()-last_reg>RE_REG_SEC:
                send_reg(); reg_state="wait_401"
            elif reg_state=="idle" and time.time()-last_reg>10:
                send_reg(); reg_state="wait_401"; last_reg=time.time()
        except KeyboardInterrupt: log("[INFO] Leallitas."); break
        except Exception as e: log(f"[ERR] {e}")

if __name__=="__main__": main()
