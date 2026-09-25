#!/bin/sh
# Writes the client's runtime configuration before nginx starts.
#
# This exists because Vite inlines VITE_* variables at build time: without it,
# pointing a deployment at a different server would mean rebuilding the image.
set -eu

: "${PUBLIC_SERVER_URL:=}"

# Escaped so a URL containing quotes or backslashes cannot break out of the
# string literal and into the page's JavaScript.
escaped=$(printf '%s' "$PUBLIC_SERVER_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > /usr/share/nginx/html/config.js <<EOF
// Generated at container start. Empty serverUrl means "same origin",
// reaching the Colyseus server through /colyseus on this host and port.
window.__CARD_TABLE__ = { serverUrl: "${escaped}" };
EOF

if [ -n "$PUBLIC_SERVER_URL" ]; then
  echo "runtime-config: tabletop server set to ${PUBLIC_SERVER_URL}"
else
  echo "runtime-config: tabletop server on this origin via /colyseus"
fi
