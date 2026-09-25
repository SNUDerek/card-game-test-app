import {
  TABLE_COMMANDS,
  type SpawnCardPayload,
  type SpawnCardResult,
} from "@card-table/shared";
import type { Room } from "@colyseus/sdk";

export function spawnCard(room: Room, payload: SpawnCardPayload): Promise<SpawnCardResult> {
  return room.request(TABLE_COMMANDS.SPAWN_CARD, payload);
}
