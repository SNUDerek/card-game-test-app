// Runtime configuration, read before the app bundle loads.
//
// In Docker this file is regenerated when the container starts, from
// PUBLIC_SERVER_URL. Editing it here only affects `npm run dev`.
//
// An empty serverUrl means "same origin": the client reaches the Colyseus
// server through /colyseus on whatever host and port served this page.
// An empty clientUrl means shared room links are built from that same address.
window.__CARD_TABLE__ = { serverUrl: "", clientUrl: "" };
