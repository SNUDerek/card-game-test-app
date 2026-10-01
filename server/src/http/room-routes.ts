import type { Application, Request } from "express";
import express from "express";
import { matchMaker, type AuthContext } from "colyseus";
import { CreateRoomRequestSchema } from "@card-table/shared";
import type { WorkspaceService } from "../library/workspace-service.js";
import { HttpError } from "./errors.js";
import type { TableRoom } from "../rooms/TableRoom.js";
import type { RoomCreationRegistry } from "../rooms/room-creation.js";
import { parseRequest, requestUser } from "./request.js";

export interface RoomListing {
  roomId: string;
  clients: number;
  maxClients: number;
  metadata?: Record<string, unknown>;
}

export interface RoomGateway {
  create(options: Record<string, unknown>, auth: AuthContext): ReturnType<typeof matchMaker.create>;
  list(): Promise<RoomListing[]>;
  end(roomId: string, editorName: string): Promise<void>;
}

export const colyseusRoomGateway: RoomGateway = {
  create: (options, auth) => matchMaker.create("table", options, auth),
  list: async () => (await matchMaker.query({ name: "table" })) as RoomListing[],
  end: async (roomId, editorName) => {
    const [room] = await matchMaker.query({ roomId });
    if (!room) throw new HttpError(404, "Room not found.");
    try {
      await matchMaker.remoteRoomCall<TableRoom, "endRoom">(roomId, "endRoom", [editorName]);
    } catch {
      throw new HttpError(404, "Room not found.");
    }
  },
};

function authContext(req: Request): AuthContext {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return { headers, ip: req.ip, req };
}

export function registerRoomRoutes(
  app: Application,
  options: {
    workspace: WorkspaceService;
    gateway?: RoomGateway;
    creationRegistry?: RoomCreationRegistry;
  },
): void {
  const { workspace, gateway = colyseusRoomGateway, creationRegistry } = options;
  const json = express.json({ type: "application/json", limit: "16kb" });

  app.get("/api/rooms", async (_req, res, next) => {
    try {
      const rooms = (await gateway.list()).map((room) => ({
        id: room.roomId,
        playerCount: room.clients,
        maxPlayers: room.maxClients,
        ...room.metadata,
      }));
      res.json({ rooms });
    } catch (error) { next(error); }
  });

  app.post("/api/rooms", json, async (req, res, next) => {
    try {
      const room = parseRequest(CreateRoomRequestSchema, req.body);
      const set = workspace.sets.require(room.setId);
      if (set.archived) throw new HttpError(404, "Set not found.");
      const creationToken = creationRegistry?.issue(set.id);
      let reservation;
      try {
        reservation = await gateway.create({
          ...room,
          setName: set.name,
          creationToken,
        }, authContext(req));
      } catch (error) {
        if (creationToken) creationRegistry?.revoke(creationToken);
        throw error;
      }
      res.status(201).json(reservation);
    } catch (error) { next(error); }
  });

  app.post("/api/rooms/:id/end", async (req, res, next) => {
    try {
      if (!req.params.id) throw new HttpError(400, "Room ID is required.");
      await gateway.end(req.params.id, requestUser(req).displayName);
      res.status(204).end();
    } catch (error) { next(error); }
  });
}
