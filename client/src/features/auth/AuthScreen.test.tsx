import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";

describe("AuthScreen", () => {
  it("switches between login and registration fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", {
      status: 401, headers: { "Content-Type": "application/json" },
    }));
    render(<AuthProvider><AuthScreen /></AuthProvider>);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /need an account/i }));
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.getByLabelText("Signup code")).toBeInTheDocument();
  });
});
