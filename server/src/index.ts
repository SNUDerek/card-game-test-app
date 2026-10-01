import express from "express";
import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PROTOCOL_VERSION } from "@card-table/shared";
import {
  PORT, CARDS_DIR, IMAGES_DIR, DATABASE_FILE, COOKIE_SECURE, SIGNUP_PASSCODE, TRUST_CLOUDFLARE_IP,
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
import { WorkspaceService } from "./library/workspace-service.js";
import { ImageStore } from "./library/image-store.js";
import { registerWorkspaceRoutes } from "./http/workspace-routes.js";
import { workspaceErrorHandler } from "./http/errors.js";
import { ImageRepository } from "./db/images.js";
import { SetUsageRegistry } from "./library/set-usage.js";
import { RoomCreationRegistry } from "./rooms/room-creation.js";
import { registerRoomRoutes } from "./http/room-routes.js";

const authPepper = requireAuthPepper();
const database = openDatabase(DATABASE_FILE);
const users = new UserRepository(database);
const sessions = new SessionRepository(database);
const images = new ImageStore(new ImageRepository(database), IMAGES_DIR);
const usageRegistry = new SetUsageRegistry();
const creationRegistry = new RoomCreationRegistry();
const workspace = new WorkspaceService(database, images, usageRegistry);
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
      authenticate: (cookieHeader: string | null) => findRequestUser(cookieHeader, sessions)?.user,
      cardLibrary: workspace.cardLibrary,
      usageRegistry,
      creationRegistry,
      requireHttpCreation: true,
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
      trustCloudflareIp: TRUST_CLOUDFLARE_IP,
    });
    app.use("/api", requireUser(sessions, COOKIE_SECURE));
    app.use("/images", requireUser(sessions, COOKIE_SECURE));
    registerRoomRoutes(app, { workspace, creationRegistry });
    registerWorkspaceRoutes(app, workspace, images);
    registerCardRoutes(app, cardCatalog);
    app.use("/cards", requireUser(sessions, COOKIE_SECURE), express.static(CARDS_DIR));
    app.use(workspaceErrorHandler);
  },
});

server.listen(PORT);
console.log(`Card table server listening on :${PORT} (${cardCatalog.size} cards loaded)`);
