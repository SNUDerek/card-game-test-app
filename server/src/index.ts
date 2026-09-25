import express from "express";
import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import { PROTOCOL_VERSION } from "@card-table/shared";
import { PORT, CARDS_DIR } from "./config/env.js";
import { CardCatalogError, loadCardCatalog } from "./cards/load-card-catalog.js";
import { TableRoom } from "./rooms/TableRoom.js";

let cardCount: number;
try {
  cardCount = (await loadCardCatalog(CARDS_DIR)).size;
} catch (err) {
  if (err instanceof CardCatalogError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    table: defineRoom(TableRoom),
  },
  express: (app) => {
    app.use(cors());
    app.get("/health", (_req, res) => {
      res.json({ ok: true, protocolVersion: PROTOCOL_VERSION });
    });
    app.use("/cards", express.static(CARDS_DIR));
  },
});

server.listen(PORT);
console.log(`Card table server listening on :${PORT} (${cardCount} cards loaded)`);
