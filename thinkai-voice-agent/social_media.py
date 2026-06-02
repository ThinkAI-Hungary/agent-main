"""
Instagram & Facebook Content Publishing API modul.

Használat:
    from social_media import publish_instagram_post, publish_facebook_post

Instagram Content Publishing API 2 lépéses:
    1. Container létrehozás (POST /{ig-user-id}/media)
    2. Publikálás (POST /{ig-user-id}/media_publish)

Facebook Page API:
    - Képes poszt: POST /{page-id}/photos
    - Szöveges poszt: POST /{page-id}/feed

A kép KÖTELEZŐEN publikusan elérhető URL-ről kell legyen.
"""

import os
import httpx
from loguru import logger

# ── Instagram Config ──
IG_TOKEN = os.getenv("META_INSTAGRAM_TOKEN", "")
IG_USER_ID = "26530155976686869"  # we_are_thinkai
IG_API_BASE = "https://graph.instagram.com/v19.0"

# ── Facebook Config ──
FB_TOKEN = os.getenv("META_FB_POST_TOKEN", "")
FB_PAGE_ID = "260528583811764"  # Think AI
FB_API_BASE = "https://graph.facebook.com/v19.0"


def _ig_headers():
    return {"Authorization": f"Bearer {IG_TOKEN}"}


async def publish_instagram_post(image_url: str, caption: str) -> dict:
    """Kép publikálása Instagramra.

    Args:
        image_url: Publikusan elérhető kép URL
        caption: Poszt szövege (caption + hashtagek)

    Returns:
        {"success": True, "media_id": "...", "ig_id": "..."} vagy
        {"success": False, "error": "..."}
    """
    if not IG_TOKEN:
        return {"success": False, "error": "META_INSTAGRAM_TOKEN nincs beállítva"}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Container létrehozás
            logger.info(f"IG publish step 1: container creation for image: {image_url[:60]}...")
            container_resp = await client.post(
                f"{IG_API_BASE}/{IG_USER_ID}/media",
                params={
                    "image_url": image_url,
                    "caption": caption,
                    "access_token": IG_TOKEN,
                }
            )
            container_data = container_resp.json()

            if "error" in container_data:
                error_msg = container_data["error"].get("message", "Ismeretlen hiba")
                logger.error(f"IG container creation error: {error_msg}")
                return {"success": False, "error": f"Instagram hiba: {error_msg}"}

            container_id = container_data.get("id")
            if not container_id:
                return {"success": False, "error": "Nem sikerült container-t létrehozni"}

            logger.info(f"IG container created: {container_id}")

            # Step 2: Publikálás
            publish_resp = await client.post(
                f"{IG_API_BASE}/{IG_USER_ID}/media_publish",
                params={
                    "creation_id": container_id,
                    "access_token": IG_TOKEN,
                }
            )
            publish_data = publish_resp.json()

            if "error" in publish_data:
                error_msg = publish_data["error"].get("message", "Ismeretlen hiba")
                logger.error(f"IG publish error: {error_msg}")
                return {"success": False, "error": f"Publikálási hiba: {error_msg}"}

            media_id = publish_data.get("id")
            logger.info(f"IG post published successfully! Media ID: {media_id}")

            return {
                "success": True,
                "media_id": media_id,
                "ig_id": media_id,
                "permalink": f"https://www.instagram.com/p/{media_id}/"
            }

    except Exception as e:
        logger.error(f"Instagram publish error: {e}")
        return {"success": False, "error": str(e)}


async def get_instagram_media(limit: int = 10) -> list:
    """Legutóbbi Instagram posztok lekérése.

    Returns:
        Lista: [{id, caption, timestamp, media_type, permalink}, ...]
    """
    if not IG_TOKEN:
        return []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{IG_API_BASE}/{IG_USER_ID}/media",
                params={
                    "fields": "id,caption,timestamp,media_type,permalink,like_count,comments_count",
                    "limit": limit,
                    "access_token": IG_TOKEN,
                }
            )
            data = resp.json()
            return data.get("data", [])
    except Exception as e:
        logger.error(f"IG media list error: {e}")
        return []


