"""
EAISY Marketing — Brevo Email Campaign API Helper

Brevo Campaign API hívások a marketing modulhoz.
Újra használja a meglévő Brevo API kulcsot (.env → BREVO_API_KEY).

Separate from tools.py to keep voice agent tools clean.
"""

import os
import json
import httpx
from loguru import logger


def _get_brevo_key() -> str:
    """Brevo API kulcs lekérése (tools.py mintájára, base64 fallback-kel)."""
    raw = os.getenv("BREVO_API_KEY", "")
    if raw and not raw.startswith("xkeysib-"):
        try:
            import base64
            decoded = base64.b64decode(raw).decode()
            return json.loads(decoded).get("api_key", raw)
        except Exception:
            pass
    return raw


BREVO_BASE = "https://api.brevo.com/v3"

# Default sender (EAISY Marketing)
DEFAULT_SENDER_NAME = "EAISY Marketing"
DEFAULT_SENDER_EMAIL = "hello@thinkai.hu"


def _headers():
    return {
        "api-key": _get_brevo_key(),
        "Content-Type": "application/json",
        "Accept": "application/json"
    }


# ═══════════════════════════════════════════════════════════════════════════════
# CONTACT LIST MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

async def ensure_marketing_list() -> int | None:
    """Biztosítja, hogy létezzen egy 'EAISY Marketing' nevű kontakt lista.
    Ha nem létezik, létrehozza. Visszaadja a lista ID-t."""
    try:
        async with httpx.AsyncClient() as client:
            # Check existing lists
            resp = await client.get(
                f"{BREVO_BASE}/contacts/lists",
                headers=_headers(),
                params={"limit": 50, "offset": 0},
                timeout=15
            )
            resp.raise_for_status()
            lists_data = resp.json()

            for lst in lists_data.get("lists", []):
                if lst.get("name") == "EAISY Marketing":
                    logger.info(f"Brevo list found: EAISY Marketing (id={lst['id']})")
                    return lst["id"]

            # Create new list
            resp = await client.post(
                f"{BREVO_BASE}/contacts/lists",
                headers=_headers(),
                json={"name": "EAISY Marketing", "folderId": 1},
                timeout=15
            )
            resp.raise_for_status()
            list_id = resp.json().get("id")
            logger.info(f"Brevo list created: EAISY Marketing (id={list_id})")
            return list_id
    except Exception as e:
        logger.error(f"Brevo ensure_marketing_list error: {e}")
        return None


async def sync_contact(email: str, name: str = "", list_id: int = None) -> str | None:
    """Feliratkozó szinkronizálása Brevo kontakt listára.
    Visszaadja a Brevo kontakt ID-t."""
    try:
        # Split name into first/last
        parts = name.split(" ", 1) if name else ["", ""]
        first_name = parts[0] if len(parts) > 0 else ""
        last_name = parts[1] if len(parts) > 1 else ""

        payload = {
            "email": email,
            "attributes": {"FIRSTNAME": first_name, "LASTNAME": last_name},
            "updateEnabled": True
        }
        if list_id:
            payload["listIds"] = [list_id]

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BREVO_BASE}/contacts",
                headers=_headers(),
                json=payload,
                timeout=15
            )
            # 201 = created, 204 = updated
            if resp.status_code in (201, 204):
                data = resp.json() if resp.status_code == 201 else {}
                contact_id = str(data.get("id", ""))
                logger.info(f"Brevo contact synced: {email}")
                return contact_id
            else:
                logger.warning(f"Brevo contact sync {resp.status_code}: {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Brevo sync_contact error: {e}")
        return None


async def sync_contacts_batch(subscribers: list[dict], list_id: int) -> int:
    """Feliratkozók tömeges szinkronizálása a Brevo listára.
    Visszaadja a sikeresen szinkronizált kontaktok számát."""
    try:
        contacts = []
        for sub in subscribers:
            parts = sub.get("name", "").split(" ", 1)
            contacts.append({
                "email": sub["email"],
                "attributes": {
                    "FIRSTNAME": parts[0] if parts else "",
                    "LASTNAME": parts[1] if len(parts) > 1 else ""
                }
            })

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BREVO_BASE}/contacts/import",
                headers=_headers(),
                json={
                    "listIds": [list_id],
                    "jsonBody": contacts,
                    "updateExistingContacts": True,
                    "emptyContactsAttributes": False
                },
                timeout=30
            )
            resp.raise_for_status()
            logger.info(f"Brevo batch sync: {len(contacts)} contacts")
            return len(contacts)
    except Exception as e:
        logger.error(f"Brevo sync_contacts_batch error: {e}")
        return 0


# ═══════════════════════════════════════════════════════════════════════════════
# CAMPAIGN MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

