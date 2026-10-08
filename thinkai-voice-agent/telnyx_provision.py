"""
Telnyx BYO provisioning — vékony REST wrapper a tenant SAJÁT Telnyx API kulcsával.

Funkció: a tenant által a Telnyx portálon megvásárolt/aktivált számot
összeköti a LiveKit SIP infrastruktúránkkal:
  1. outbound voice profile (kimenő hívásokhoz)
  2. FQDN connection (TCP, +E.164 formátumok) → a LiveKit SIP endpointra mutat
  3. szám ↔ connection hozzárendelés
Minden ensure_* idempotens: elmentett ID újrahasznosítása.
"""
import os
import secrets
import urllib.request
import urllib.error

from loguru import logger

TELNYX_BASE = "https://api.telnyx.com/v2"
_HEADERS_UA = {"User-Agent": "Mozilla/5.0"}  # Cloudflare-védett hívásokhoz kell
_TIMEOUT = 20


class TelnyxError(Exception):
    """Telnyx API hiba — a message tartalmazza a szerver válaszát."""
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _headers(api_key: str, json_content: bool = True) -> dict:
    h = {"Authorization": f"Bearer {api_key}", **_HEADERS_UA}
    if json_content:
        h["Content-Type"] = "application/json"
    return h


def _request(method: str, path: str, api_key: str, body: dict | None = None) -> dict:
    url = f"{TELNYX_BASE}{path}"
    data = None
    if body is not None:
        import json as _json
        data = _json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=_headers(api_key))
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return __import__("json").loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        raise TelnyxError(f"Telnyx {method} {path} → HTTP {e.code}: {detail}", status_code=e.code) from e
    except urllib.error.URLError as e:
        raise TelnyxError(f"Telnyx elérhetetlen: {e.reason}") from e


def livekit_sip_host() -> str:
    """A LIVEKIT_URL-ből a SIP FQDN: wss://X.livekit.cloud → X.sip.livekit.cloud"""
    url = os.getenv("LIVEKIT_URL", "")
    host = url.replace("wss://", "").replace("ws://", "").split("/")[0]
    # pl. thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud → ….sip.livekit.cloud
    first = host.split(".")[0]
    return f"{first}.sip.livekit.cloud"


def validate_key(api_key: str) -> bool:
    """Kulcs-érvényesség: 1 szám lekérése is elég.
    401/403 → False (érvénytelen kulcs); egyéb hiba (pl. hálózat) → TelnyxError,
    hogy a felhasználó ne 'érvénytelen kulcs' üzenetet láthasson kiesésnél."""
    try:
        _request("GET", "/phone_numbers?limit=1", api_key)
        return True
    except TelnyxError as e:
        if e.status_code in (401, 403):
            return False
        raise


def list_numbers(api_key: str) -> list[dict]:
    """A fiókban lévő számok: [{number, id, status, connection_id}]"""
    data = _request("GET", "/phone_numbers?limit=100", api_key)
    out = []
    for n in data.get("data", []):
        out.append({
            "number": n.get("phone_number") or n.get("national_format"),
            "id": n.get("id"),
            "status": n.get("status"),
            "connection_id": n.get("connection_id"),
        })
    return out


DEFAULT_WHITELISTED_DESTINATIONS = ["HU"]


def classify_sip_error(exc: Exception) -> str:
    """A create_sip_participant kivételéből hívás-eredmény kategória
    (2026-10-09: eddig minden hiba generikus 500/'failed' volt, DB nélkül).
    web_server importálja a kimenő hívási végpontokhoz."""
    msg = str(exc or "").lower()
    if "not included in whitelisted" in msg or "whitelisted countries" in msg:
        return "rejected_whitelist"
    if "486" in msg or "busy" in msg:
        return "busy"
    if "404" in msg and "not found" in msg:
        return "invalid_number"
    if "no answer" in msg or "did not answer" in msg or "timeout" in msg or "unavailable" in msg:
        return "no_answer"
    if "declin" in msg or "rejected" in msg or "603" in msg:
        return "rejected"
    return "failed"


