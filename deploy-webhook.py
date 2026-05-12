#!/usr/bin/env python3
"""
ThinkAI Deploy Webhook
~~~~~~~~~~~~~~~~~~~~~~
Lightweight GitHub webhook listener — triggers update.sh on push events.
Uses only Python stdlib, no extra dependencies.

Setup:
  1. Set WEBHOOK_SECRET env var (same as in GitHub webhook settings)
  2. Run:  python3 deploy-webhook.py
  3. Listens on port 9000 by default (WEBHOOK_PORT env var to change)
"""

import hashlib
import hmac
import json
import logging
import os
import subprocess
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
WEBHOOK_PORT = int(os.getenv("WEBHOOK_PORT", "9000"))
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
UPDATE_SCRIPT = os.path.join(SCRIPT_DIR, "update.sh")
LOG_FILE = os.path.join(SCRIPT_DIR, "deploy.log")
ALLOWED_BRANCHES = {"refs/heads/main", "refs/heads/master"}

# ── Logging ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("deploy-webhook")


def verify_signature(payload: bytes, signature: str) -> bool:
    """Verify GitHub HMAC-SHA256 webhook signature."""
    if not WEBHOOK_SECRET:
        log.warning("WEBHOOK_SECRET not set — skipping signature verification!")
        return True
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


def run_deploy():
    """Run update.sh in background thread."""
    log.info("Starting deploy...")
    try:
        result = subprocess.run(
            ["bash", UPDATE_SCRIPT],
            cwd=SCRIPT_DIR,
            capture_output=True,
            text=True,
            timeout=300,  # 5 min timeout
        )
        log.info(f"Deploy stdout:\n{result.stdout}")
        if result.stderr:
            log.warning(f"Deploy stderr:\n{result.stderr}")
        if result.returncode == 0:
            log.info("Deploy completed successfully.")
        else:
            log.error(f"Deploy failed with exit code {result.returncode}")
    except subprocess.TimeoutExpired:
        log.error("Deploy timed out after 5 minutes!")
    except Exception as e:
        log.error(f"Deploy error: {e}")


# ── Lock to prevent concurrent deploys ──────────────────────────
_deploy_lock = threading.Lock()


def trigger_deploy():
    """Trigger deploy in a background thread (with lock to prevent overlap)."""
    def _run():
        if not _deploy_lock.acquire(blocking=False):
            log.warning("Deploy already in progress — skipping.")
            return
        try:
            run_deploy()
        finally:
            _deploy_lock.release()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()


class WebhookHandler(BaseHTTPRequestHandler):

    def do_POST(self):
        if self.path != "/webhook":
            self.send_error(404)
            return

        # Read body
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 1_000_000:  # 1MB sanity limit
            self.send_error(413, "Payload too large")
            return
        body = self.rfile.read(content_length)

        # Verify signature
        signature = self.headers.get("X-Hub-Signature-256", "")
        if not verify_signature(body, signature):
            log.warning(f"Invalid signature from {self.client_address[0]}")
            self.send_error(403, "Invalid signature")
            return

        # Parse event
        event = self.headers.get("X-GitHub-Event", "")
        if event == "ping":
            log.info("Received ping from GitHub — webhook is working!")
            self._respond(200, {"status": "pong"})
            return

        if event != "push":
            log.info(f"Ignoring event: {event}")
            self._respond(200, {"status": "ignored", "event": event})
            return

        # Parse payload
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        ref = payload.get("ref", "")
        pusher = payload.get("pusher", {}).get("name", "unknown")

        if ref not in ALLOWED_BRANCHES:
            log.info(f"Ignoring push to {ref} (not in allowed branches)")
            self._respond(200, {"status": "ignored", "ref": ref})
            return

        log.info(f"Push to {ref} by {pusher} — triggering deploy!")
        trigger_deploy()
        self._respond(200, {"status": "deploying", "ref": ref, "pusher": pusher})

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {
                "status": "ok",
                "service": "thinkai-deploy-webhook",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            })
            return
        self.send_error(404)

    def _respond(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Suppress default access log — we handle our own logging
        pass


def main():
    if not os.path.isfile(UPDATE_SCRIPT):
        log.error(f"update.sh not found at {UPDATE_SCRIPT}")
        sys.exit(1)

    if not WEBHOOK_SECRET:
        log.warning("=" * 60)
        log.warning("  WEBHOOK_SECRET is not set!")
        log.warning("  Anyone can trigger deploys. Set it for production!")
        log.warning("=" * 60)

    server = HTTPServer(("0.0.0.0", WEBHOOK_PORT), WebhookHandler)
    log.info(f"Webhook listener started on port {WEBHOOK_PORT}")
    log.info(f"  POST /webhook  — GitHub webhook endpoint")
    log.info(f"  GET  /health   — Health check")
    log.info(f"  Allowed branches: {ALLOWED_BRANCHES}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
