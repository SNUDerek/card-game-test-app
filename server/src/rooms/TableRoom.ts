import { randomUUID } from "node:crypto";
import { CloseCode, Room, ServerError, type AuthContext, type Client } from "colyseus";
import { z } from "zod";
import {
  ClaimObjectPayloadSchema,
  ReleaseObjectPayloadSchema,
  MoveCardPayloadSchema,
  CardIdPayloadSchema,
  SpawnCardPayloadSchema,
  SpawnDeckPayloadSchema,
  UpdateRoomMetadataPayloadSchema,
  StackCardPayloadSchema,
  MoveStackPayloadSchema,
  DrawCardPayloadSchema,
  StackIdPayloadSchema,
  SetHoverPayloadSchema,
  TABLE_COMMANDS,
  ROOM_COMMANDS,
  ROOM_EVENTS,
  type CatalogChangedEvent,
  type CurrentUser,
  type RoomEndedEvent,
  type RoomIdleWarningEvent,
  type PlayerId,
  type SessionResult,
  type SetHoverResult,
} from "@card-table/shared";
import { PlayerState, RoomState } from "./state/RoomState.js";
import { spawnCard, type CardDefinitionLookup } from "../commands/card/spawn-card.js";
import { spawnDeck } from "../commands/deck/spawn-deck.js";
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
import { stackCard } from "../commands/stack/stack-card.js";
import { moveStack } from "../commands/stack/move-stack.js";
import { drawTopCard } from "../commands/stack/draw-top-card.js";
import { deleteStack } from "../commands/stack/delete-stack.js";
import { shuffleStack } from "../commands/stack/shuffle-stack.js";
import { clearPlayerHover, setPlayerHover } from "../commands/player/set-hover.js";
import { bringStackToFrontIfNeeded } from "../commands/stack/stack-helpers.js";
import {
  CommandRateLimiter,
  DEFAULT_COMMAND_RATE_LIMIT,
  type RateLimitOptions,
} from "./rate-limit.js";
import type { SetUsageRegistry } from "../library/set-usage.js";
import type { RoomCreationRegistry } from "./room-creation.js";
import { RoomIdleTimeout, countsAsActivity } from "./idle-timeout.js";
import { RoomLibraryBinding, type RoomCardLibrary, type RoomDeckLookup } from "./library-binding.js";

/** The part of `CardLibrary` a room uses: membership checks and change events. */
export interface TableRoomOptions {
  lockTimeoutMs?: number;
  /** Hard cap on joined and reconnecting players in this room. */
  maxClients?: number;
  /** Resolves the session cookie to an account. Supplied by the server bootstrap. */
  authenticate?: (cookieHeader: string | null, joinOptions: unknown) => CurrentUser | undefined;
  /** How long a dropped player keeps their identity. 0 disables reconnection. */
  reconnectionGraceSeconds?: number;
  /** Per-connection command budget. Defaults to DEFAULT_COMMAND_RATE_LIMIT. */
  commandRateLimit?: RateLimitOptions;
  /** The library set this table plays. Spawns are limited to its active cards. */
  setId?: string;
  setName?: string;
  name?: string;
  description?: string;
  cardLibrary?: RoomCardLibrary;
  /** Names the editor in CATALOG_CHANGED notices. Supplied by the server bootstrap. */
  displayNameFor?: (userId: string) => string | undefined;
  usageRegistry?: SetUsageRegistry;
  deckLookup?: RoomDeckLookup;
  /** Undefined disables expiry; production supplies this from the environment. */
  idleTimeoutMs?: number;
  creationRegistry?: RoomCreationRegistry;
  requireHttpCreation?: boolean;
  creationToken?: string;
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
export const DEFAULT_MAX_CLIENTS_PER_ROOM = 16;

export class TableRoom extends Room<{ state: RoomState }> {
  private readonly playerIdBySessionId = new Map<string, PlayerId>();
  private cardDefinitionIds: CardDefinitionLookup = new Set<string>();
  private lockTimeoutMs = DEFAULT_OBJECT_LOCK_TIMEOUT_MS;
  private authenticate: (cookieHeader: string | null, joinOptions: unknown) => CurrentUser | undefined = () => undefined;
  private reconnectionGraceSeconds = DEFAULT_RECONNECTION_GRACE_SECONDS;
  private joinCount = 0;
  private rateLimiter = new CommandRateLimiter();
  private setId: string | undefined;
  private libraryBinding: RoomLibraryBinding | undefined;
  private deckLookup: RoomDeckLookup | undefined;
  private idleTimeout: RoomIdleTimeout | undefined;
  private idleExpired = false;
  private displayNameFor: (userId: string) => string | undefined = () => undefined;
  private readonly onLibraryChanged = (change: import("../library/card-library.js").LibraryChange) => {
    if (change.setId !== this.setId) return;
    if (change.cardIds.length === 0) {
      const set = this.libraryBinding?.currentSet();
      // A rename is metadata, not just a catalog notification: room listings
      // must immediately display the current set name.
      if (set && this.metadata.setName !== set.name) void this.setMetadata({ ...this.metadata, setName: set.name });
    }
    const event: CatalogChangedEvent = {
      setId: change.setId,
      changedCardIds: change.cardIds,
      editorName: change.userId ? this.displayNameFor(change.userId) ?? null : null,
    };
    this.broadcast(ROOM_EVENTS.CATALOG_CHANGED, event);
  };

