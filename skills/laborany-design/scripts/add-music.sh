#!/usr/bin/env bash
# Wrapper preserved for backward compatibility — delegates to add-music.mjs.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/add-music.mjs" "$@"
