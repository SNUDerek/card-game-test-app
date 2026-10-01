import type { Application, Request } from "express";
import express from "express";
import { matchMaker, type AuthContext } from "colyseus";
import { CreateRoomSchema } from "@card-table/shared";
import type { AuthenticatedRequest } from "../auth/middleware.js";
import type { WorkspaceRepository } from "../library/workspace-repository.js";
import { WorkspaceError } from "../library/workspace-repository.js";
import type { TableRoom } from "../rooms/TableRoom.js";

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
    try {
      await matchMaker.remoteRoomCall<TableRoom, "endRoom">(roomId, "endRoom", [editorName]);
    } catch {
      throw new WorkspaceError(404, "Room not found.");
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
  repository: WorkspaceRepository,
  gateway: RoomGateway = colyseusRoomGateway,
): void {
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
      const parsed = CreateRoomSchema.safeParse(req.body);
      if (!parsed.success) throw new WorkspaceError(400, "Invalid room details.");
      const set = repository.getSet(parsed.data.setId);
      const cardDefinitionIds = repository.listCards(set.id).map((card) => card.id);
      const reservation = await gateway.create({
        ...parsed.data,
        setName: set.name,
        cardDefinitionIds,
      }, authContext(req));
      res.status(201).json(reservation);
    } catch (error) { next(error); }
  });

  app.post("/api/rooms/:id/end", async (req, res, next) => {
    try {
      if (!req.params.id) throw new WorkspaceError(400, "Room ID is required.");
      await gateway.end(req.params.id, (req as unknown as AuthenticatedRequest).user.displayName);
      res.status(204).end();
    } catch (error) { next(error); }
  });
}
