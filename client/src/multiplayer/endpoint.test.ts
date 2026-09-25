import { describe, expect, it } from "vitest";
import {
  COLYSEUS_PROXY_PATH,
  resolveJoinUrlBase,
  resolveServerEndpoint,
} from "./endpoint";

const http = { protocol: "http:", host: "jennifer.dereks.house:9000" };
const https = { protocol: "https:", host: "cards.example" };

describe("resolveServerEndpoint", () => {
  it("defaults to the page's own origin and port", () => {
    expect(resolveServerEndpoint(http)).toBe(
      `ws://jennifer.dereks.house:9000${COLYSEUS_PROXY_PATH}`,
    );
  });

  it("upgrades to a secure socket when the page is served over https", () => {
    expect(resolveServerEndpoint(https)).toBe(`wss://cards.example${COLYSEUS_PROXY_PATH}`);
  });

  it("prefers the runtime URL, so a deployment needs no rebuild", () => {
    expect(
      resolveServerEndpoint(http, { serverUrl: "http://jennifer.dereks.house:9001" }),
    ).toBe("http://jennifer.dereks.house:9001");
  });

  it("lets the runtime URL win over one baked in at build time", () => {
    expect(
      resolveServerEndpoint(http, { serverUrl: "http://runtime:9001" }, "http://build:1234"),
    ).toBe("http://runtime:9001");
  });

  it("falls back to the build-time URL when no runtime one is configured", () => {
    expect(resolveServerEndpoint(http, {}, "http://build:1234")).toBe("http://build:1234");
  });

  it("treats an empty or blank configured URL as unset", () => {
    // The generated config.js always defines serverUrl; empty means "same origin".
    expect(resolveServerEndpoint(http, { serverUrl: "" })).toBe(
      `ws://jennifer.dereks.house:9000${COLYSEUS_PROXY_PATH}`,
    );
    expect(resolveServerEndpoint(http, { serverUrl: "   " }, "")).toBe(
      `ws://jennifer.dereks.house:9000${COLYSEUS_PROXY_PATH}`,
    );
  });
});

describe("resolveJoinUrlBase", () => {
  it("uses the page's own origin when nothing is configured", () => {
    expect(resolveJoinUrlBase("http://jennifer.dereks.house:9000")).toBe(
      "http://jennifer.dereks.house:9000",
    );
    expect(resolveJoinUrlBase("http://localhost:9000", {})).toBe("http://localhost:9000");
  });

  it("prefers the configured address, so a link is never shared as localhost", () => {
    expect(
      resolveJoinUrlBase("http://localhost:9000", {
        clientUrl: "http://jennifer.dereks.house:9000",
      }),
    ).toBe("http://jennifer.dereks.house:9000");
  });

  it("drops a trailing slash so the room path does not double up", () => {
    expect(
      resolveJoinUrlBase("http://localhost:9000", {
        clientUrl: "http://jennifer.dereks.house:9000/",
      }),
    ).toBe("http://jennifer.dereks.house:9000");
  });

  it("treats a blank configured address as unset", () => {
    expect(resolveJoinUrlBase("http://localhost:9000", { clientUrl: "   " })).toBe(
      "http://localhost:9000",
    );
  });
});