async def get_publishing_limit() -> dict:
    """Instagram publishing kvóta ellenőrzése.

    Returns:
        {"quota_total": 100, "quota_usage": 0}
    """
    if not IG_TOKEN:
        return {"quota_total": 0, "quota_usage": 0}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{IG_API_BASE}/{IG_USER_ID}/content_publishing_limit",
                params={
                    "fields": "config,quota_usage",
                    "access_token": IG_TOKEN,
                }
            )
            data = resp.json()
            items = data.get("data", [{}])
            config = items[0].get("config", {}) if items else {}
            usage = items[0].get("quota_usage", 0) if items else 0
            return {
                "quota_total": config.get("quota_total", 100),
                "quota_usage": usage
            }
    except Exception as e:
        logger.error(f"IG publishing limit error: {e}")
        return {"quota_total": 0, "quota_usage": 0}


# ═══════════════════════════════════════════════════
#  Facebook Page Publishing
# ═══════════════════════════════════════════════════

async def publish_facebook_post(caption: str, image_url: str = None) -> dict:
    """Poszt publikálása a Facebook Page-re.

    Args:
        caption: Poszt szövege
        image_url: Opcionális kép URL (ha nincs, szöveges poszt)

    Returns:
        {"success": True, "post_id": "..."} vagy
        {"success": False, "error": "..."}
    """
    if not FB_TOKEN:
        return {"success": False, "error": "META_FB_POST_TOKEN nincs beállítva"}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if image_url:
                # Képes poszt: POST /{page-id}/photos
                logger.info(f"FB photo post: image={image_url[:60]}...")
                resp = await client.post(
                    f"{FB_API_BASE}/{FB_PAGE_ID}/photos",
                    params={
                        "url": image_url,
                        "message": caption,
                        "access_token": FB_TOKEN,
                    }
                )
            else:
                # Szöveges poszt: POST /{page-id}/feed
                logger.info("FB text-only post")
                resp = await client.post(
                    f"{FB_API_BASE}/{FB_PAGE_ID}/feed",
                    params={
                        "message": caption,
                        "access_token": FB_TOKEN,
                    }
                )

            data = resp.json()

            if "error" in data:
                error_msg = data["error"].get("message", "Ismeretlen hiba")
                logger.error(f"FB publish error: {error_msg}")
                return {"success": False, "error": f"Facebook hiba: {error_msg}"}

            post_id = data.get("id") or data.get("post_id")
            logger.info(f"FB post published successfully! Post ID: {post_id}")

            return {
                "success": True,
                "post_id": post_id,
                "permalink": f"https://www.facebook.com/{post_id}" if post_id else None
            }

    except Exception as e:
        logger.error(f"Facebook publish error: {e}")
        return {"success": False, "error": str(e)}


async def get_facebook_posts(limit: int = 10) -> list:
    """Legutóbbi Facebook Page posztok lekérése."""
    if not FB_TOKEN:
        return []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{FB_API_BASE}/{FB_PAGE_ID}/posts",
                params={
                    "fields": "id,message,created_time,full_picture,permalink_url",
                    "limit": limit,
                    "access_token": FB_TOKEN,
                }
            )
            data = resp.json()
            return data.get("data", [])
    except Exception as e:
        logger.error(f"FB posts list error: {e}")
        return []


# ══════════════════════════════════════════════════════════════════
# SOCIAL ANALYTICS
# ══════════════════════════════════════════════════════════════════