  /**
   * Registers one command with the checks every command needs: a rate budget,
   * structural validation, a joined player, and domain errors mapped to a
   * status. Registering through this is what keeps any single handler from
   * quietly skipping one of them.
   *
   * A rejection can only be delivered to a client that asked for one. Commands
   * sent fire-and-forget (`room.send`, used for throttled movement and for
   * hover) carry no request id, and Colyseus does not wrap message handlers
   * unless the room defines `onUncaughtException` -- which this room must not
   * do, because that wrapper also swallows errors on the request path and would
   * turn every rejection into a silent success. So on the fire-and-forget path
   * the error is logged and dropped here; letting it escape tears down the room
   * for everyone over one stale message.
   */
  private command<Schema extends z.ZodType>(
    name: string,
    schema: Schema,
    run: (context: CommandContext, payload: z.infer<Schema>) => unknown | Promise<unknown>,
    rejectionStatus = 409,
  ): void {
    this.onMessage(name, async (client, rawPayload, context) => {
      // Present only when the client is awaiting a reply; see DispatchContext
      // vs SEND_CONTEXT in @colyseus/core.
      const awaitingReply = context?.id !== undefined;

      const fail = (error: ServerError): undefined => {
        if (awaitingReply) throw error;
        console.warn(`${name} rejected for ${client.sessionId}: ${error.message}`);
        return undefined;
      };

      const now = Date.now();
      if (!this.rateLimiter.tryConsume(client.sessionId, now)) {
        return fail(new ServerError(429, "Too many commands; slow down."));
      }
      const parsed = schema.safeParse(rawPayload);
      if (!parsed.success) return fail(new ServerError(400, `Invalid ${name} payload.`));
      const playerId = this.playerIdBySessionId.get(client.sessionId);
      if (!playerId) return fail(new ServerError(403, "Player is not joined."));

      try {
        const result = await run({ playerId, now }, parsed.data);
        if (countsAsActivity(name)) this.recordActivity(now);
        return result;
      } catch (error) {
        if (error instanceof DomainCommandError) {
          return fail(new ServerError(rejectionStatus, error.message));
        }
        // Not a domain rejection: a real fault, which should surface.
        throw error;
      }
    });
  }

