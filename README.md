# Card Game Testing App

Self-hosted multiplayer tabletop for prototyping physical card games.

A small shared workspace: people sign in, keep card **sets** in a library, and open
temporary **rooms** to play a set together. The table supports basic physical
operations such as tapping and untapping (via right-click menu), flipping
(double-clicking), stacking, shuffling stacks, and drawing from stacks.

No rulesets are supported; this is more like a basic Tabletop Simulator.

## Concepts

| Term | Meaning |
|---|---|
| **Set** | One version of the game, with its own cards. Sets are independent of each other. |
| **Card** | A card definition in a set: name, type, body text, and square artwork. |
| **Deck** | A saved list of cards and copy counts from one set. |
| **Room** | A temporary table bound to one set. It ends when everyone has left. |

Accounts, sets, cards, decks, and images persist in a SQLite database. Rooms and
everything placed on a table do not.

## Project layout

```text
shared/   shared TypeScript types, Zod schemas, protocol constants
server/   Node.js + Colyseus + Express (auth, library API, TableRoom)
client/   React + Vite + react-konva (tabletop UI)
cards/    sample card files (.jpg/.png + .json) for the importer
docs/     hosting and backup guide
```

This is an npm workspaces monorepo.

## Requirements

* Node.js 22+
* Docker + Docker Compose (for containerized deployment)

## Local development

```bash
npm install
AUTH_PEPPER=local-development-secret SIGNUP_PASSCODE=invite-code npm run dev
```

This starts the Colyseus/Express server on `:2567` and the Vite dev server on `:5173`.
The Vite dev server proxies `/api`, `/images`, and the Colyseus connection
(`/colyseus`) to the backend, so the client reaches everything through its own
origin, the same arrangement Docker uses.

The database and uploaded images go in `./data` (override with `DATA_DIR`).

