import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("application routing", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/auth/me") {
        return new Response(JSON.stringify({ user: { id: "u1", username: "alice", displayName: "Alice" } }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/api/sets") {
        return new Response(JSON.stringify({ sets: [] }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/api/cards") {
        return new Response(JSON.stringify({ cards: [] }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    });
  });

  it("renders the lazy sets placeholder", async () => {
    window.history.replaceState({}, "", "/sets");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Card sets" })).toBeInTheDocument();
  });

  it("redirects legacy room links to the plural route", async () => {
    window.history.replaceState({}, "", "/room/ROOM1");
    render(<App />);
    await screen.findByText("Join");
    expect(window.location.pathname).toBe("/rooms/ROOM1");
  });
});
