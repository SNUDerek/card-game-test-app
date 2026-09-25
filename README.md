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

This starts the Colyseus/Express server on `:2567` and the Vite dev server on `:5173` (proxying `/cards` to the server).

Other useful scripts:

```bash
npm run typecheck   # type-check all workspaces
npm run build        # build shared, server, and client
```

## Docker

```bash
docker compose up --build
```

Server: `http://localhost:2567` (proxied game/API traffic), client: `http://localhost:8080`. The `cards/` directory is bind-mounted read-only into the server container so card content can be edited without rebuilding images.

## test cards

test card art is from Dungeon Crawl Stone Soup, used under the CC0 Public Domain License.

[OpenGameArt: Dungeon Crawl 32x32 tiles supplemental](https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental)

> You can use these tilesets in your program freely. No attribution is required. As a courtesy, include a link to the OGA page: [http://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental](http://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental), or the crawl-tiles page: [https://github.com/crawl/tiles](https://github.com/crawl/tiles)