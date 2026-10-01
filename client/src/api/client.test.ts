import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, setUnauthorizedHandler } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
  setUnauthorizedHandler(undefined);
});

describe("apiRequest", () => {
  it("parses successful responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ value: 3 }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    await expect(apiRequest("/api/example", z.object({ value: z.number() })))
      .resolves.toEqual({ value: 3 });
  });

  it("defaults JSON bodies to application/json but leaves binary uploads alone", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    await apiRequest("/api/sets", z.unknown(), { method: "POST", body: "{}" });
    await apiRequest("/api/images", z.unknown(), {
      method: "POST", body: new Blob(["x"]), headers: new Headers({ "Content-Type": "image/webp" }),
    });
    const contentType = (call: number) => new Headers(fetchMock.mock.calls[call]![1]!.headers).get("Content-Type");
    expect(contentType(0)).toBe("application/json");
    expect(contentType(1)).toBe("image/webp");
  });

  it("turns 409 responses into typed conflicts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: "Reload first.", code: "stale_revision",
    }), { status: 409, headers: { "Content-Type": "application/json" } }));
    await expect(apiRequest("/api/example", z.unknown())).rejects.toMatchObject({
      status: 409, code: "stale_revision", message: "Reload first.",
    });
  });

  it("notifies auth on 401", async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", {
      status: 401, headers: { "Content-Type": "application/json" },
    }));
    await expect(apiRequest("/api/example", z.unknown())).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledOnce();
  });
});