async def get_instagram_post_insights(media_id: str) -> dict:
    """Egyedi IG poszt insights (like, comments, reach)."""
    if not IG_TOKEN or not media_id:
        return {}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Basic metrics from media endpoint
            resp = await client.get(
                f"{IG_API_BASE}/{media_id}",
                params={
                    "fields": "like_count,comments_count,timestamp,caption,media_url,permalink",
                    "access_token": IG_TOKEN,
                }
            )
            data = resp.json()
            result = {
                "likes": data.get("like_count", 0),
                "comments": data.get("comments_count", 0),
                "permalink": data.get("permalink", ""),
            }
            # Try insights (may require business account)
            try:
                resp2 = await client.get(
                    f"{IG_API_BASE}/{media_id}/insights",
                    params={
                        "metric": "reach,impressions",
                        "access_token": IG_TOKEN,
                    }
                )
                insights = resp2.json()
                for metric in insights.get("data", []):
                    result[metric["name"]] = metric["values"][0]["value"]
            except Exception:
                pass
            return result
    except Exception as e:
        logger.error(f"IG post insights error: {e}")
        return {}


async def get_facebook_post_insights(post_id: str) -> dict:
    """Egyedi FB poszt insights (reactions, comments, shares)."""
    if not FB_TOKEN or not post_id:
        return {}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{FB_API_BASE}/{post_id}",
                params={
                    "fields": "message,created_time,likes.limit(0).summary(true),comments.limit(0).summary(true),shares",
                    "access_token": FB_TOKEN,
                }
            )
            data = resp.json()
            return {
                "likes": data.get("likes", {}).get("summary", {}).get("total_count", 0),
                "comments": data.get("comments", {}).get("summary", {}).get("total_count", 0),
                "shares": data.get("shares", {}).get("count", 0),
            }
    except Exception as e:
        logger.error(f"FB post insights error: {e}")
        return {}


async def get_social_overview() -> dict:
    """Összesített social analytics: followers, page likes, recent engagement."""
    result = {
        "ig_followers": 0,
        "ig_media_count": 0,
        "fb_page_likes": 0,
        "fb_page_followers": 0,
        "recent_ig_posts": [],
        "recent_fb_posts": [],
    }

    async with httpx.AsyncClient(timeout=15) as client:
        # Instagram account info
        if IG_TOKEN:
            try:
                resp = await client.get(
                    f"{IG_API_BASE}/{IG_USER_ID}",
                    params={
                        "fields": "followers_count,media_count,username",
                        "access_token": IG_TOKEN,
                    }
                )
                data = resp.json()
                result["ig_followers"] = data.get("followers_count", 0)
                result["ig_media_count"] = data.get("media_count", 0)
                result["ig_username"] = data.get("username", "")
            except Exception as e:
                logger.warning(f"IG profile fetch error: {e}")

        # Facebook page info
        if FB_TOKEN:
            try:
                resp = await client.get(
                    f"{FB_API_BASE}/{FB_PAGE_ID}",
                    params={
                        "fields": "fan_count,followers_count,name",
                        "access_token": FB_TOKEN,
                    }
                )
                data = resp.json()
                result["fb_page_likes"] = data.get("fan_count", 0)
                result["fb_page_followers"] = data.get("followers_count", 0)
                result["fb_page_name"] = data.get("name", "")
            except Exception as e:
                logger.warning(f"FB page fetch error: {e}")

        # Recent IG posts with engagement
        if IG_TOKEN:
            try:
                resp = await client.get(
                    f"{IG_API_BASE}/{IG_USER_ID}/media",
                    params={
                        "fields": "id,like_count,comments_count,timestamp,permalink",
                        "limit": 6,
                        "access_token": IG_TOKEN,
                    }
                )
                result["recent_ig_posts"] = resp.json().get("data", [])
            except Exception:
                pass

        # Recent FB posts with engagement
        if FB_TOKEN:
            try:
                resp = await client.get(
                    f"{FB_API_BASE}/{FB_PAGE_ID}/posts",
                    params={
                        "fields": "id,message,created_time,likes.limit(0).summary(true),comments.limit(0).summary(true),shares",
                        "limit": 6,
                        "access_token": FB_TOKEN,
                    }
                )
                result["recent_fb_posts"] = resp.json().get("data", [])
            except Exception:
                pass

    return result
