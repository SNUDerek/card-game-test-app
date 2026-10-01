/**
 * Path reserved for reaching the Colyseus server through whatever is serving
 * the client: nginx in Docker, the Vite dev server locally. Both strip the
 * prefix before forwarding, so the server itself never sees it.
 *
 * The Colyseus SDK keeps the pathname of the endpoint it is given and uses it
 * for matchmaking HTTP *and* the room WebSocket, so one prefix covers both.
 */
export const COLYSEUS_PROXY_PATH = "/colyseus";

/** Runtime configuration, written by the container at start-up. */
export interface RuntimeConfig {
  /**
   * Base URL to build shareable room links from, including the port. Empty
   * means "wherever this page was loaded from".
   */
  clientUrl?: string;
}

declare global {
  interface Window {
    __CARD_TABLE__?: RuntimeConfig;
  }
}

/**
 * Resolves the tabletop server on the page's own origin. Authentication uses
 * a SameSite cookie, so direct cross-origin server overrides are deliberately
 * unsupported.
 *
 * Using the full `host` rather than the hostname is what keeps a non-default
 * port working; an earlier version hard-coded the server's port here.
 */
export function resolveServerEndpoint(
  location: { protocol: string; host: string },
): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${COLYSEUS_PROXY_PATH}`;
}

/**
 * Base a shareable room link is built on.
 *
 * Defaults to the page's own origin, which is right whenever players reach the
 * table by the same address. It is wrong when they do not: a link copied from a
 * tunnel, a reverse proxy, or a session opened on the host itself carries
 * whatever that browser used -- `localhost` included -- which is useless to the
 * person receiving it. `clientUrl` names the address players should actually
 * use, port and all.
 */
export function resolveJoinUrlBase(origin: string, runtime?: RuntimeConfig): string {
  const configured = runtime?.clientUrl?.trim();
  // Trailing slash removed so the room path does not produce a doubled slash.
  return (configured || origin).replace(/\/+$/, "");
}
