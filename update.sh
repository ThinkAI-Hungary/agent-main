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

case "${1:-update}" in

  update)
    echo " Git pull..."
    git pull

    echo " Docker build + restart..."
    docker compose up -d --build

    if [ -d "../ugyfelszolg" ]; then
      echo " Rebuilding ugyfelszolg dobozos-agent..."
      (cd ../ugyfelszolg && docker compose up -d --build dobozos-agent)
    fi

    echo " Régi image-ek takarítása..."
    docker image prune -f

    echo ""
    echo " Frissítés kész!"
    docker compose ps
    ;;

  logs)
    docker compose logs -f --tail=100
    ;;

  stop)
    echo " Leállítás..."
    docker compose down
    ;;

  restart)
    echo " Újraindítás..."
    docker compose restart
    ;;

  status)
    docker compose ps
    echo ""
    docker compose logs --tail=20
    ;;

  *)
    echo "Használat: bash update.sh [update|logs|stop|restart|status]"
    ;;
esac