  async onCreate(options: TableRoomOptions = {}) {
    if (options.requireHttpCreation && !options.creationRegistry?.consume(options.creationToken, options.setId)) {
      throw new ServerError(403, "Rooms must be created through the authenticated HTTP API.");
    }
    if (options.creationToken) options.usageRegistry?.transfer(options.creationToken, this.roomId);
    this.setState(new RoomState());
    this.setId = options.setId;
    this.state.setId = options.setId ?? "";
    this.deckLookup = options.deckLookup;
    this.displayNameFor = options.displayNameFor ?? (() => undefined);
    // Binding acquires the usage lock before the first await, closing the
    // archive/create race. Rooms without a set only exist in legacy unit tests.
    if (options.setId && options.cardLibrary) {
      this.libraryBinding = new RoomLibraryBinding(options.setId, options.cardLibrary, options.usageRegistry, this.roomId);
      this.cardDefinitionIds = this.libraryBinding.cardIds;
    }
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_OBJECT_LOCK_TIMEOUT_MS;
    this.maxClients = options.maxClients ?? DEFAULT_MAX_CLIENTS_PER_ROOM;
    this.authenticate = options.authenticate ?? (() => undefined);
    this.reconnectionGraceSeconds =
      options.reconnectionGraceSeconds ?? DEFAULT_RECONNECTION_GRACE_SECONDS;
    await this.setMetadata({
      name: options.name ?? "Table",
      description: options.description ?? "",
      setId: options.setId ?? "",
      setName: this.libraryBinding?.set.name ?? options.setName ?? "",
    });
    await this.setPrivate(false);
    this.libraryBinding?.onChanged(this.onLibraryChanged);
    this.rateLimiter = new CommandRateLimiter(
      options.commandRateLimit ?? DEFAULT_COMMAND_RATE_LIMIT,
    );
    if (options.idleTimeoutMs !== undefined) {
      this.idleTimeout = new RoomIdleTimeout({ timeoutMs: options.idleTimeoutMs }, Date.now());
    }

    this.command(ROOM_COMMANDS.SESSION, z.unknown(), ({ playerId }): SessionResult => ({
      playerId,
    }));
    this.command(ROOM_COMMANDS.UPDATE_ROOM_METADATA, UpdateRoomMetadataPayloadSchema, async (_context, payload) => {
      await this.setMetadata({ ...this.metadata, ...payload });
      return { updated: true as const };
    });
    this.command(ROOM_COMMANDS.KEEP_OPEN, z.undefined().or(z.object({}).passthrough()), () => {
      this.recordActivity(Date.now());
      return { keptOpen: true as const };
    });
    this.command(
      TABLE_COMMANDS.SPAWN_CARD,
      SpawnCardPayloadSchema,
      (_context, payload) => ({ cardId: spawnCard(this.state, this.cardDefinitionIds, payload).id }),
      400,
    );
    this.command(
      TABLE_COMMANDS.SPAWN_DECK,
      SpawnDeckPayloadSchema,
      (_context, payload) => {
        const expanded = payload.source === "deck"
          ? this.deckEntries(payload.deckId)
          : payload.entries;
        return spawnDeck(this.state, this.cardDefinitionIds, { ...payload, source: "entries", entries: expanded });
      },
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
    this.command(TABLE_COMMANDS.SHUFFLE_STACK, StackIdPayloadSchema, ({ playerId, now }, payload) => {
      shuffleStack(this.state, playerId, payload.stackId, now);
      return { shuffled: true as const };
    });
    this.command(TABLE_COMMANDS.DELETE_STACK, StackIdPayloadSchema, ({ playerId, now }, payload) => {
      deleteStack(this.state, playerId, payload.stackId, now);
      return { deleted: true as const };
    });

    // Presence, so it is deliberately lenient: a hover of a card that just
    // disappeared is a routine crossing on the wire, not a client fault.
    this.command(
      TABLE_COMMANDS.SET_HOVER,
      SetHoverPayloadSchema,
      ({ playerId }, payload): SetHoverResult => ({
        hovering: setPlayerHover(this.state, playerId, payload.cardId),
      }),
      404,
    );

    this.clock.setInterval(
      () => releaseExpiredLocks(this.state, Date.now()),
      Math.min(this.lockTimeoutMs, 250),
    );
    this.clock.setInterval(() => this.pollIdleTimeout(), 1_000);
    console.log(`TableRoom created: ${this.roomId}`);
  }

  async endRoom(editorName: string): Promise<void> {
    const event: RoomEndedEvent = { message: `Room ended by ${editorName}.` };
    this.broadcast(ROOM_EVENTS.ROOM_ENDED, event);
    await this.disconnect(4000);
  }

  onDispose(): void {
    this.libraryBinding?.dispose(this.onLibraryChanged);
  }

  onAuth(_client: Client, options: unknown, context: AuthContext): CurrentUser {
    const user = this.authenticate(context.headers.get("cookie"), options);
    if (!user) throw new ServerError(401, "Authentication required.");
    return user;
  }

  onJoin(client: Client, _options: unknown, user: CurrentUser) {
    const playerId = randomUUID();
    const player = new PlayerState({
      id: playerId,
      userId: user.id,
      displayName: user.displayName,
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
    // A pointer that is gone is not hovering anything; leaving the highlight up
    // would credit a card to someone who is not there.
    clearPlayerHover(this.state, playerId);
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

  private deckEntries(deckId: string) {
    const deck = this.deckLookup?.getDeck(deckId);
    if (!deck || deck.setId !== this.setId) throw new DomainCommandError("Deck is not in this room's set.");
    return deck.entries;
  }

  private recordActivity(now: number): void {
    if (this.idleTimeout?.recordActivity(now)) this.broadcast(ROOM_EVENTS.ROOM_IDLE_RESUMED, {});
  }

  private pollIdleTimeout(): void {
    if (!this.idleTimeout || this.idleExpired) return;
    const result = this.idleTimeout.poll(Date.now());
    if (result.kind === "warn") {
      const event: RoomIdleWarningEvent = { endsAt: result.endsAt };
      this.broadcast(ROOM_EVENTS.ROOM_IDLE_WARNING, event);
    }
    if (result.kind === "expire") {
      this.idleExpired = true;
      void this.endRoom("the server");
    }
  }
}
