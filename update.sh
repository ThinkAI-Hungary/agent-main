#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ThinkAI Update — szerveren futtatandó
# Használat:  bash update.sh           (pull + rebuild)
#             bash update.sh logs      (logok)
#             bash update.sh stop      (leállítás)
#             bash update.sh status    (státusz)
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Root ellenőrzés ──
if [ "$EUID" -ne 0 ]; then
  echo "❌ HIBA: root-ként futtasd! (sudo bash update.sh)"
  exit 1
fi

# ── docker elérhetőség ──
if ! command -v docker &>/dev/null; then
  echo "❌ HIBA: a docker nem elérhető ezen a gépen."
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
OLD_SHA=$(git rev-parse HEAD 2>/dev/null)

case "${1:-update}" in

  update)
    echo "🚀 ThinkAI Update"
    echo "   Branch: $BRANCH"

    echo ""
    echo "📥 Git pull..."
    git pull --ff-only 2>&1 | sed 's/^/   /'

    NEW_SHA=$(git rev-parse HEAD)
    if [ "$OLD_SHA" = "$NEW_SHA" ]; then
      echo "   ℹ️  Nincs új commit — a kód már a legfrissebb ($NEW_SHA)"
    else
      echo "   ✅ Frissítés: $(git rev-parse --short $OLD_SHA) → $(git rev-parse --short $NEW_SHA)"
      echo ""
      echo "   Új commitok:"
      git log --oneline "$OLD_SHA..$NEW_SHA" | sed 's/^/     /'
    fi

    echo ""
    if [ -d "../ugyfelszolg" ]; then
      echo "🔨 Docker rebuild (ugyfelszolg dobozos-agent)..."
      echo "   (első indulásnál másodpercek, kódváltozásnál 1-2 perc)"
      (cd ../ugyfelszolg && docker compose up -d --build dobozos-agent 2>&1 | grep -vE '^#|^time=|^\s*$' | sed 's/^/   /')

      echo ""
      echo "🧹 Régi image-ek takarítása..."
      docker image prune -f > /dev/null 2>&1 && echo "   ✅ Kész"
    else
      echo "❌ HIBA: ../ugyfelszolg mappa nem található — nincs mit rebuildelni."
      exit 1
    fi

    # Aktív konténer ellenőrzés
    sleep 2
    STATUS=$(cd ../ugyfelszolg && docker compose ps dobozos-agent --format '{{.Status}}' 2>/dev/null)
    echo ""
    if echo "$STATUS" | grep -qE 'Up|healthy'; then
      echo "✅ Frissítés sikeres! Konténer: $STATUS"
      echo "   Futó commit: $(git rev-parse --short HEAD) (branch: $BRANCH)"
    else
      echo "⚠️  A konténer esetleg nem indult el: $STATUS"
      echo "   Részletek: bash update.sh logs"
    fi
    ;;

  logs)
    docker compose logs -f --tail=100
    ;;

  stop)
    echo "🛑 Leállítás..."
    docker compose down
    ;;

  restart)
    echo "🔄 Újraindítás (build nélkül)..."
    docker compose restart
    docker compose ps
    ;;

  status)
    echo "📊 Konténerek:"
    docker compose ps
    echo ""
    echo "📍 Kód: branch=$(git rev-parse --abbrev-ref HEAD), commit=$(git rev-parse --short HEAD)"
    echo "   Utolsó commit: $(git log -1 --format='%s (%ar)')"
    echo ""
    echo "📜 Utolsó 20 sor log:"
    docker compose logs --tail=20
    ;;

  *)
    echo "Használat: bash update.sh [update|logs|stop|restart|status]"
    ;;
esac
