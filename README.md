# Card Game Testing App

Self-hosted multiplayer tabletop for prototyping physical card games. See [planning/project-spec.md](planning/project-spec.md) and [planning/data-models.md](planning/data-models.md) for the full design.

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
The Vite dev server automatically proxies HTTP requests for `/cards` and `/api` to the backend server.

Open [http://localhost:5173](http://localhost:5173) in your browser to access the application.

Other useful scripts:

```bash
npm run typecheck   # type-check all workspaces
npm run build       # build shared, server, and client
```

## Docker deployment

To run the application using Docker:

```bash
docker compose up --build
```

The application will be accessible at:
- **Client UI:** [http://localhost:8080](http://localhost:8080)
- **Colyseus/Express API:** `http://localhost:2567`

The local `cards/` directory is bind-mounted as a read-only volume into the server container. This means you can add, remove, or modify card assets (`.jpg`/`.png` and `.json`) locally, and the server will recognize them without requiring a container rebuild (a backend restart is required to load new cards).

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