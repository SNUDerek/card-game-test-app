import { randomUUID } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "colyseus";
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
  type JoinRoomOptions,
  type PlayerId,
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
import { stackCard } from "../commands/stack/stack-card.js";
import { moveStack } from "../commands/stack/move-stack.js";
import { drawTopCard } from "../commands/stack/draw-top-card.js";
import { deleteStack } from "../commands/stack/delete-stack.js";
import { bringStackToFrontIfNeeded } from "../commands/stack/stack-helpers.js";

export interface TableRoomOptions {
  cardDefinitionIds?: string[];
  lockTimeoutMs?: number;
}

export const DEFAULT_OBJECT_LOCK_TIMEOUT_MS = 5_000;

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

  onCreate(options: TableRoomOptions = {}) {
    this.setState(new RoomState());
    this.cardDefinitionIds = new Set(options.cardDefinitionIds ?? []);
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_OBJECT_LOCK_TIMEOUT_MS;
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
        } else {
          bringStackToFrontIfNeeded(this.state, parsed.data.object.id);
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
    this.onMessage(TABLE_COMMANDS.STACK_CARD, (client, rawPayload) => {
      const parsed = StackCardPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid STACK_CARD payload.");
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");
      try {
        return { stackId: stackCard(this.state, playerId, parsed.data, Date.now()) };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.MOVE_STACK, (client, rawPayload) => {
      const parsed = MoveStackPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid MOVE_STACK payload.");
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");
      try {
        moveStack(this.state, playerId, parsed.data, Date.now(), this.lockTimeoutMs);
        return { moved: true as const };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.DRAW_CARD, (client, rawPayload) => {
      const parsed = DrawCardPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid DRAW_CARD payload.");
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");
      try {
        return { cardId: drawTopCard(this.state, playerId, parsed.data, Date.now()).id };
      } catch (error) {
        if (error instanceof DomainCommandError) throw new ServerError(409, error.message);
        throw error;
      }
    });
    this.onMessage(TABLE_COMMANDS.DELETE_STACK, (client, rawPayload) => {
      const parsed = StackIdPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) throw new ServerError(400, "Invalid DELETE_STACK payload.");
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) throw new ServerError(403, "Player is not joined.");
      try {
        deleteStack(this.state, playerId, parsed.data.stackId, Date.now());
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
    releasePlayerLocks(this.state, playerId);
    this.state.players.delete(playerId);
    this.playerIdBySessionId.delete(client.sessionId);
    console.log(`${playerId} left ${this.roomId}`);
  }
}
