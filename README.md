# Agent Log Pretty-Printer

Parse and format **JSONL log files** (e.g. Cursor/agent session logs) into a human-readable **terminal UI** or **markdown** output. Sessions, messages, tool calls, and results are grouped and displayed in a clear, navigable way.

## Prerequisites

- **Node.js** (v18+)

## Install

**As a global CLI (recommended):**

```bash
npm install -g agent-pretty-print
```

**As a project dependency:**

```bash
npm install agent-pretty-print
npx agent-pretty-print [options] [file]
```


## Usage

**Pipe JSONL in** (most common):

```bash
cat agent.log | agent-pretty-print
something-that-outputs-jsonl | agent-pretty-print -o report.md
```

**Or pass a file:**

```bash
agent-pretty-print path/to/log.jsonl
agent-pretty-print path/to/log.jsonl -o report.md
```

If you installed it as a project dependency, use `npx`:

```bash
cat agent.log | npx agent-pretty-print
npx agent-pretty-print path/to/log.jsonl
```

### Input

- **Stdin:** Pipe JSONL into the command (omit the file argument or use `-`).
- **File:** Pass the path as the first argument.

### Output modes

| Scenario | Result |
|----------|--------|
| `agent-pretty-print <file>` (TTY) | **Interactive TUI** — browse sessions, messages, tool calls. Press **q** to quit. |
| `agent-pretty-print <file> -o out.md` | Write **markdown** to `out.md` (no TUI). |
| `agent-pretty-print <file> -w` | **Watch** the file; TUI updates as new lines are appended. |
| `command \| agent-pretty-print` | Read from **stdin**; TUI renders (non-interactive), then exits. |
| `command \| agent-pretty-print -o out.md` | Stdin → **markdown** file. |

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
| `--synthetic-timestamps` | Generate synthetic timestamps when log events do not provide any. |

## Examples

```bash
# Pipe a log file into the TUI
cat agent.jsonl | agent-pretty-print

# Pipe to markdown
cat agent.jsonl | agent-pretty-print -o report.md

# Interactive TUI for a file
agent-pretty-print path/to/log.jsonl

# Write markdown report
agent-pretty-print path/to/log.jsonl -o report.md

# Watch a live log (e.g. while an agent runs)
agent-pretty-print /path/to/live.log -w

# Only sessions with errors
agent-pretty-print path/to/log.jsonl -e -o errors.md

# Single session
agent-pretty-print path/to/log.jsonl -s 5a5c2d32-6863-47f6-ac2e-c55f5143938d
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
