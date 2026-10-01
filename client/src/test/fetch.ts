import { vi } from "vitest";

type Route = (init: RequestInit | undefined) => { status?: number; body?: unknown };

/**
 * Stubs `fetch` with handlers keyed by "METHOD path". Unmatched requests fail
 * the test loudly instead of hanging on an unresolved promise.
 */
export function stubFetch(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request: ${key}`);
    const { status = 200, body } = route(init);
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The parsed JSON body of the stubbed request matching `key`, if one was sent. */
export function sentBody(fetchMock: ReturnType<typeof stubFetch>, key: string): unknown {
  const call = fetchMock.mock.calls.find(([path, init]) => `${init?.method ?? "GET"} ${path}` === key);
  return call?.[1]?.body ? JSON.parse(call[1].body as string) : undefined;
}
