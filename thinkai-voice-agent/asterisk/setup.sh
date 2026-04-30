#!/bin/bash
# ============================================================
# ThinkAI – Asterisk SIP bridge telepítő
# Ubuntu 24.04 LTS | Architektúra: Telefonalo.hu → Asterisk → LiveKit API callback
# Futtatás: sudo bash asterisk/setup.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && err "Root jogosultság szükséges: sudo bash asterisk/setup.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Publikus IP ---
log "Publikus IP lekérése..."
PUB_IP=$(curl -s --max-time 5 ifconfig.me || curl -s --max-time 5 api.ipify.org)
[[ -z "$PUB_IP" ]] && err "Nem sikerült lekérni a publikus IP-t."
log "Publikus IP: $PUB_IP"

# --- Asterisk telepítése ---
log "Asterisk telepítése..."
apt-get update -qq
apt-get install -y asterisk > /dev/null
log "Asterisk verzió: $(asterisk -V)"

# --- Python függőségek ---
log "Python LiveKit SDK telepítése..."
pip3 install livekit livekit-api --break-system-packages -q
log "LiveKit SDK telepítve"

# --- Konfig fájlok másolása ---
log "Konfig fájlok másolása..."
cp "$SCRIPT_DIR/pjsip.conf"      /etc/asterisk/pjsip.conf
cp "$SCRIPT_DIR/extensions.conf" /etc/asterisk/extensions.conf
cp "$SCRIPT_DIR/logger.conf"     /etc/asterisk/logger.conf

# Publikus IP behelyettesítése
sed -i "s/165.227.139.84/$PUB_IP/g" /etc/asterisk/pjsip.conf
log "pjsip.conf: IP → $PUB_IP"

# --- Trigger script ---
log "lk_trigger.py másolása..."
cp "$SCRIPT_DIR/lk_trigger.py" /opt/lk_trigger.py
# IP frissítése a trigger scriptben
sed -i "s/165.227.139.84/$PUB_IP/g" /opt/lk_trigger.py
log "lk_trigger.py: IP → $PUB_IP"

# --- Asterisk újraindítás ---
log "Asterisk újraindítása..."
systemctl enable asterisk
systemctl restart asterisk
sleep 3

if systemctl is-active --quiet asterisk; then
    log "Asterisk fut!"
else
    err "Asterisk nem indult el. Ellenőrizd: journalctl -u asterisk -n 50"
fi

# --- Tűzfal ---
if command -v ufw &>/dev/null; then
    warn "UFW tűzfal szabályok hozzáadása..."
    ufw allow 5060/udp comment "Asterisk SIP"
    ufw allow 10000:20000/udp comment "Asterisk RTP"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN} Asterisk sikeresen telepítve!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e " Szerver IP:  ${YELLOW}$PUB_IP${NC}"
echo ""
echo " Regisztráció ellenőrzése (30 mp után):"
echo "  asterisk -rx 'pjsip show registrations'"
echo ""
echo " LiveKit outbound trunk létrehozása (egyszer kell):"
echo "  python3 asterisk/create_outbound_trunk.py"
echo ""
echo " Hívás log figyelése:"
echo "  tail -f /var/log/asterisk/full"
echo ""
