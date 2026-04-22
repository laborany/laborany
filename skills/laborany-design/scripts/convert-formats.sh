#!/usr/bin/env bash
# Wrapper preserved for backward compatibility — delegates to convert-formats.mjs.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/convert-formats.mjs" "$@"