Open [http://localhost:5173](http://localhost:5173), register with the signup code
(`invite-code` above), then import a set (see [Adding cards](#adding-cards)) so there is
something to play.

Other useful scripts:

```bash
npm test            # run server and client tests
npm run coverage    # tests plus coverage summaries; HTML in server/coverage and client/coverage
npm run typecheck   # type-check all workspaces
npm run build       # build shared, server, and client
```

## Docker deployment

```bash
cp .env.example .env   # set AUTH_PEPPER before starting
docker compose up --build
```

Defaults put the UI on [http://localhost:8080](http://localhost:8080). The server
is reachable only through the UI's nginx proxy.

### Configuration

Set these in `.env` (Compose reads it automatically):

| Variable | Default | What it does |
|---|---|---|
| `CLIENT_PORT` | `8080` | Port the UI is served on |
| `SERVER_PORT` | `2567` | Internal port shared by the server and nginx containers |
| `PUBLIC_CLIENT_URL` | *(empty)* | Address "Copy link" builds room links from. Empty means "the address this page was loaded from" |
| `AUTH_PEPPER` | *(required)* | Long server secret mixed into password hashes; never store it in the database |
| `SIGNUP_PASSCODE` | *(empty)* | Invite code required for registration; empty disables registration |
| `COOKIE_SECURE` | `false` | Set to `true` when serving the public site over HTTPS |
| `TRUST_PROXY` | `1` | Trusted reverse-proxy hop count for client IP/rate limiting |
| `TRUST_CLOUDFLARE_IP` | `false` | Rate-limit by `CF-Connecting-IP`; only when every request comes through Cloudflare |

So to fit a host that only exposes 9000–9999:

```ini
CLIENT_PORT=9000
SERVER_PORT=9001
```

### Remote hosting

**Only `CLIENT_PORT` needs to be reachable.** The client talks to the server through
its own origin, which nginx proxies to the server container, WebSocket included.
Nothing records the hostname, so the same image works on `localhost`, a LAN address,
or a public host with no rebuild.

The **Copy link** button builds its URL from the address the browser used, so a
session opened on the host itself copies a `localhost` link. Set
`PUBLIC_CLIENT_URL` to the address players should actually use, port included,
and every copied link points there:

```ini
PUBLIC_CLIENT_URL=http://my.serverurl.com:9000
```

Accounts require HTTPS on any non-local deployment. To serve the table on a public
hostname with HTTPS, see [docs/hosting.md](docs/hosting.md). It covers the
recommended Cloudflare Tunnel setup and how to back up and restore the workspace.

## Accounts

Everything except the login page requires an account. With `SIGNUP_PASSCODE` set,
people register in the browser using that code. With it empty, registration is off,
and accounts are created from the command line:

```bash
# Local development (prompts for the password):
AUTH_PEPPER='the-same-secret' npm run user:create -w server -- alice "Alice"

# In Docker (the container already has AUTH_PEPPER):
docker compose exec server node server/dist/auth/create-user.js alice "Alice"
```

The password is read from a prompt, or from `USER_CREATE_PASSWORD` if set. The prompt
does not hide what you type.

## Adding cards

Cards live in the workspace library. Import a folder of card files as a new set:

```bash
npm run cards:import -w server -- ./cards "Skirmish v1"
# In Docker; ./cards is mounted read-only at /app/cards:
docker compose exec server node server/dist/library/import-cards-cli.js /app/cards "Skirmish v1"
```

Each import creates a new, independent set. Re-importing the same folder creates a
second set rather than updating the first. Imported artwork is stored by content
hash under `DATA_DIR/images`.

The browser library supports creating, renaming, archiving, restoring, forking, and
exporting sets. A set's Cards tab provides search, type filtering, image upload and
reuse, and live card previews. Its Decks tab supports manual deck building and seeded
random generation.

### Card file format

Each card is two files with the **same filename stem** (e.g., `fireball.jpg` and
`fireball.json`).

1. **Image file (`.jpg` or `.png`)**
   - Must be a square image.
   - Dimensions must be between 32px and 512px.

2. **JSON definition file (`.json`)**
   - Must contain the following minimum fields:
     ```json
     {
       "id": "unique-card-id",
       "type": "card-type",
       "body": "Card description or rules text."
     }
     ```
   - **`id`**: A unique identifier within the folder. The importer rejects duplicates.
     Library cards get new IDs; the file's `id` is kept as `metadata.sourceId`.
   - **`type`**: The card type (e.g., "spell", "item", "creature").
   - **`body`**: The text shown on the bottom half of the card.
   - *Optional*: Any additional fields are preserved in the card's `metadata`.
   - The display name comes from the filename: `red_potion.png` becomes "Red Potion".

## Usage guide

This app provides a generic, unopinionated tabletop environment. It does not enforce
game rules; it provides the primitives to simulate physical card interactions:

1. **Rooms:** Sign in, pick a set, name the room, and create it. Share the room link
   with other signed-in players. A room ends when the last person leaves.
2. **Card browser:** Open the side panel to browse the cards of the room's set.
3. **Spawning cards and decks:** Drag a card onto the table, deal a saved deck, or
   generate and deal a shuffled deck from the side panel.
4. **Basic interactions:**
   - **Move:** Drag and drop cards anywhere on the table.
   - **Preview:** Hover over a card to view a magnified preview.
   - **Context menu:** Right-click a card to **Tap/Untap**, **Flip** (face-up/face-down),
     or **Delete** it.
5. **Stacks:**
   - **Create:** Drag one standalone card onto another card (both must be facing the
     same way) to stack them.
   - **Interact:** Dragging a stack moves the entire stack. Right-clicking a stack lets
     you draw the top card, shuffle, or delete the stack.
6. **Board image:** **Download board image** in the room panel saves a PNG of the
   whole table.
7. **Room lifecycle:** Anyone can edit the room details or end the room. Idle rooms
   show a warning before closing; **Keep open** resets the timer.

## Test cards

Test card art is from Dungeon Crawl Stone Soup, used under the CC0 Public Domain License.

[OpenGameArt: Dungeon Crawl 32x32 tiles supplemental](https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental)

> You can use these tilesets in your program freely. No attribution is required. As a courtesy, include a link to the OGA page: [http://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental](http://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental), or the crawl-tiles page: [https://github.com/crawl/tiles](https://github.com/crawl/tiles)
