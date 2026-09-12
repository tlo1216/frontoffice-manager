#!/usr/bin/env bash
# Stores an OpenAI runtime API key for the Secure MCP Tunnel in a file only your
# user can read. Run it yourself in a terminal. The key is typed hidden and is
# never echoed, logged, committed, or shown to the agent.
#
#   bash tools/set-runtime-key.sh              # default name: espn-chatgpt
#   bash tools/set-runtime-key.sh my-tunnel
#
# Then point the tunnel profile at it:
#   --control-plane-api-key-ref "file:$HOME/.config/tunnel-client/secrets/<name>.key"

set -euo pipefail

NAME="${1:-espn-chatgpt}"
DIR="$HOME/.config/tunnel-client/secrets"
FILE="$DIR/$NAME.key"

mkdir -p "$DIR"
chmod 700 "$DIR"

printf 'Paste the OpenAI runtime API key (sk-...) for tunnel "%s": ' "$NAME"
read -rs KEY
printf '\n'

if [ -z "${KEY:-}" ]; then
  echo "Nothing entered. Nothing saved." >&2
  exit 1
fi
case "$KEY" in
  sk-*) ;;
  *) echo "That does not look like an OpenAI API key (expected it to start with sk-). Nothing saved." >&2; exit 1 ;;
esac

umask 077
printf '%s' "$KEY" > "$FILE"
chmod 600 "$FILE"
KEY=""

echo
echo "Saved to $FILE"
echo "Readable by $(whoami) only. Not in the repo, not in git."
echo "Profile reference:  file:$FILE"
