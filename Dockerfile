# ── Stage 1: React Build ──────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app

# VITE_ változók build-time beleégetése (anon key — publikus, biztonságos)
ENV VITE_SUPABASE_URL=https://dsiluafthysysnstszbd.supabase.co
ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzaWx1YWZ0aHlzeXNuc3RzemJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5OTUsImV4cCI6MjA5NjE2Nzk5NX0.PjPmDTkc39V9f8mZqEq5gzFIcqyP_vXnUjGgPOtghOk

COPY thinkai-voice-agent/eaisydesk-frontend/package*.json ./
RUN npm ci
COPY thinkai-voice-agent/eaisydesk-frontend/ ./
RUN npx vite build

# ── Stage 2: Python App ───────────────────────────────────────────────────────
FROM python:3.12-slim

# ── System dependencies ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Requirements first (Docker layer cache — only rebuilds if requirements change) ──
COPY thinkai-voice-agent/requirements.txt ./requirements.txt
RUN grep -viE "^(pyreadline3|win32_setctime|sounddevice|colorama)" requirements.txt > /tmp/req-linux.txt && \
    pip install --no-cache-dir -r /tmp/req-linux.txt && \
    rm /tmp/req-linux.txt

# ── Application code ──
COPY thinkai-voice-agent/ ./

# ── React frontend build (statikus fájlok FastAPI-n keresztül) ──
COPY --from=frontend-build /app/dist ./frontend_dist

# ── Fix Windows CRLF line endings ──
RUN sed -i 's/\r$//' start.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["bash", "start.sh", "start"]
