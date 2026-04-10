# revinjun.com

Source for [revinjun.com](https://revinjun.com) and the Tractor card game at
[revinjun.com/tractor](https://revinjun.com/tractor).

## Structure

- `website/` — static portfolio site (HTML/CSS/JS) served at `/`. Includes
  Node.js proxies for Spotify and gaming (Steam + Riot) APIs.
- `tractor/` — multiplayer Tractor (Sheng Ji) card game (React + Node + WebSocket)
  served under `/tractor`.

## Local development

### Website

```bash
cd website
cp .env.example .env  # fill in your API credentials
node spotify-proxy.js   # port 3003
node gaming-proxy.js    # port 3004
# then open index.html
```

### Tractor

```bash
cd tractor
npm install
npm run dev   # client on :8080, server on :8081
```

## Deployment

Both run on a single VPS behind nginx:

- nginx serves `website/` statically at `/`
- nginx proxies `/api/spotify` -> spotify-proxy (pm2, port 3003)
- nginx proxies `/api/gaming` -> gaming-proxy (pm2, port 3004)
- nginx proxies `/tractor/` -> tractor server (pm2, port 8081)

Secrets live in `/var/www/revinjun.com/.env` (not in git).
