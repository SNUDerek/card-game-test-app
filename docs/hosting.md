# Hosting over HTTPS

This guide puts the Docker deployment on a public hostname with HTTPS using a
**Cloudflare Tunnel**. The workspace has accounts, so HTTPS is required on any
public deployment. Without it, passwords and session cookies cross the internet in
plain text.

A tunnel needs no router port forwarding, gives you a certificate automatically,
and keeps your home IP out of DNS. It also proxies WebSockets, which the table
needs, without extra configuration.

```text
browser ──HTTPS──▶ Cloudflare ──tunnel──▶ cloudflared ──HTTP──▶ nginx (CLIENT_PORT)
                                                                  ├─ /          client
                                                                  ├─ /api       server
                                                                  ├─ /images    server (card artwork)
                                                                  └─ /colyseus  server (WebSocket)
```

The browser only ever talks to one origin. nginx in the `client` container forwards
`/api`, `/images`, and `/colyseus` to the server, so `CLIENT_PORT` is the only port the
tunnel has to reach.

## Before you start

- A domain whose DNS is managed by Cloudflare (the free plan is enough).
- The app running with `docker compose up -d` on the host, reachable at
  `http://localhost:${CLIENT_PORT}`.
- `cloudflared` installed on the same host. See Cloudflare's
  [downloads page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

## 1. Create the tunnel

```bash
cloudflared tunnel login                  # opens a browser; pick your domain
cloudflared tunnel create card-table      # prints a tunnel UUID and writes credentials
cloudflared tunnel route dns card-table cards.example.com
```

`route dns` creates a proxied CNAME for `cards.example.com` that points at the tunnel.

## 2. Configure ingress

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /home/<user>/.cloudflared/<TUNNEL-UUID>.json

ingress:
  # Everything for this hostname goes to nginx in the client container.
  - hostname: cards.example.com
    service: http://localhost:9000        # your CLIENT_PORT
  # Required catch-all.
  - service: http_status:404
```

Check it and try it in the foreground:

```bash
cloudflared tunnel ingress validate
cloudflared tunnel run card-table
```

Then open `https://cards.example.com`. The client sees the `https:` page and connects
its socket over `wss:` to the same host on its own. Once that works, install the tunnel
as a service so it survives reboots:

```bash
sudo cloudflared service install
```

> **Dashboard-managed tunnels** work too. Create the tunnel under *Zero Trust →
> Networks → Tunnels*. Add a public hostname with service `http://localhost:9000`,
> then run the connector with the token the dashboard gives you.

## 3. Point the app at its public address

In `.env`:

```ini
# "Copy link" should hand out the public address, not localhost.
PUBLIC_CLIENT_URL=https://cards.example.com
# Session cookies only travel over HTTPS.
COOKIE_SECURE=true
# cloudflared and nginx are both proxies in front of the server.
TRUST_PROXY=2
# Optional: every request arrives through Cloudflare, so its client-IP header is safe.
TRUST_CLOUDFLARE_IP=true
```

There is no server URL to configure. The client reaches the server through its own
origin, which is what the tunnel serves. Run `docker compose up -d` after changing
`.env`; no rebuild is needed.

| Variable | Value behind a tunnel | Why |
|---|---|---|
| `COOKIE_SECURE` | `true` | The browser only sends the session cookie over HTTPS. |
| `TRUST_PROXY` | `2` (cloudflared, then nginx) | Login rate limits see the real client IP, not the proxy's. |
| `TRUST_CLOUDFLARE_IP` | `true`, only if every request comes through Cloudflare | Reads `CF-Connecting-IP` directly. Leave it `false` if the app is also reachable another way, because clients could spoof the header. |

Local development stays plain `http://localhost` with `COOKIE_SECURE=false`.

## 4. Close the old way in

Everything now arrives through the tunnel, so:

- remove any router port forward for `CLIENT_PORT` or `SERVER_PORT`;
- if the host has a firewall, it does not need to accept either port from outside.

## Alternatives

- **A DNS record pointing at a forwarded port** works, but serves no HTTPS.
  Cloudflare's proxied (orange-cloud) mode only accepts a fixed list of ports.
- **Caddy or another reverse proxy with its own certificate** is the alternative
  when a tunnel isn't available. Proxy everything to `CLIENT_PORT`, and make sure
  WebSocket upgrades are forwarded for `/colyseus`.

## Backing up the workspace

All persistent data lives in the `workspace-data` Docker volume, mounted at
`/app/data` (`DATA_DIR`) in the server container:

```text
data/
  workspace.db      accounts, sets, cards, decks
  images/           card artwork, named by content hash
```

Rooms are never backed up. They are temporary by design.

**Back up** with a consistent copy of the database plus the image files. Don't copy
`workspace.db` while the server is writing to it. Use SQLite's `VACUUM INTO`, which
produces a clean, consistent copy even while the server runs. The server image has no
`sqlite3` binary, so run it through Node and the server's own SQLite driver:

```bash
BACKUP=backup-$(date +%F).db
docker compose exec server node -e \
  "require('better-sqlite3')('/app/data/workspace.db').exec(\"VACUUM INTO '/app/data/$BACKUP'\")"
mkdir -p backups
docker compose cp server:/app/data/$BACKUP ./backups/
docker compose cp server:/app/data/images ./backups/images
docker compose exec server rm /app/data/$BACKUP
```

Keep `AUTH_PEPPER` with your backups. Password hashes cannot be checked without it,
so a restored database with a different pepper locks everyone out.

Image files are never modified once written, so copying them while the server runs
is safe. Copy them after the database, so every image the backup references is
present.

**Restore** with the server stopped. Remove any `workspace.db-wal` and
`workspace.db-shm` files left beside the old database first, so SQLite doesn't replay a
stale write-ahead log onto the restored copy:

```bash
docker compose stop server
docker compose run --rm --no-deps server \
  rm -f /app/data/workspace.db-wal /app/data/workspace.db-shm
docker compose cp ./backups/backup-YYYY-MM-DD.db server:/app/data/workspace.db
docker compose cp ./backups/images/. server:/app/data/images/
docker compose start server
```
