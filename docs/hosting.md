# Hosting over HTTPS

This guide puts the Docker deployment on a public hostname with HTTPS using a
**Cloudflare Tunnel**. Once accounts exist (see
[planning/persistent-workspace.md](../planning/persistent-workspace.md)), HTTPS is
required. Without it, passwords and session cookies cross the internet in plain text.

A tunnel needs no router port forwarding, gives you a certificate automatically,
and keeps your home IP out of DNS. It also proxies WebSockets, which the table
needs, without extra configuration.

```text
browser ──HTTPS──▶ Cloudflare ──tunnel──▶ cloudflared ──HTTP──▶ nginx (CLIENT_PORT)
                                                                  ├─ /          client
                                                                  ├─ /api       server
                                                                  └─ /colyseus  server (WebSocket)
```

The browser only ever talks to one origin. nginx in the `client` container forwards
`/api`, `/cards`, and `/colyseus` to the server, so `CLIENT_PORT` is the only port the
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
```

Leave `PUBLIC_SERVER_URL` empty. The client reaches the server through the same
origin, which is what the tunnel serves. Run `docker compose up -d` after changing
`.env`; no rebuild is needed.

## 4. Close the old way in

Everything now arrives through the tunnel, so:

- remove any router port forward for `CLIENT_PORT` or `SERVER_PORT`;
- if the host has a firewall, it does not need to accept either port from outside.

## Settings that arrive with accounts

These do not exist yet. They arrive with the persistent-workspace work. When they
do, a tunnel deployment sets:

| Variable | Value behind a tunnel | Why |
|---|---|---|
| `COOKIE_SECURE` | `true` | Session cookies only travel over HTTPS. |
| `TRUST_PROXY` | the tunnel hop plus nginx | Login rate limits see the real client IP (taken from `CF-Connecting-IP`), not the proxy's. |

Local development stays plain `http://localhost` with `COOKIE_SECURE=false`.

## Alternatives

- **A DNS record pointing at a forwarded port** works, but serves no HTTPS.
  Cloudflare's proxied (orange-cloud) mode only accepts a fixed list of ports.
- **Caddy or another reverse proxy with its own certificate** is the alternative
  when a tunnel isn't available. Proxy everything to `CLIENT_PORT`, and make sure
  WebSocket upgrades are forwarded for `/colyseus`.

## Backing up the workspace

This applies once the workspace database exists. Today all state is in memory,
and cards live in `cards/`, which you already have.

All persistent data lives in one Docker volume (`DATA_DIR`, mounted as `data/`):

```text
data/
  workspace.db      accounts, sets, cards, decks
  images/           card artwork, named by content hash
```

Rooms are never backed up. They are temporary by design.

**Back up** with a consistent copy of the database plus the image files. Don't copy
`workspace.db` while the server is writing to it. Use SQLite's `VACUUM INTO`, which
produces a clean, consistent copy even while the server runs:

```bash
docker compose exec server sqlite3 /app/data/workspace.db \
  "VACUUM INTO '/app/data/backup-$(date +%F).db'"
docker compose cp server:/app/data/backup-$(date +%F).db ./backups/
docker compose cp server:/app/data/images ./backups/images
```

Image files are never modified once written, so copying them while the server runs
is safe. Copy them after the database, so every image the backup references is
present.

**Restore** with the server stopped:

```bash
docker compose stop server
# Copy the backup over workspace.db and merge the images directory into data/images.
docker compose start server
```

When restoring, remove any `workspace.db-wal` and `workspace.db-shm` files left beside
the old database, so SQLite doesn't replay a stale write-ahead log onto the restored
copy.

The exact container paths and the `sqlite3` binary depend on how the database work
lands. Update this section when it does.