async def create_campaign(
    name: str,
    subject: str,
    html_content: str,
    list_id: int,
    sender_name: str = None,
    sender_email: str = None,
    subject_b: str = None
) -> str | None:
    """Kampány létrehozása a Brevo-ban. Visszaadja a Brevo kampány ID-t."""
    try:
        payload = {
            "name": name,
            "subject": subject,
            "sender": {
                "name": sender_name or DEFAULT_SENDER_NAME,
                "email": sender_email or DEFAULT_SENDER_EMAIL
            },
            "type": "classic",
            "htmlContent": html_content,
            "recipients": {"listIds": [list_id]}
        }

        if subject_b:
            payload["abTesting"] = True
            payload["subjectB"] = subject_b
            payload["splitRule"] = 50

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BREVO_BASE}/emailCampaigns",
                headers=_headers(),
                json=payload,
                timeout=20
            )
            if resp.status_code >= 400:
                logger.error(f"Brevo create_campaign {resp.status_code}: {resp.text}")
                return None
            campaign_id = str(resp.json().get("id", ""))
            logger.info(f"Brevo campaign created: {name} (id={campaign_id})")
            return campaign_id
    except Exception as e:
        logger.error(f"Brevo create_campaign error: {e}")
        return None


async def send_campaign_now(brevo_campaign_id: str) -> bool:
    """Kampány azonnali küldése."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BREVO_BASE}/emailCampaigns/{brevo_campaign_id}/sendNow",
                headers=_headers(),
                timeout=20
            )
            resp.raise_for_status()
            logger.info(f"Brevo campaign sent: {brevo_campaign_id}")
            return True
    except Exception as e:
        logger.error(f"Brevo send_campaign error: {e}")
        return False


async def schedule_campaign(brevo_campaign_id: str, scheduled_at: str) -> bool:
    """Kampány ütemezése egy jövőbeli időpontra (ISO 8601 formátum)."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{BREVO_BASE}/emailCampaigns/{brevo_campaign_id}",
                headers=_headers(),
                json={"scheduledAt": scheduled_at},
                timeout=15
            )
            resp.raise_for_status()
            logger.info(f"Brevo campaign scheduled: {brevo_campaign_id} → {scheduled_at}")
            return True
    except Exception as e:
        logger.error(f"Brevo schedule_campaign error: {e}")
        return False


async def get_campaign_stats(brevo_campaign_id: str) -> dict:
    """Kampány statisztikák lekérése Brevo-ból.
    Returns: {opens, clicks, bounces, unsubscribes, delivered, sent}

    A Brevo API két helyen tárolja a statokat:
    - globalStats: összesített (de néha 0-t mutat)
    - campaignStats: per-lista bontás (itt mindig van adat)
    Ha a globalStats üres, a campaignStats tömböt aggregáljuk.
    A megnyitás mezője 'uniqueViews' (NEM 'uniqueOpens'!).
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{BREVO_BASE}/emailCampaigns/{brevo_campaign_id}",
                headers=_headers(),
                timeout=15
            )
            resp.raise_for_status()
            data = resp.json()
            statistics = data.get("statistics", {})
            global_stats = statistics.get("globalStats", {})

            # Primary: globalStats
            opens = global_stats.get("uniqueViews", 0)
            clicks = global_stats.get("uniqueClicks", 0)
            bounces = global_stats.get("hardBounces", 0) + global_stats.get("softBounces", 0)
            unsubscribes = global_stats.get("unsubscriptions", 0)
            delivered = global_stats.get("delivered", 0)
            sent = global_stats.get("sent", 0)

            # Fallback: ha a globalStats üres, aggregáljuk a campaignStats tömböt
            if delivered == 0 and sent == 0:
                campaign_stats_list = statistics.get("campaignStats", [])
                for cs in campaign_stats_list:
                    opens += cs.get("uniqueViews", 0)
                    clicks += cs.get("uniqueClicks", 0)
                    bounces += cs.get("hardBounces", 0) + cs.get("softBounces", 0)
                    unsubscribes += cs.get("unsubscriptions", 0)
                    delivered += cs.get("delivered", 0)
                    sent += cs.get("sent", 0)

            logger.info(f"Brevo stats for campaign {brevo_campaign_id}: "
                        f"sent={sent}, delivered={delivered}, opens={opens}, "
                        f"clicks={clicks}, bounces={bounces}")

            return {
                "opens": opens,
                "clicks": clicks,
                "bounces": bounces,
                "unsubscribes": unsubscribes,
                "delivered": delivered,
                "sent": sent
            }
    except Exception as e:
        logger.error(f"Brevo get_campaign_stats error: {e}")
        return {"opens": 0, "clicks": 0, "bounces": 0, "unsubscribes": 0, "delivered": 0, "sent": 0}
