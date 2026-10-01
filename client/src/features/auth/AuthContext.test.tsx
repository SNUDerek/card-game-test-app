import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useCurrentUser } from "./AuthContext";

function Probe() {
  const { status, user } = useCurrentUser();
  return <p>{status}:{user?.displayName ?? "none"}</p>;
}

describe("AuthProvider", () => {
  it("restores the current user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      user: { id: "u1", username: "alice", displayName: "Alice" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("authenticated:Alice")).toBeInTheDocument();
  });

  it("becomes anonymous when the session is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", {
      status: 401, headers: { "Content-Type": "application/json" },
    }));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("anonymous:none")).toBeInTheDocument();
  });
});
