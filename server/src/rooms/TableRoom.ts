import { randomUUID } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "colyseus";
import {
  JoinRoomOptionsSchema,
  type JoinRoomOptions,
  type PlayerId,
} from "@card-table/shared";
import { PlayerState, RoomState } from "./state/RoomState.js";

function parseJoinOptions(options: unknown): JoinRoomOptions {
  const parsed = JoinRoomOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new ServerError(400, "A display name between 1 and 50 characters is required.");
  }
  return parsed.data;
}

export class TableRoom extends Room<{ state: RoomState }> {
  private readonly playerIdBySessionId = new Map<string, PlayerId>();

  onCreate() {
    this.setState(new RoomState());
    console.log(`TableRoom created: ${this.roomId}`);
  }

  onAuth(_client: Client, options: unknown, _context: AuthContext): JoinRoomOptions {
    return parseJoinOptions(options);
  }

  onJoin(client: Client, options: unknown) {
    const { displayName } = parseJoinOptions(options);
    const playerId = randomUUID();
    const player = new PlayerState({
      id: playerId,
      displayName,
      connected: true,
    });

    this.playerIdBySessionId.set(client.sessionId, playerId);
    this.state.players.set(playerId, player);
    console.log(`${playerId} joined ${this.roomId}`);
  }

  onLeave(client: Client) {
    const playerId = this.playerIdBySessionId.get(client.sessionId);
    if (!playerId) return;

    const player = this.state.players.get(playerId);
    if (player) player.connected = false;
    this.state.players.delete(playerId);
    this.playerIdBySessionId.delete(client.sessionId);
    console.log(`${playerId} left ${this.roomId}`);
  }
}
