/**
 * Which live rooms are using which set. A set in use cannot be archived, nor
 * can its cards. In memory only: a restart ends every room, and so every lock.
 *
 * Each room is bound to exactly one set for its whole life.
 */
export class SetUsageRegistry {
  private readonly setIdByRoom = new Map<string, string>();
  private readonly roomIdsBySet = new Map<string, Set<string>>();

  /** Registers a room as using a set. Call before the room can deal any cards. */
  acquire(setId: string, roomId: string): void {
    const current = this.setIdByRoom.get(roomId);
    if (current === setId) return;
    if (current !== undefined) {
      throw new Error(`Room ${roomId} already uses set ${current}.`);
    }
    this.setIdByRoom.set(roomId, setId);
    const rooms = this.roomIdsBySet.get(setId) ?? new Set<string>();
    rooms.add(roomId);
    this.roomIdsBySet.set(setId, rooms);
  }

  /** Drops a room's registration, on disposal or failed creation. Safe to repeat. */
  release(roomId: string): void {
    const setId = this.setIdByRoom.get(roomId);
    if (setId === undefined) return;
    this.setIdByRoom.delete(roomId);
    const rooms = this.roomIdsBySet.get(setId)!;
    rooms.delete(roomId);
    if (rooms.size === 0) this.roomIdsBySet.delete(setId);
  }

  /** Replaces an HTTP creation reservation with its newly-created room id. */
  transfer(fromRoomId: string, toRoomId: string): void {
    const setId = this.setIdByRoom.get(fromRoomId);
    if (!setId) return;
    this.release(fromRoomId);
    this.acquire(setId, toRoomId);
  }

  isInUse(setId: string): boolean {
    return this.roomIdsBySet.has(setId);
  }

  roomsUsing(setId: string): string[] {
    return [...(this.roomIdsBySet.get(setId) ?? [])];
  }

  setUsedBy(roomId: string): string | undefined {
    return this.setIdByRoom.get(roomId);
  }
}
