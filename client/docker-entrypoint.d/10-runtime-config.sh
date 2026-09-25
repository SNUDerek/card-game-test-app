#!/bin/sh
# Writes the client's runtime configuration before nginx starts.
#
# This exists because Vite inlines VITE_* variables at build time: without it,
# pointing a deployment at a different server would mean rebuilding the image.
set -eu

: "${PUBLIC_SERVER_URL:=}"
: "${PUBLIC_CLIENT_URL:=}"

# Escaped so a URL containing quotes or backslashes cannot break out of the
# string literal and into the page's JavaScript.
escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > /usr/share/nginx/html/config.js <<EOF
// Generated at container start.
// serverUrl: empty means "same origin", reaching the Colyseus server through
//   /colyseus on this host and port.
// clientUrl: empty means shared room links are built from whatever address the
//   browser used to load this page.
window.__CARD_TABLE__ = {
  serverUrl: "$(escape "$PUBLIC_SERVER_URL")",
  clientUrl: "$(escape "$PUBLIC_CLIENT_URL")"
};
EOF

if [ -n "$PUBLIC_SERVER_URL" ]; then
  echo "runtime-config: tabletop server set to ${PUBLIC_SERVER_URL}"
else
  echo "runtime-config: tabletop server on this origin via /colyseus"
fi

if [ -n "$PUBLIC_CLIENT_URL" ]; then
  echo "runtime-config: room links built from ${PUBLIC_CLIENT_URL}"
else
  echo "runtime-config: room links built from the address the browser used"
fi
