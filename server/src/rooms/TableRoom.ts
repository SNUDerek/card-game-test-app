import { randomUUID } from "node:crypto";
import { CloseCode, Room, ServerError, type AuthContext, type Client } from "colyseus";
import { z } from "zod";
import {
  JoinRoomOptionsSchema,
  ClaimObjectPayloadSchema,
  ReleaseObjectPayloadSchema,
  MoveCardPayloadSchema,
  CardIdPayloadSchema,
  SpawnCardPayloadSchema,
  StackCardPayloadSchema,
  MoveStackPayloadSchema,
  DrawCardPayloadSchema,
  StackIdPayloadSchema,
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
import { setCardOrientation } from "../commands/card/tap-card.js";
import { bringToFront, raiseToFront } from "../commands/card/bring-to-front.js";
import { deleteCard } from "../commands/card/delete-card.js";
import { assignHostIfVacant, migrateHostIfNeeded } from "./host.js";
import { hashRoomPassword, verifyRoomPassword, type RoomPasswordHash } from "./room-access.js";
import { stackCard } from "../commands/stack/stack-card.js";
import { moveStack } from "../commands/stack/move-stack.js";
import { drawTopCard } from "../commands/stack/draw-top-card.js";
import { deleteStack } from "../commands/stack/delete-stack.js";
import { bringStackToFrontIfNeeded } from "../commands/stack/stack-helpers.js";
import {
  CommandRateLimiter,
  DEFAULT_COMMAND_RATE_LIMIT,
  type RateLimitOptions,
} from "./rate-limit.js";

export interface TableRoomOptions {
  cardDefinitionIds?: string[];
  lockTimeoutMs?: number;
  /** Set by the creating client; never synchronized to room state. */
  password?: string;
  /** How long a dropped player keeps their identity. 0 disables reconnection. */
  reconnectionGraceSeconds?: number;
  /** Per-connection command budget. Defaults to DEFAULT_COMMAND_RATE_LIMIT. */
  commandRateLimit?: RateLimitOptions;
}

/**
 * What a command handler is handed once the room has parsed the payload and
 * established who is asking.
 */
interface CommandContext {
  playerId: PlayerId;
  now: number;
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
  private rateLimiter = new CommandRateLimiter();

  /**
   * Registers one command with the checks every command needs: a rate budget,
   * structural validation, a joined player, and domain errors mapped to a
   * status. Registering through this is what keeps any single handler from
   * quietly skipping one of them.
   */
  private command<Schema extends z.ZodType>(
    name: string,
    schema: Schema,
    run: (context: CommandContext, payload: z.infer<Schema>) => unknown,
    rejectionStatus = 409,
  ): void {
    this.onMessage(name, (client, rawPayload) => {
      const now = Date.now();
      if (!this.rateLimiter.tryConsume(client.sessionId, now)) {
        throw new ServerError(429, "Too many commands; slow down.");
      }
      const parsed = schema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, `Invalid ${name} payload.`);
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");

      try {
        return run({ playerId, now }, parsed.data);
      } catch (error) {
        if (error instanceof DomainCommandError) {
          throw new ServerError(rejectionStatus, error.message);
        }
        throw error;
      }
    });
  }

  onCreate(options: TableRoomOptions = {}) {
    this.setState(new RoomState());
    this.cardDefinitionIds = new Set(options.cardDefinitionIds ?? []);
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_OBJECT_LOCK_TIMEOUT_MS;
    this.passwordHash = options.password ? hashRoomPassword(options.password) : undefined;
    this.reconnectionGraceSeconds =
      options.reconnectionGraceSeconds ?? DEFAULT_RECONNECTION_GRACE_SECONDS;
    // Rooms are shared by URL, never matchmade: keep them out of any listing.
    void this.setPrivate(true);
    this.rateLimiter = new CommandRateLimiter(
      options.commandRateLimit ?? DEFAULT_COMMAND_RATE_LIMIT,
    );

    this.command(ROOM_COMMANDS.SESSION, z.unknown(), ({ playerId }): SessionResult => ({
      playerId,
    }));
    this.command(
      TABLE_COMMANDS.SPAWN_CARD,
      SpawnCardPayloadSchema,
      (_context, payload) => ({ cardId: spawnCard(this.state, this.cardDefinitionIds, payload).id }),
      400,
    );
    this.command(TABLE_COMMANDS.CLAIM_OBJECT, ClaimObjectPayloadSchema, ({ playerId, now }, payload) => {
      const lock = claimObject(this.state, playerId, payload.object, now, this.lockTimeoutMs);
      // Claiming is what a drag starts with, so the claimed object surfaces
      // immediately rather than waiting for the first movement command.
      if (payload.object.kind === "card") raiseToFront(this.state, payload.object.id);
      else bringStackToFrontIfNeeded(this.state, payload.object.id);
      return { expiresAt: lock.expiresAt };
    });
    this.command(TABLE_COMMANDS.RELEASE_OBJECT, ReleaseObjectPayloadSchema, ({ playerId }, payload) => {
      releaseObject(this.state, playerId, payload.object);
      return { released: true as const };
    });
    this.command(TABLE_COMMANDS.MOVE_CARD, MoveCardPayloadSchema, ({ playerId, now }, payload) => {
      moveCard(this.state, playerId, payload, now, this.lockTimeoutMs);
      return { moved: true as const };
    });
    this.command(TABLE_COMMANDS.FLIP_CARD, CardIdPayloadSchema, ({ playerId, now }, payload) => ({
      face: flipCard(this.state, playerId, payload.cardId, now),
    }));
    this.command(TABLE_COMMANDS.TAP_CARD, CardIdPayloadSchema, ({ playerId, now }, payload) => ({
      orientation: setCardOrientation(this.state, playerId, payload.cardId, now, "tapped"),
    }));
    this.command(TABLE_COMMANDS.UNTAP_CARD, CardIdPayloadSchema, ({ playerId, now }, payload) => ({
      orientation: setCardOrientation(this.state, playerId, payload.cardId, now, "upright"),
    }));
    this.command(TABLE_COMMANDS.BRING_TO_FRONT, CardIdPayloadSchema, ({ playerId, now }, payload) => ({
      zIndex: bringToFront(this.state, playerId, payload.cardId, now),
    }));
    this.command(TABLE_COMMANDS.DELETE_CARD, CardIdPayloadSchema, ({ playerId, now }, payload) => {
      deleteCard(this.state, playerId, payload.cardId, now);
      return { deleted: true as const };
    });
    this.command(TABLE_COMMANDS.STACK_CARD, StackCardPayloadSchema, ({ playerId, now }, payload) => ({
      stackId: stackCard(this.state, playerId, payload, now),
    }));
    this.command(TABLE_COMMANDS.MOVE_STACK, MoveStackPayloadSchema, ({ playerId, now }, payload) => {
      moveStack(this.state, playerId, payload, now, this.lockTimeoutMs);
      return { moved: true as const };
    });
    this.command(TABLE_COMMANDS.DRAW_CARD, DrawCardPayloadSchema, ({ playerId, now }, payload) => ({
      cardId: drawTopCard(this.state, playerId, payload, now).id,
    }));
    this.command(TABLE_COMMANDS.DELETE_STACK, StackIdPayloadSchema, ({ playerId, now }, payload) => {
      deleteStack(this.state, playerId, payload.stackId, now);
      return { deleted: true as const };
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
    this.rateLimiter.forget(client.sessionId);
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
      // The room may have been left hostless while this player was away.
      assignHostIfVacant(this.state, playerId);
      console.log(`${playerId} reconnected to ${this.roomId}`);
    } catch {
      this.removePlayer(playerId);
    }
  }

  /** Permanent departure: the player is gone and cannot reclaim their identity. */
  private removePlayer(playerId: PlayerId): void {
    releasePlayerLocks(this.state, playerId);
    this.state.players.delete(playerId);
    migrateHostIfNeeded(this.state, playerId);
    console.log(`${playerId} left ${this.roomId}`);
  }
}
