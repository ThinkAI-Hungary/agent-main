# ThinkAI Voice Agent — Szerver Telepítés

## Szerver adatok
- **IP**: `165.227.139.84`
- **OS**: Ubuntu 24.04 LTS
- **User**: `root`
- **Mappa**: `/root/dobozos`

---

## Első telepítés (egyszer)

### 1. SSH-zz be a szerverre

### 2. Telepítsd a szükséges csomagokat
```bash
apt-get update && apt-get install -y git docker.io docker-compose-plugin
systemctl enable docker && systemctl start docker
```

### 3. GitHub deploy key beállítása (privát repóhoz)
```bash
ssh-keygen -t ed25519 -C "thinkai-server" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```
A kiírt kulcsot másold be ide:
**GitHub → Repó → Settings → Deploy keys → Add deploy key**

### 4. Repó klónozása
```bash
git clone git@github.com:ledererb/agent-main.git /root/dobozos
```

### 5. Environment változók beállítása
```bash
nano /root/dobozos/thinkai-voice-agent/.env
```
Másold be az összes API kulcsot (LIVEKIT, DEEPGRAM, CARTESIA, SUPABASE, stb.)

### 6. Indítás
```bash
cd /root/dobozos
bash update.sh
```

---

## Frissítés (bármikor)

```bash
cd /root/dobozos && bash update.sh
```

Ez a háttérben: `git pull` + `docker compose up -d --build`

---

## Hasznos parancsok (szerveren)

| Parancs | Mit csinál |
|---|---|
| `bash update.sh` | Pull + rebuild + restart |
| `bash update.sh logs` | Logok nézése (élő) |
| `bash update.sh status` | Konténer státusz + utolsó logok |
| `bash update.sh restart` | Újraindítás (rebuild nélkül) |
| `bash update.sh stop` | Leállítás |

---

## Hibaelhárítás

```bash
# Konténer logok
docker compose logs -f --tail=200

# Health check
curl http://localhost:8000/api/health

# Konténerbe belépés
docker compose exec thinkai-agent bash

# Teljes újraépítés (cache nélkül)
docker compose build --no-cache && docker compose up -d
```