def ensure_outbound_voice_profile(api_key: str, saved_id: str | None, name: str) -> str:
    """Kimenő hívási profil — ha van elmentett ID, azt adja vissza.
    2026-10-09: az új profilok a Telnyx alapértelmezés szerint csak USA/CAN
    hívásra vannak engedélyezve (magyar számra SIP 403) — create-nél rögtön
    HU whitelist megy rá."""
    if saved_id:
        ensure_whitelist(api_key, saved_id)
        return saved_id
    data = _request("POST", "/outbound_voice_profiles", api_key, {
        "name": name,
        "traffic_type": "conversational",
        "service_plan": "global",
        "whitelisted_destinations": DEFAULT_WHITELISTED_DESTINATIONS,
    })
    return data.get("data", {}).get("id", "")


def ensure_whitelist(api_key: str, ovp_id: str,
                     destinations: list | None = None) -> list | None:
    """Az OVP whitelisted_destinations tartalmazzon legalább HU-t (idempotens).
    Meglévő értékhez HOZZÁAD (nem írja felül — más forgalom nem törik). None,
    ha az API nem engedi (portál-munka marad). Sosem dob."""
    try:
        want = sorted(set(destinations or DEFAULT_WHITELISTED_DESTINATIONS) | {"HU"})
        cur = _request("GET", f"/outbound_voice_profiles/{ovp_id}", api_key) \
            .get("data", {})
        current = cur.get("whitelisted_destinations") or []
        if set(want).issubset(set(current)):
            return current
        merged = sorted(set(current) | set(want))
        patched = _request("PATCH", f"/outbound_voice_profiles/{ovp_id}", api_key,
                           {"whitelisted_destinations": merged}).get("data", {})
        result = patched.get("whitelisted_destinations")
        logger.info(f"Telnyx OVP {ovp_id} whitelisted_destinations → {result}")
        return result
    except Exception as e:
        logger.warning(f"ensure_whitelist hiba (fail-open): {e}")
        return None


def ensure_fqdn_connection(api_key: str, saved_id: str | None, ovp_id: str, name: str) -> str:
    """FQDN connection (TCP, +E.164 ANI/DNIS formátumok). Visszaad: connection_id.
    2026-10-09: ha van ovp_id, a connection LÉTREHOZÁSKOR rá is linkelődik
    (korábban None maradt → az account-default OVP szabályozott, USA/CAN-only
    whitelist 403-at adott magyar számra)."""
    if saved_id:
        if ovp_id:
            _request("PATCH", f"/fqdn_connections/{saved_id}", api_key,
                     {"outbound_voice_profile_id": ovp_id})
        return saved_id
    data = _request("POST", "/fqdn_connections", api_key, {
        "active": True,
        "anchorsite_override": "Latency",
        "connection_name": name,
        "inbound": {"ani_number_format": "+E.164", "dnis_number_format": "+e164"},
        "transport_protocol": "TCP",
        **({"outbound_voice_profile_id": ovp_id} if ovp_id else {}),
    })
    return data.get("data", {}).get("id", "")


def ensure_fqdn(api_key: str, connection_id: str, sip_host: str) -> str:
    """FQDN rekord: a connection a LiveKit SIP endpointra mutat (port 5060).
    Idempotens: megnézi, van-e már FQDN a connectionen."""
    listing = _request("GET", "/fqdns?filter[connection_id]=" + connection_id, api_key)
    for fq in listing.get("data", []):
        if (fq.get("fqdn") or "").lower() == sip_host.lower():
            return fq.get("id", "")
    data = _request("POST", "/fqdns", api_key, {
        "connection_id": connection_id,
        "fqdn": sip_host,
        "port": 5060,
        "dns_record_type": "a",
    })
    return data.get("data", {}).get("id", "")


def associate_number(api_key: str, number_id: str, connection_id: str) -> None:
    """Szám hozzárendelése a connectionhez (PATCH)."""
    _request("PATCH", f"/phone_numbers/{number_id}", api_key, {"connection_id": connection_id})
