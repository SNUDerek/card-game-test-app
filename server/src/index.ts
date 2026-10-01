import express from "express";
import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PROTOCOL_VERSION } from "@card-table/shared";
import {
  PORT, CARDS_DIR, DATABASE_FILE, COOKIE_SECURE, SIGNUP_PASSCODE,
  requireAuthPepper, trustProxySetting,
} from "./config/env.js";
import {
  CardCatalogError,
  loadCardCatalog,
  type CardCatalog,
} from "./cards/load-card-catalog.js";
import { registerCardRoutes } from "./http/routes.js";
import { TableRoom } from "./rooms/TableRoom.js";
import { openDatabase } from "./db/connection.js";
import { UserRepository } from "./auth/users.js";
import { SessionRepository } from "./auth/sessions.js";
import { findRequestUser, requireUser } from "./auth/middleware.js";
import { registerAuthRoutes } from "./auth/routes.js";

const authPepper = requireAuthPepper();
const database = openDatabase(DATABASE_FILE);
const users = new UserRepository(database);
const sessions = new SessionRepository(database);
sessions.deleteExpired();
const sessionCleanup = setInterval(() => sessions.deleteExpired(), 24 * 60 * 60 * 1_000);
sessionCleanup.unref();

let cardCatalog: CardCatalog;
try {
  cardCatalog = await loadCardCatalog(CARDS_DIR);
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
    table: defineRoom(TableRoom, {
      cardDefinitionIds: [...cardCatalog.keys()],
      authenticate: (cookieHeader: string | null) => findRequestUser(cookieHeader, sessions)?.user,
    }),
  },
  express: (app) => {
    app.set("trust proxy", trustProxySetting());
    app.get("/health", (_req, res) => {
      res.json({ ok: true, protocolVersion: PROTOCOL_VERSION });
    });
    registerAuthRoutes(app, {
      users,
      sessions,
      pepper: authPepper,
      signupPasscode: SIGNUP_PASSCODE,
      cookieSecure: COOKIE_SECURE,
    });
    app.use("/api", requireUser(sessions));
    registerCardRoutes(app, cardCatalog);
    app.use("/cards", requireUser(sessions), express.static(CARDS_DIR));
  },
});

server.listen(PORT);
console.log(`Card table server listening on :${PORT} (${cardCatalog.size} cards loaded)`);
