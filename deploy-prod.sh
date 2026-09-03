#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Production deploy — stagingről futtatandó, SSH-n keresztül
# A production maga pullolja a kódot a GitHubról (NEM átmásolás van).
#
# Használat:  bash deploy-prod.sh          (megerősítéssel)
#             bash deploy-prod.sh --yes    (kérdezés nélkül)
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROD_HOST="root@159.69.158.245"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
LOCAL_SHA=$(git rev-parse HEAD)
ORIGIN_SHA=$(git rev-parse origin/"$BRANCH" 2>/dev/null)

# ── 1. A lokális kód pusholva van a GitHubra? ──
if [ "$LOCAL_SHA" != "$ORIGIN_SHA" ]; then
  echo "⚠️  A lokális commit ($LOCAL_SHA) nincs pusholva — origin/$BRANCH: $ORIGIN_SHA"
  echo "   A production a GitHubról pullol, tehát előbb: git push origin $BRANCH"
  exit 1
fi

# ── 2. Milyen állapotban van a production? ──
REMOTE_SHA=$(ssh -o ConnectTimeout=10 "$PROD_HOST" "cd /root/dobozos && git rev-parse HEAD" 2>/dev/null)
if [ -z "$REMOTE_SHA" ]; then
  echo "❌ HIBA: a production ($PROD_HOST) nem elérhető SSH-n."
  exit 1
fi

if [ "$REMOTE_SHA" = "$ORIGIN_SHA" ]; then
  echo "ℹ️  A production már naprakész ($(git rev-parse --short $REMOTE_SHA)). Nincs teendő."
  exit 0
fi

echo "🚀 Production deploy"
echo "   Production most: $(git rev-parse --short $REMOTE_SHA)"
echo "   Deployolandó:    $(git rev-parse --short $ORIGIN_SHA) (branch: $BRANCH)"
echo ""
echo "   Új commitok, amik felmennek:"
git log --oneline "$REMOTE_SHA..$ORIGIN_SHA" | sed 's/^/     /'
echo ""

# ── 3. Megerősítés ──
if [ "$1" != "--yes" ]; then
  read -p "❓ Biztosan deployolsz a LIVE szerverre? (igen/nem): " ans
  if [ "$ans" != "igen" ]; then
    echo "Megszakítva."
    exit 1
  fi
fi

echo ""
echo "📥 Production: git pull + rebuild..."
ssh "$PROD_HOST" "cd /root/dobozos && bash update.sh"

# ── 4. Eredmény ellenőrzés ──
echo ""
echo "🔍 Ellenőrzés:"
FINAL=$(ssh "$PROD_HOST" "cd /root/dobozos && git rev-parse --short HEAD; cd ../ugyfelszolg && docker compose ps dobozos-agent --format '{{.Status}}'" 2>/dev/null)
echo "$FINAL" | while read -r line; do echo "   $line"; done

FINAL_SHA=$(echo "$FINAL" | head -1)
if [ "$FINAL_SHA" = "$(git rev-parse --short $ORIGIN_SHA)" ]; then
  echo ""
  echo "✅ Deploy sikeres — a production a legfrissebb kódot futtatja."
else
  echo ""
  echo "⚠️  A production commitja: $FINAL_SHA — ellenőrizd a fenti kimenetet!"
fi
