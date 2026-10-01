# Cloudflare Tunnel Debugging (deployment server)

Notes for finishing the Docker + Cloudflare Tunnel deployment, written for a
Claude Code session running **on the deployment server** and for Derek.
General hosting docs: [docs/hosting.md](../docs/hosting.md).

## Known state (2026-10-01)

- The app runs under Docker Compose on the server:
  - `card-game-test-app-client-1`: nginx, published as `0.0.0.0:9000->80`
  - `card-game-test-app-server-1`: Node/Colyseus on `2567`, internal only
- `.env` sets `CLIENT_PORT=9000`, `COOKIE_SECURE=true`, `TRUST_PROXY=2`, and
  `PUBLIC_CLIENT_URL`.
- Two tunnels exist in the Cloudflare dashboard, and both are "Healthy":
  - **`card-table`**: created with the CLI (`cloudflared tunnel create`).
    Its connector is running somewhere on the host, and the dashboard shows
    **no routes**.
  - **`jennifer-tunnel`**: dashboard-managed and already serving one app. It
    runs in the container `obsidian-cloudflared`
    (`cloudflare/cloudflared:latest`), from a separate compose stack.
- Hostname history:
  - `doodle.jennifer.dereks.house` failed with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`.
    Cloudflare's free certificate covers only one subdomain level
    (`*.dereks.house`).
  - Switched to **`doodle.dereks.house`**, which now returns **HTTP 503**.

## Most likely cause of the 503

`doodle.dereks.house` probably routes to the `card-table` tunnel. When
cloudflared has no ingress rules loaded, it answers every request with 503. A
common reason is that `sudo cloudflared service install` reads
`/etc/cloudflared/config.yml`, while the config was written to
`~/.cloudflared/config.yml`.

Confirm this before changing anything:

```bash
# Which tunnel does the hostname point at? Look for the CNAME target <UUID>.cfargotunnel.com
cloudflared tunnel list                     # maps tunnel names to UUIDs
dig +short CNAME doodle.dereks.house        # proxied records may hide this; check the dashboard's DNS → Records if needed

# What is running card-table, and with what config?
systemctl status cloudflared
journalctl -u cloudflared -n 50 --no-pager
pgrep -a cloudflared
ls -l ~/.cloudflared /etc/cloudflared

# The dockerized connector
docker logs --tail 50 obsidian-cloudflared
```

## Fix A (recommended): one tunnel, `jennifer-tunnel`

1. Let the cloudflared container reach nginx by name:
   ```bash
   docker network connect card-game-test-app_default obsidian-cloudflared
   docker exec obsidian-cloudflared wget -qO- http://client/ | head -c 200   # may lack wget; skip if so
   ```
2. In the dashboard, under **jennifer-tunnel → Public hostnames → Add**:
   - Hostname: `doodle.dereks.house`
   - Service: **HTTP**, URL `client:80`

   If it reports that a DNS record already exists, delete the old `doodle`
   CNAME (the one pointing at `card-table`) under **DNS → Records** and retry.
3. Remove the `card-table` tunnel:
   ```bash
   sudo systemctl disable --now cloudflared   # only if installed as a service
   cloudflared tunnel delete card-table       # may need: cloudflared tunnel cleanup card-table
   ```
   Also delete any leftover `doodle.jennifer` DNS record.
4. Make the network attachment permanent. `docker network connect` is lost
   when the obsidian container is re-created. Add the network to the obsidian
   stack's compose file:
   ```yaml
   services:
     cloudflared:            # whatever the service is named there
       networks: [default, cardtable]
   networks:
     cardtable:
       external: true
       name: card-game-test-app_default
   ```
   The card-table stack must be up first, so that network exists.

## Fix B (alternative): keep `card-table`

The connector runs on the host, so `localhost:9000` reaches nginx.

```yaml
# /etc/cloudflared/config.yml
tunnel: <CARD-TABLE-UUID>
credentials-file: /etc/cloudflared/<CARD-TABLE-UUID>.json   # copy from ~/.cloudflared/
ingress:
  - hostname: doodle.dereks.house
    service: http://localhost:9000
  - service: http_status:404
```

```bash
cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
cloudflared tunnel route dns card-table doodle.dereks.house   # if the CNAME doesn't point here yet
sudo systemctl restart cloudflared
```

## Verify

```bash
curl -sI http://localhost:9000/ | head -1          # nginx up: 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9000/api/sets   # server reachable: 401
curl -sI https://doodle.dereks.house/ | head -1     # through the tunnel: 200
docker compose logs --tail 20 server               # expect 'Card table server listening'
```

Then, in a browser: register with `SIGNUP_PASSCODE`, check that login persists
after a reload (the cookie must be secure over HTTPS), create a room from
"Sample Set", and open it in a second browser. The second browser confirms that
the WebSocket at `/colyseus` works through the tunnel.

## Symptom → cause

| Symptom | Likely cause |
|---|---|
| `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` | Hostname is more than one level below `dereks.house` |
| 503 with an empty page | The connector has no ingress rule for the hostname, or the CNAME points at the wrong tunnel |
| 502 / "Bad gateway" | Ingress points at an address the connector can't reach, such as `localhost:9000` from inside the cloudflared container |
| 404 from cloudflared | The request hit the catch-all `http_status:404`; the hostname doesn't match the ingress rule |
| Page loads, but login doesn't stick | `COOKIE_SECURE` doesn't match the scheme, or the page was opened over http |
| Lobby works, but the room never connects | WebSocket at `/colyseus` is blocked; check nginx and the server logs |
| "Copy link" gives the wrong address | `PUBLIC_CLIENT_URL` in `.env` is stale; fix it and run `docker compose up -d` |

## Hardening once it works

- If traffic arrives through `client:80` (Fix A), port 9000 no longer has to be
  reachable from the network. In `docker-compose.yml`, change the client's port
  line to `"127.0.0.1:${CLIENT_PORT:-8080}:80"`.
- Set `TRUST_CLOUDFLARE_IP=true` only after that, because clients can't spoof
  `CF-Connecting-IP` once the tunnel is the only way in.
- Remove any router port forward for 9000 or 2567.
- Back up `AUTH_PEPPER` along with the data volume (see docs/hosting.md).

## Related fix

The Docker build needs the `client/Dockerfile` change that limits `npm ci` to
the `shared` and `client` workspaces. Without it, the client image fails trying
to compile `better-sqlite3`. Make sure the server has pulled that commit.
