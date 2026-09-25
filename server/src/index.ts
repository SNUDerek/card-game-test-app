import express from "express";
import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import { PROTOCOL_VERSION } from "@card-table/shared";
import { PORT, CARDS_DIR } from "./config/env.js";
import { TableRoom } from "./rooms/TableRoom.js";

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
console.log(`Card table server listening on :${PORT}`);
