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


def ensure_outbound_voice_profile(api_key: str, saved_id: str | None, name: str) -> str:
    """Kimenő hívási profil — ha van elmentett ID, azt adja vissza."""
    if saved_id:
        return saved_id
    data = _request("POST", "/outbound_voice_profiles", api_key, {
        "name": name,
        "traffic_type": "conversational",
        "service_plan": "global",
    })
    return data.get("data", {}).get("id", "")


def ensure_fqdn_connection(api_key: str, saved_id: str | None, ovp_id: str, name: str) -> str:
    """FQDN connection (TCP, +E.164 ANI/DNIS formátumok). Visszaad: connection_id.
    NOTE: a CreateFqdnConnection sémához NEM tartoznak user_name/password mezők
    (azok a credential_connections-hoz valók) — a digest-auth külön FQDN auth
    endpointokon kezelhető, ha egyszer szükség lesz rá."""
    if saved_id:
        return saved_id
    # V1: outbound profile NEM megy a create-be — a Telnyx megköveteli, hogy a
    # connection előbb teljesen konfigurált legyen (FQDN rekord), és a
    # 'short duration' profilokat 422-vel elutasítja call-control connectionnél.
    # Az ovp_id V2-ben PATCH-elhető rá, miután a FQDN felkerült.
    data = _request("POST", "/fqdn_connections", api_key, {
        "active": True,
        "anchorsite_override": "Latency",
        "connection_name": name,
        "inbound": {"ani_number_format": "+E.164", "dnis_number_format": "+e164"},
        "transport_protocol": "TCP",
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
