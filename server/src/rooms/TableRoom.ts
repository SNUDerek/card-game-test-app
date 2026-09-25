import { Room, type Client } from "colyseus";

export class TableRoom extends Room {
  onCreate() {
    console.log(`TableRoom created: ${this.roomId}`);
  }

  onJoin(client: Client) {
    console.log(`${client.sessionId} joined ${this.roomId}`);
  }

  onLeave(client: Client) {
    console.log(`${client.sessionId} left ${this.roomId}`);
  }
}
