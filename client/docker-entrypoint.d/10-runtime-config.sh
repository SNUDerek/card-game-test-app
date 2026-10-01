#!/bin/sh
# Writes the client's runtime configuration before nginx starts.
#
# This exists because Vite inlines VITE_* variables at build time: without it,
# pointing a deployment at a different server would mean rebuilding the image.
set -eu

: "${PUBLIC_CLIENT_URL:=}"

# Escaped so a URL containing quotes or backslashes cannot break out of the
# string literal and into the page's JavaScript.
escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > /usr/share/nginx/html/config.js <<EOF
// Generated at container start.
// clientUrl: empty means shared room links are built from whatever address the
//   browser used to load this page.
window.__CARD_TABLE__ = { clientUrl: "$(escape "$PUBLIC_CLIENT_URL")" };
EOF

echo "runtime-config: tabletop server on this origin via /colyseus"

if [ -n "$PUBLIC_CLIENT_URL" ]; then
  echo "runtime-config: room links built from ${PUBLIC_CLIENT_URL}"
else
  echo "runtime-config: room links built from the address the browser used"
fi
