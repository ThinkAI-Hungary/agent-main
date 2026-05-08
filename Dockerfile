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

# ── Fix Windows CRLF line endings ──
RUN sed -i 's/\r$//' start.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["bash", "start.sh", "start"]
