#!/usr/bin/env bash
# filedrop installer — use like tailscale:
#   curl -fsSL https://filedrop.xyz/install.sh | sh
set -euo pipefail

# Source of the filedrop CLI script. Prefer same-host (short, stable, you own it),
# fall back to GitHub raw if the primary is unreachable. Override with FILEDROP_SOURCE_URL.
PRIMARY_SRC="${FILEDROP_SOURCE_URL:-https://filedrop.xyz/filedrop}"
FALLBACK_SRC="${FILEDROP_FALLBACK_URL:-https://raw.githubusercontent.com/JoelAHilliard/filedrop/main/filedrop}"
DEST_DIR="${HOME}/.local/bin"
DEST="${DEST_DIR}/filedrop"

command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || echo "warning: openssl not found (needed to run filedrop)" >&2
command -v python3 >/dev/null 2>&1 || echo "warning: python3 not found (needed to run filedrop)" >&2

echo "Installing filedrop to ${DEST} ..."
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

if curl -fsSL --connect-timeout 10 "${PRIMARY_SRC}" -o "$tmp"; then
  echo "  fetched ${PRIMARY_SRC}"
else
  echo "  primary failed, trying ${FALLBACK_SRC}"
  curl -fsSL --connect-timeout 10 "${FALLBACK_SRC}" -o "$tmp" || { echo "download failed" >&2; exit 1; }
fi
chmod +x "$tmp"
mkdir -p "${DEST_DIR}"
mv "$tmp" "${DEST}"
trap - EXIT

case ":${PATH}:" in
  *":${DEST_DIR}:"*) echo "Installed: ${DEST} (on PATH)" ;;
  *) echo "Installed: ${DEST} (NOT on PATH). Add:  export PATH=\"${DEST_DIR}:\$PATH\"" ;;
esac
echo "Try: filedrop --help"