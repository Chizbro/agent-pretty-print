#!/bin/bash
# Wrapper script to run the TypeScript log parser.
# Resolves file/path arguments to absolute paths before cd-ing to script dir.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_CWD="$(pwd)"

# Make a path absolute (works for files that don't exist yet)
abs_path() {
  local p="$1"
  if [[ "$p" = /* ]]; then
    echo "$p"
  else
    echo "${ORIG_CWD}/${p}"
  fi
}

# Resolve file argument (first non-flag arg) and path-valued flags to absolute paths
ARGS=()
FILE_RESOLVED=""
NEXT_IS_PATH=""

for arg in "$@"; do
  if [[ -n "$NEXT_IS_PATH" ]]; then
    # Previous arg was a flag that takes a path value
    ARGS+=("$(abs_path "$arg")")
    NEXT_IS_PATH=""
  elif [[ "$arg" == "-o" || "$arg" == "--output" || "$arg" == "-r" || "$arg" == "--raw" ]]; then
    ARGS+=("$arg")
    NEXT_IS_PATH=1
  elif [[ "$arg" != -* && -z "$FILE_RESOLVED" ]]; then
    # First non-flag argument is the input file path
    if [[ "$arg" != "-" && -e "$arg" ]]; then
      ARGS+=("$(cd "$(dirname "$arg")" && pwd)/$(basename "$arg")")
    else
      ARGS+=("$arg")
    fi
    FILE_RESOLVED=1
  else
    ARGS+=("$arg")
  fi
done

cd "$SCRIPT_DIR"

if command -v tsx &> /dev/null; then
    tsx parse-log.ts "${ARGS[@]}"
elif command -v npx &> /dev/null; then
    npx tsx parse-log.ts "${ARGS[@]}"
else
    echo "Error: tsx is required. Install with: npm install -g tsx" >&2
    exit 1
fi
