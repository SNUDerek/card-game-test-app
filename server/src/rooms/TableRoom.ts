import { randomUUID } from "node:crypto";
import { CloseCode, Room, ServerError, type AuthContext, type Client } from "colyseus";
import {
  JoinRoomOptionsSchema,
  ClaimObjectPayloadSchema,
  ReleaseObjectPayloadSchema,
  MoveCardPayloadSchema,
  CardIdPayloadSchema,
  SpawnCardPayloadSchema,
  TABLE_COMMANDS,
  ROOM_COMMANDS,
  type JoinRoomOptions,
  type PlayerId,
  type SessionResult,
} from "@card-table/shared";
import { PlayerState, RoomState } from "./state/RoomState.js";
import { spawnCard } from "../commands/card/spawn-card.js";
import { DomainCommandError } from "../commands/errors.js";
import {
  claimObject,
  releaseExpiredLocks,
  releaseObject,
  releasePlayerLocks,
} from "../commands/player/object-locks.js";
import { moveCard } from "../commands/card/move-card.js";
import { flipCard } from "../commands/card/flip-card.js";
import { tapCard } from "../commands/card/tap-card.js";
import { untapCard } from "../commands/card/untap-card.js";
import { bringToFront } from "../commands/card/bring-to-front.js";
import { deleteCard } from "../commands/card/delete-card.js";
import { assignHostIfVacant } from "./host.js";
import { hashRoomPassword, verifyRoomPassword, type RoomPasswordHash } from "./room-access.js";

export interface TableRoomOptions {
  cardDefinitionIds?: string[];
  lockTimeoutMs?: number;
  /** Set by the creating client; never synchronized to room state. */
  password?: string;
  /** How long a dropped player keeps their identity. 0 disables reconnection. */
  reconnectionGraceSeconds?: number;
}

export const DEFAULT_OBJECT_LOCK_TIMEOUT_MS = 5_000;
export const DEFAULT_RECONNECTION_GRACE_SECONDS = 30;

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
  private lockTimeoutMs = DEFAULT_OBJECT_LOCK_TIMEOUT_MS;
  private passwordHash: RoomPasswordHash | undefined;
  private reconnectionGraceSeconds = DEFAULT_RECONNECTION_GRACE_SECONDS;
  private joinCount = 0;

  onCreate(options: TableRoomOptions = {}) {
    this.setState(new RoomState());
    this.cardDefinitionIds = new Set(options.cardDefinitionIds ?? []);
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_OBJECT_LOCK_TIMEOUT_MS;
    this.passwordHash = options.password ? hashRoomPassword(options.password) : undefined;
    this.reconnectionGraceSeconds =
      options.reconnectionGraceSeconds ?? DEFAULT_RECONNECTION_GRACE_SECONDS;
    // Rooms are shared by URL, never matchmade: keep them out of any listing.
    void this.setPrivate(true);
    this.onMessage(ROOM_COMMANDS.SESSION, (client): SessionResult => {
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");
      return { playerId };
    });
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
    this.onMessage(TABLE_COMMANDS.CLAIM_OBJECT, (client, rawPayload) => {
      const parsed = ClaimObjectPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid CLAIM_OBJECT payload.");
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");

      try {
        const lock = claimObject(
          this.state,
          playerId,
          parsed.data.object,
          Date.now(),
          this.lockTimeoutMs,
        );
        if (parsed.data.object.kind === "card") {
          bringToFront(this.state, parsed.data.object.id);
        }
        return { expiresAt: lock.expiresAt };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.RELEASE_OBJECT, (client, rawPayload) => {
      const parsed = ReleaseObjectPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid RELEASE_OBJECT payload.");
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");

      try {
        releaseObject(this.state, playerId, parsed.data.object);
        return { released: true as const };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.MOVE_CARD, (client, rawPayload) => {
      const parsed = MoveCardPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid MOVE_CARD payload.");
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");

      try {
        moveCard(this.state, playerId, parsed.data, Date.now(), this.lockTimeoutMs);
        return { moved: true as const };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.FLIP_CARD, (_client, rawPayload) => {
      const parsed = CardIdPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid FLIP_CARD payload.");
      try {
        return { face: flipCard(this.state, parsed.data.cardId) };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.TAP_CARD, (_client, rawPayload) => {
      const parsed = CardIdPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid TAP_CARD payload.");
      try {
        return { orientation: tapCard(this.state, parsed.data.cardId) };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.UNTAP_CARD, (_client, rawPayload) => {
      const parsed = CardIdPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid UNTAP_CARD payload.");
      try {
        return { orientation: untapCard(this.state, parsed.data.cardId) };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.BRING_TO_FRONT, (_client, rawPayload) => {
      const parsed = CardIdPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid BRING_TO_FRONT payload.");
      try {
        return { zIndex: bringToFront(this.state, parsed.data.cardId) };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.DELETE_CARD, (client, rawPayload) => {
      const parsed = CardIdPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid DELETE_CARD payload.");
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");

      try {
        deleteCard(this.state, playerId, parsed.data.cardId, Date.now());
        return { deleted: true as const };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.clock.setInterval(
      () => releaseExpiredLocks(this.state, Date.now()),
      Math.min(this.lockTimeoutMs, 250),
    );
    console.log(`TableRoom created: ${this.roomId}`);
  }

  onAuth(_client: Client, options: unknown, _context: AuthContext): JoinRoomOptions {
    const joinOptions = parseJoinOptions(options);
    if (!verifyRoomPassword(this.passwordHash, joinOptions.password)) {
      throw new ServerError(401, "Incorrect room password.");
    }
    return joinOptions;
  }

  onJoin(client: Client, options: unknown) {
    const { displayName } = parseJoinOptions(options);
    const playerId = randomUUID();
    const player = new PlayerState({
      id: playerId,
      displayName,
      connected: true,
      joinOrder: this.joinCount++,
    });

    this.playerIdBySessionId.set(client.sessionId, playerId);
    this.state.players.set(playerId, player);
    assignHostIfVacant(this.state, playerId);
    console.log(`${playerId} joined ${this.roomId}`);
  }

  async onLeave(client: Client, code?: number) {
    const playerId = this.playerIdBySessionId.get(client.sessionId);
    if (!playerId) return;

    this.playerIdBySessionId.delete(client.sessionId);
    // Locks are released immediately rather than held for the grace period
    // (data-models.md §51), so a dropped player never blocks the table.
    releasePlayerLocks(this.state, playerId);
    const player = this.state.players.get(playerId);
    if (player) player.connected = false;

    if (code === CloseCode.CONSENTED || this.reconnectionGraceSeconds <= 0) {
      this.removePlayer(playerId);
      return;
    }

    console.log(`${playerId} dropped from ${this.roomId}, awaiting reconnection`);
    try {
      const reconnected = await this.allowReconnection(client, this.reconnectionGraceSeconds);
      this.playerIdBySessionId.set(reconnected.sessionId, playerId);
      const restored = this.state.players.get(playerId);
      if (restored) restored.connected = true;
      console.log(`${playerId} reconnected to ${this.roomId}`);
    } catch {
      this.removePlayer(playerId);
    }
  }

  /** Permanent departure: the player is gone and cannot reclaim their identity. */
  private removePlayer(playerId: PlayerId): void {
    releasePlayerLocks(this.state, playerId);
    this.state.players.delete(playerId);
    console.log(`${playerId} left ${this.roomId}`);
  }
}
