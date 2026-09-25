# Card Game Testing App

Self-hosted multiplayer tabletop for prototyping physical card games. 

Dynamically loads card data from images and json files.  
Add a folder of cards (images and json files) to the `/cards` directory to add cards to the game.

Allows for basic operations such as tapping and untapping (via right-click menu), flipping (double-clicking), stacking, shuffling stacks, and drawing from stacks.

No rulesets supported, this is more like a basic Tabletop Simulator.

## Project layout

```text
shared/   shared TypeScript types, Zod schemas, protocol constants
server/   Node.js + Colyseus + Express (card catalog API, TableRoom)
client/   React + Vite + react-konva (tabletop UI)
cards/    card artwork (.jpg/.png) + matching .json definitions
```

This is an npm workspaces monorepo.

## Requirements

* Node.js 22+
* Docker + Docker Compose (for containerized deployment)

## Local development

```bash
npm install
npm run dev
```

This starts the Colyseus/Express server on `:2567` and the Vite dev server on `:5173`.
The Vite dev server proxies `/cards`, `/api`, and the Colyseus connection (`/colyseus`)
to the backend, so the client reaches everything through its own origin — the same
arrangement Docker uses.

Open [http://localhost:5173](http://localhost:5173) in your browser to access the application.

Other useful scripts:

```bash
npm run typecheck   # type-check all workspaces
npm run build       # build shared, server, and client
```

## Docker deployment

```bash
cp .env.example .env   # optional; defaults are 8080 and 2567
docker compose up --build
```

Defaults put the UI on [http://localhost:8080](http://localhost:8080) and the server
on `:2567`.

### Configuring ports

Set these in `.env` (Compose reads it automatically):

| Variable | Default | What it does |
|---|---|---|
| `CLIENT_PORT` | `8080` | Port the UI is served on |
| `SERVER_PORT` | `2567` | Port the server listens on, inside and outside the container |
| `PUBLIC_SERVER_URL` | *(empty)* | Where browsers reach the server. Empty means "this same origin" |
| `PUBLIC_CLIENT_URL` | *(empty)* | Address "Copy link" builds room links from. Empty means "the address this page was loaded from" |

So to fit a host that only exposes 9000–9999:

```ini
CLIENT_PORT=9000
SERVER_PORT=9001
```

### Remote hosting

**Only `CLIENT_PORT` needs to be reachable.** The client talks to the server through
its own origin under `/colyseus`, which nginx proxies to the server container —
WebSocket included. Nothing records the hostname, so the same image works on
`localhost`, a LAN address, or a public host with no rebuild.

The **Copy link** button builds its URL from the address the browser used, so a
session opened on the host itself copies a `localhost` link. Set
`PUBLIC_CLIENT_URL` to the address players should actually use, port included,
and every copied link points there:

```ini
PUBLIC_CLIENT_URL=http://my.serverurl.com:9000
```

Set `PUBLIC_SERVER_URL` **only** if you want browsers to reach the server directly
instead of through the proxy — then `SERVER_PORT` must be reachable too:

```ini
PUBLIC_SERVER_URL=http://my.serverurl.com:9001
```

Use `https://` when serving over TLS; the client upgrades the socket to `wss://`
on its own.

`PUBLIC_SERVER_URL` is applied when the container starts, not when the image is
built, so changing it only needs `docker compose up -d`. (The older
`VITE_COLYSEUS_URL` still works for `npm run dev`, but being a Vite variable it is
inlined at build time and cannot configure a built image.)

The local `cards/` directory is bind-mounted as a read-only volume into the server container. This means you can add, remove, or modify card assets (`.jpg`/`.png` and `.json`) locally, and the server will recognize them without requiring a container rebuild (a backend restart is required to load new cards).

## Adding or Modifying Cards

To add or modify cards in the game, place a matching pair of image and JSON files into the `cards/` directory. The server loads these dynamically at startup.

### File Requirements
Each card requires two files with the **same filename stem** (e.g., `fireball.jpg` and `fireball.json`).

1. **Image File (`.jpg` or `.png`)**
   - Must be a square image.
   - Dimensions must be between 32px and 512px.

2. **JSON Definition File (`.json`)**
   - Must contain the following minimum fields:
     ```json
     {
       "id": "unique-card-id",
       "type": "card-type",
       "body": "Card description or rules text."
     }
     ```
   - **`id`**: A unique string identifier for the card definition. (The server will reject duplicate IDs).
   - **`type`**: A string representing the card type (e.g., "spell", "item", "creature").
   - **`body`**: A string containing the text to be displayed on the bottom half of the card.
   - *Optional*: Any additional fields you include in the JSON will be preserved and passed along in a `metadata` object to the client. The card's display name is automatically derived from the filename, but you can also explicitly provide a `name` field in the JSON.

> [!NOTE]
> If you are running the app locally or via Docker, you must **restart the backend server** for it to load the new or modified card assets into the catalog.

## Usage Guide

This app provides a generic, unopinionated tabletop environment. It does not enforce specific game rules but rather provides the primitives to simulate physical card interactions:

1. **Lobby & Rooms:** Start by creating a room in the lobby (with an optional password). Share the generated URL with other players to let them join your table.
2. **Card Browser:** Open the side panel to browse available cards loaded from the server's `cards/` directory.
3. **Spawning Cards:** Drag any card from the card browser directly onto the tabletop.
4. **Basic Interactions:**
   - **Move:** Drag and drop cards anywhere on the table.
   - **Preview:** Hover over a card to view a magnified preview.
   - **Context Menu:** Right-click a card to bring up the context menu, where you can **Tap/Untap**, **Flip** (face-up/face-down), or **Delete** the card.
5. **Stacks:**
   - **Create:** Drag one standalone card onto another card (both must be facing the same way) to stack them.
   - **Interact:** Dragging a stack moves the entire stack. Right-clicking a stack allows you to draw the top card, delete the stack, or flip the top card.

## test cards

test card art is from Dungeon Crawl Stone Soup, used under the CC0 Public Domain License.

[OpenGameArt: Dungeon Crawl 32x32 tiles supplemental](https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental)

> You can use these tilesets in your program freely. No attribution is required. As a courtesy, include a link to the OGA page: [http://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental](http://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental), or the crawl-tiles page: [https://github.com/crawl/tiles](https://github.com/crawl/tiles)