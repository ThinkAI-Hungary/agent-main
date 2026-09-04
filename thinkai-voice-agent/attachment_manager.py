"""
Attachment Manager — ThinkAI Voice Agent
Securely stores and serves email attachments and embedded images.
Follows strict CWE-22 Path Traversal prevention rules.
"""

import os
import re
import secrets
import mimetypes
from pathlib import Path
from loguru import logger

THIS_DIR = Path(__file__).resolve().parent

# Persistent attachments directory:
# In Docker, /app/data is mounted to the persistent volume 'dobozos-data'.
DATA_DIR = Path("/app/data") if Path("/app/data").exists() else (THIS_DIR / "data")
ATTACHMENTS_DIR = (DATA_DIR / "attachments").resolve()
ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

# Maximum allowed attachment size: 15 MB
MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024

# Allowed file extensions allow-list
ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
    ".pdf", ".csv", ".xlsx", ".xls", ".docx", ".doc", ".txt"
}


def sanitize_filename(filename: str) -> str:
    """Sanitizes filename against path traversal and dangerous characters."""
    if not filename:
        return "unnamed_file"
    # Take only the basename (strips ../, / etc.)
    base = os.path.basename(filename.strip().replace("\\", "/"))
    # Separate stem and extension
    stem, ext = os.path.splitext(base)
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        # If extension is unknown/dangerous, safe fallback
        ext = ".bin" if not ext else f"{ext[:5]}.bin"
    # Clean stem: only alphanumeric, hyphen, underscore
    safe_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", stem)[:60]
    if not safe_stem:
        safe_stem = "attachment"
    return f"{safe_stem}{ext}"


def save_email_attachment(data: bytes, original_filename: str, content_type: str = "") -> dict | None:
    """
    Saves an email attachment into a unique, cryptographically random token folder.
    Returns metadata dictionary with the public capability URL, or None if rejected.
    """
    if not data:
        return None
    if len(data) > MAX_ATTACHMENT_SIZE:
        logger.warning(f"Csatolmány túl nagy ({len(data)} bájt), kihagyva: {original_filename}")
        return None

    safe_name = sanitize_filename(original_filename)
    # Generate 32-hex char random token (capability URL)
    token = secrets.token_hex(16)
    target_dir = (ATTACHMENTS_DIR / token).resolve()

    # Strict path traversal boundary check
    if not target_dir.is_relative_to(ATTACHMENTS_DIR):
        logger.error(f"Biztonsági hiba: célkönyvtár kívül esik a tárhelyen: {target_dir}")
        return None

    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = (target_dir / safe_name).resolve()

    if not target_file.is_relative_to(target_dir):
        logger.error(f"Biztonsági hiba: fájlnév traversal: {target_file}")
        return None

    try:
        with open(target_file, "wb") as f:
            f.write(data)
        logger.info(f"Csatolmány elmentve: {target_file} ({len(data)} bájt)")
    except Exception as e:
        logger.error(f"Nem sikerült menteni a csatolmányt ({safe_name}): {e}")
        return None

    guessed_mime, _ = mimetypes.guess_type(safe_name)
    final_mime = content_type or guessed_mime or "application/octet-stream"
    is_image = final_mime.startswith("image/") or safe_name.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif"))

    return {
        "token": token,
        "filename": safe_name,
        "url": f"/api/attachments/{token}/{safe_name}",
        "content_type": final_mime,
        "size": len(data),
        "is_image": is_image,
    }


def get_attachment_path(token: str, filename: str) -> Path | None:
    """
    Validates token and filename, returning the resolved Path if safe and exists.
    Strictly verifies directory boundaries against CWE-22 Path Traversal.
    """
    if not token or not filename:
        return None
    # Token must be exactly 32 hex characters
    if not re.match(r"^[a-f0-9]{32}$", token):
        return None

    # Filename must be a single basename
    safe_name = os.path.basename(filename.strip().replace("\\", "/"))
    if safe_name != filename:
        return None

    target_dir = (ATTACHMENTS_DIR / token).resolve()
    target_file = (target_dir / safe_name).resolve()

    # Strict containment check
    if not target_file.is_relative_to(ATTACHMENTS_DIR):
        return None
    if not target_file.is_file():
        return None

    return target_file
