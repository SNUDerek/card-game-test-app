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
  /** Absolute URL of the Colyseus server. Empty means "same origin". */
  serverUrl?: string;
}

declare global {
  interface Window {
    __CARD_TABLE__?: RuntimeConfig;
  }
}

/**
 * Decides where the tabletop server lives, most specific source first:
 *
 * 1. `runtime.serverUrl` — written into config.js when the container starts, so
 *    a deployment can be pointed at a separately exposed server without
 *    rebuilding the image.
 * 2. `buildTimeUrl` — `VITE_COLYSEUS_URL`, baked in at build. Convenient when
 *    running the dev server against a remote backend.
 * 3. The page's own origin plus {@link COLYSEUS_PROXY_PATH}. This is the
 *    default because it needs no configuration at all and follows the page
 *    wherever it is served from: any host, any port, http or https.
 *
 * Using the full `host` rather than the hostname is what keeps a non-default
 * port working; an earlier version hard-coded the server's port here.
 */
export function resolveServerEndpoint(
  location: { protocol: string; host: string },
  runtime?: RuntimeConfig,
  buildTimeUrl?: string,
): string {
  const configured = runtime?.serverUrl?.trim() || buildTimeUrl?.trim();
  if (configured) return configured;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${COLYSEUS_PROXY_PATH}`;
}
