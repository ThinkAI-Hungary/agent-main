# Asterisk SIP Bridge – ThinkAI

Ez a mappa tartalmazza az Asterisk SIP bridge konfigurációját, ami a bejövő
Telefonalo.hu hívásokat a LiveKit SIP endpointhoz irányítja.

## Architektúra

```
Telefonalo.hu SBC
  (sbc2.opennet.hu:5060)
        │ SIP INVITE (UDP)
        ▼
    Asterisk
  (szerver:5060)
        │ SIP INVITE (TLS)
        ▼
  LiveKit Cloud SIP
  (sip.livekit.cloud:5061)
        │
        ▼
  Voice Agent (server.py)
```

## Telepítés (Linux szerveren, egyszer kell)

```bash
sudo bash asterisk/setup.sh
```

Ez elvégzi:
1. Asterisk telepítése (`apt-get install asterisk`)
2. Konfig fájlok másolása `/etc/asterisk/`-ba
3. Publikus IP automatikus behelyettesítése
4. Asterisk service indítása és engedélyezése
5. UFW tűzfal szabályok (ha aktív)

## LiveKit trunk frissítése (egyszer kell)

Az Asterisk szerver IP-jét hozzá kell adni a LiveKit inbound trunk
`allowed_addresses` listájához:

```bash
# A szerveren:
PUB_IP=$(curl -s ifconfig.me)
python3 asterisk/update_livekit_trunk.py $PUB_IP
```

Vagy manuálisan a LiveKit Dashboard-on:
- Trunk ID: `ST_apoDLufNDkHa`
- Add allowed address: `<SZERVER_IP>/32`

## Ellenőrzés

```bash
# Regisztráció státusz
asterisk -rx 'pjsip show registrations'

# Hívások figyelése (valós idő)
asterisk -rx 'console verbose 3'

# Log
tail -f /var/log/asterisk/full
```

## Konfig fájlok

| Fájl | Leírások |
|------|--------|
| `setup.sh` | Egylépéses telepítő script |
| `pjsip.conf` | SIP trunk konfig (Telefonalo.hu + LiveKit) |
| `extensions.conf` | Dialplan: bejövő hívás → LiveKit |
| `logger.conf` | Részletes naplózás |
| `update_livekit_trunk.py` | LiveKit trunk IP frissítő |

## Tűzfal portok

| Port | Protokoll | Leírás |
|------|-----------|--------|
| 5060 | UDP | SIP (Telefonalo.hu) |
| 5061 | TCP | SIP TLS (LiveKit) |
| 10000-20000 | UDP | RTP média |
