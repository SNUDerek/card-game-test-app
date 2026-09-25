import { randomUUID } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "colyseus";
import {
  JoinRoomOptionsSchema,
  SpawnCardPayloadSchema,
  TABLE_COMMANDS,
  type JoinRoomOptions,
  type PlayerId,
} from "@card-table/shared";
import { PlayerState, RoomState } from "./state/RoomState.js";
import { spawnCard } from "../commands/card/spawn-card.js";
import { DomainCommandError } from "../commands/errors.js";

export interface TableRoomOptions {
  cardDefinitionIds?: string[];
}

function parseJoinOptions(options: unknown): JoinRoomOptions {
  const parsed = JoinRoomOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new ServerError(400, "A display name between 1 and 50 characters is required.");
  }
  return parsed.data;
}

export class TableRoom extends Room<{ state: RoomState }> {
  private readonly playerIdBySessionId = new Map<string, PlayerId>();
  private cardDefinitionIds: ReadonlySet<string> = new Set();

  onCreate(options: TableRoomOptions = {}) {
    this.setState(new RoomState());
    this.cardDefinitionIds = new Set(options.cardDefinitionIds ?? []);
    this.onMessage(TABLE_COMMANDS.SPAWN_CARD, (_client, rawPayload) => {
      const parsed = SpawnCardPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new ServerError(400, "Invalid SPAWN_CARD payload.");
      }

      try {
        const card = spawnCard(this.state, this.cardDefinitionIds, parsed.data);
        return { cardId: card.id };
      } catch (error) {
        if (error instanceof DomainCommandError) {
          throw new ServerError(400, error.message);
        }
        throw error;
      }
    });
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
