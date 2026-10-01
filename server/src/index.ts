import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PROTOCOL_VERSION } from "@card-table/shared";
import {
  PORT, DATABASE_FILE, IMAGES_DIR, SAMPLE_CARDS_DIR, COOKIE_SECURE, SIGNUP_PASSCODE, TRUST_CLOUDFLARE_IP,
  requireAuthPepper, trustProxySetting,
} from "./config/env.js";
import { TableRoom } from "./rooms/TableRoom.js";
import { parseIdleTimeoutMinutes } from "./rooms/idle-timeout.js";
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
import { seedSampleSetIfEmpty } from "./library/seed-sample-set.js";

const authPepper = requireAuthPepper();
const database = openDatabase(DATABASE_FILE);
const users = new UserRepository(database);
const sessions = new SessionRepository(database);
const images = new ImageStore(new ImageRepository(database), IMAGES_DIR);
const sampleSeed = await seedSampleSetIfEmpty(database, images, SAMPLE_CARDS_DIR);
if (sampleSeed.seeded) console.log(`Seeded "Sample Set" from ${SAMPLE_CARDS_DIR}`);
else if (sampleSeed.reason === "missing_directory") {
  console.warn(`Sample cards folder not found at ${SAMPLE_CARDS_DIR}; skipping the Sample Set.`);
}
const usageRegistry = new SetUsageRegistry();
const creationRegistry = new RoomCreationRegistry();
const idleTimeoutMs = parseIdleTimeoutMinutes(process.env.ROOM_IDLE_TIMEOUT_MINUTES) * 60_000;
const workspace = new WorkspaceService(database, images, usageRegistry);
sessions.deleteExpired();
const sessionCleanup = setInterval(() => sessions.deleteExpired(), 24 * 60 * 60 * 1_000);
sessionCleanup.unref();

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    table: defineRoom(TableRoom, {
      authenticate: (cookieHeader: string | null) => findRequestUser(cookieHeader, sessions)?.user,
      cardLibrary: workspace.cardLibrary,
      displayNameFor: (userId: string) => users.displayName(userId),
      usageRegistry,
      deckLookup: workspace,
      creationRegistry,
      requireHttpCreation: true,
      idleTimeoutMs,
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
    registerRoomRoutes(app, { workspace, creationRegistry, usageRegistry });
    registerWorkspaceRoutes(app, workspace, images);
    app.use(workspaceErrorHandler);
  },
});

server.listen(PORT);
console.log(`Card table server listening on :${PORT}`);
