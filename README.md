# Agent Log Pretty-Printer

Parse and format **JSONL log files** (e.g. Cursor/agent session logs) into a human-readable **terminal UI** or **markdown** output. Sessions, messages, tool calls, and results are grouped and displayed in a clear, navigable way.

## Prerequisites

- **Node.js** (v18+)
- **tsx** (TypeScript runner) — install globally or use via `npx`

## Install

```bash
npm install
```

## Usage

Run the parser with either:

```bash
npm run parse -- [options] [file]
```

or the wrapper script (resolves paths from your current directory):

```bash
./parse-log.sh [options] [file]
```

If you use `tsx` directly, pass the log file path and any options:

```bash
tsx parse-log.ts [options] [file]
```

### Input

- **File:** Path to a JSONL file (one JSON object per line).
- **Stdin:** Omit the file (or use `-`) and pipe JSONL in:
  ```bash
  cat agent.log | npm run parse --
  ```

### Output modes

| Scenario | Result |
|----------|--------|
| `parse-log <file>` (TTY) | **Interactive TUI** — browse sessions, messages, tool calls. Press **q** to quit. |
| `parse-log <file> -o out.md` | Write **markdown** to `out.md` (no TUI). |
| `parse-log <file> -w` | **Watch** the file; TUI updates as new lines are appended. |
| `command \| parse-log` | Read from **stdin**; TUI renders (non-interactive), then exits. |
| `command \| parse-log -o out.md` | Stdin → **markdown** file. |

When stdout is not a TTY (e.g. in a pipe or CI), TUI is disabled unless you pass `-t`. Use `-o <path>` to write markdown instead.

## Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Write formatted output as markdown to this file. |
| `-r, --raw <path>` | Tee each raw JSONL line to a file (useful for debugging). |
| `-t, --tui` | Force TUI mode even when stdout is not a TTY. |
| `-w, --watch` | Watch the log file for new lines and refresh (use with TUI or `-o`). |
| `-s, --session-id <id>` | Show only the session with this ID. |
| `-e, --errors-only` | Show only sessions that contain errors (tool or result errors). |

## Examples

```bash
# Interactive TUI for a log file
npm run parse -- logs/readme

# Write markdown report
npm run parse -- logs/readme -o report.md

# Watch a live log (e.g. while an agent runs)
npm run parse -- /path/to/live.log -w

# Only sessions with errors
npm run parse -- logs/readme -e -o errors.md

# Single session
npm run parse -- logs/readme -s 5a5c2d32-6863-47f6-ac2e-c55f5143938d

# From stdin to markdown
cat agent.jsonl | npm run parse -- -o report.md
```

## Input format (JSONL)

Each line must be a JSON object (log event). The parser expects events with at least:

- `type`: one of `system`, `user`, `assistant`, `tool_call`, `result`, `thinking`
- `session_id`: string (groups events into sessions)
- Optional: `timestamp_ms`, `model_call_id`, `call_id`, `message`, `tool_call`, `result`, `text`, `model`, `cwd`, `is_error`, etc.

See `logs/readme` in this repo for an example JSONL stream (Cursor-style agent transcript).

## Project structure

- **`parse-log.ts`** — CLI entry (Commander); wires parser, TUI, and markdown formatter.
- **`src/parser.ts`** — Reads JSONL (file/stdin/watch), aggregates by session.
- **`src/session.ts`** — Builds sessions, tool calls, and messages from events.
- **`src/formatters/tui.tsx`** — Interactive terminal UI (ink/React).
- **`src/formatters/markdown.ts`** — Markdown output for reports.
- **`src/types.ts`** — Shared types for events, sessions, tool calls, messages.

## License

Use and modify as needed for your environment.
