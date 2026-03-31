/**
 * Terminal UI using ink (React for the terminal).
 *
 * Replaces the broken blessed-based TUI.
 * - No mouse-tracking escape codes
 * - Proper terminal handling via ink
 * - stdin piping works (ink skips input when stdin is not a TTY)
 */

import React from 'react';
import { render, Box, Text, Newline, useInput, useApp } from 'ink';
import { PassThrough } from 'stream';
import type { Session, ToolCall, Message } from '../types.js';

// ───────────────────────── helpers ─────────────────────────

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function fmtTs(ts?: number): string {
  if (!ts || ts <= 0) return '';
  return new Date(ts).toISOString();
}

function fmtTsLabel(ts?: number): string {
  return fmtTs(ts) || 'no-timestamp';
}

function resolveMessageTs(message: Message, session: Session): number | undefined {
  return message.startTime || message.endTime || session.startTime || session.endTime;
}

function shorten(path: string, cwd?: string): string {
  if (cwd && path.startsWith(cwd)) {
    const s = path.slice(cwd.length);
    return s.startsWith('/') ? s.slice(1) : s;
  }
  return path;
}

function tcSummary(tc: ToolCall, cwd?: string): string {
  const a = tc.args;
  if (!a) return '';
  const p: string | undefined = a.path || a.file_path;
  if (p) return shorten(p, cwd);
  const cmd: string | undefined = a.command || a.simpleCommand;
  if (cmd) return String(cmd).substring(0, 60);
  return '';
}

function groupTCByModelCall(s: Session): Map<string, ToolCall[]> {
  const map = new Map<string, ToolCall[]>();
  for (const tc of s.toolCalls.values()) {
    const key = tc.modelCallId || '_orphan';
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push(tc);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.startedAt - b.startedAt);
  return map;
}

// ───────────────────────── components ──────────────────────

function SessionHeader({ session: s }: { session: Session }) {
  const id = s.id.substring(0, 8);
  const dur = (s.endTime && s.startTime) ? fmtDur(s.endTime - s.startTime) : 'running';
  const tsLabel = fmtTsLabel(s.startTime || s.endTime);
  return (
    <Box borderStyle="round" borderColor="blue" paddingX={1} flexDirection="column">
      <Text>
        <Text bold color="blue">Session {id}</Text>
        <Text dimColor> [{tsLabel}]</Text>
        <Text dimColor>  ·  </Text>
        <Text>{s.model || '?'}</Text>
        <Text dimColor>  ·  </Text>
        <Text>{dur}</Text>
      </Text>
      {s.cwd ? <Text dimColor>{s.cwd}</Text> : null}
    </Box>
  );
}

function UserBlock({ message, session }: { message: Message; session: Session }) {
  const text = (message.fullText || '').trim();
  const preview = text.length > 300 ? text.substring(0, 300) + '…' : text;
  const tsLabel = fmtTsLabel(resolveMessageTs(message, session));
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="green">
        ▶ User
        <Text dimColor> [{tsLabel}]</Text>
      </Text>
      <Box marginLeft={2}><Text wrap="wrap">{preview || '(empty)'}</Text></Box>
    </Box>
  );
}

function ToolCallLine({ tc, cwd, last }: { tc: ToolCall; cwd?: string; last: boolean }) {
  const prefix = last ? '└─' : '├─';
  const icon = tc.error
    ? <Text color="red">✗</Text>
    : tc.completedAt
      ? <Text color="green">✓</Text>
      : <Text color="yellow">⏳</Text>;
  const summary = tcSummary(tc, cwd);
  const dur = tc.duration != null ? fmtDur(tc.duration) : '';

  return (
    <Box>
      <Text dimColor>{prefix} </Text>
      {icon}
      <Text bold> {tc.name}</Text>
      {summary ? <Text dimColor>  {summary}</Text> : null}
      {dur ? <Text dimColor>  ({dur})</Text> : null}
      {tc.error ? <Text color="red">  ERROR</Text> : null}
    </Box>
  );
}

function AssistantBlock({ message, session, toolCalls, cwd }: {
  message: Message;
  session: Session;
  toolCalls: ToolCall[];
  cwd?: string;
}) {
  const text = (message.fullText || '').trim();
  const preview = text.length > 500 ? text.substring(0, 500) + '…' : text;
  const tsLabel = fmtTsLabel(resolveMessageTs(message, session));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        ◀ Assistant
        <Text dimColor> [{tsLabel}]</Text>
      </Text>
      {preview ? (
        <Box marginLeft={2}><Text wrap="wrap">{preview}</Text></Box>
      ) : null}
      {toolCalls.length > 0 ? (
        <Box flexDirection="column" marginLeft={2} marginTop={preview ? 1 : 0}>
          {toolCalls.map((tc, i) => (
            <ToolCallLine
              key={tc.id}
              tc={tc}
              cwd={cwd}
              last={i === toolCalls.length - 1}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function ResultBlock({ result, session }: { result: any; session: Session }) {
  const sub = result.subtype || 'unknown';
  const dur = result.duration_ms ? fmtDur(result.duration_ms) : '';
  const isErr = result.is_error;
  const cost = result.total_cost_usd != null ? `$${result.total_cost_usd.toFixed(4)}` : '';
  const turns = result.num_turns != null ? `${result.num_turns} turn${result.num_turns !== 1 ? 's' : ''}` : '';
  const meta = [dur, cost, turns].filter(Boolean).join('  ·  ');
  const tsLabel = fmtTsLabel(result.timestamp_ms || session.endTime || session.startTime);
  return (
    <Box marginTop={1}>
      <Text bold color={isErr ? 'red' : 'green'}>
        {isErr ? '✗' : '✔'} Result: {sub}
        <Text dimColor> [{tsLabel}]</Text>
      </Text>
      {meta ? <Text dimColor>  ({meta})</Text> : null}
    </Box>
  );
}

function SessionView({ session }: { session: Session }) {
  const msgs = [...session.messages.values()].sort((a, b) => a.startTime - b.startTime);
  const tcByMC = groupTCByModelCall(session);
  const orphanTs = fmtTs(
    (tcByMC.get('_orphan') || []).reduce((min, tc) => {
      if (!tc.startedAt) return min;
      return !min || tc.startedAt < min ? tc.startedAt : min;
    }, 0 as number),
  );
  const orphanTsLabel = orphanTs || 'no-timestamp';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <SessionHeader session={session} />

      {msgs.map((m) => {
        if (m.role === 'user') {
          return <UserBlock key={m.key} message={m} session={session} />;
        }
        const tcs = m.modelCallId ? (tcByMC.get(m.modelCallId) || []) : [];
        const hasText = (m.fullText || '').trim().length > 0;
        if (!hasText && tcs.length === 0) return null;
        return (
          <AssistantBlock
            key={m.key}
            message={m}
            session={session}
            toolCalls={tcs}
            cwd={session.cwd}
          />
        );
      })}

      {(tcByMC.get('_orphan') || []).length > 0 && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text bold dimColor>
            Other Tool Calls
            <Text dimColor> [{orphanTsLabel}]</Text>
          </Text>
          {(tcByMC.get('_orphan') || []).map((tc, i, arr) => (
            <ToolCallLine key={tc.id} tc={tc} cwd={session.cwd} last={i === arr.length - 1} />
          ))}
        </Box>
      )}

      {session.results.map((r, i) => <ResultBlock key={`r${i}`} result={r} session={session} />)}
    </Box>
  );
}

// ───────────────────────── root ────────────────────────────

interface AppProps {
  sessions: Map<string, Session>;
  interactive?: boolean;
}

function App({ sessions, interactive }: AppProps) {
  const { exit } = useApp();

  useInput((input: string, key: { escape?: boolean }) => {
    if (interactive && (input === 'q' || key.escape)) {
      exit();
    }
  });

  const list = [...sessions.values()];

  if (list.length === 0) {
    return <Text dimColor>Waiting for data…</Text>;
  }

  return (
    <Box flexDirection="column">
      {list.map(s => <SessionView key={s.id} session={s} />)}
      {interactive ? (
        <Box marginTop={1}><Text dimColor>Press q to quit</Text></Box>
      ) : null}
    </Box>
  );
}

// ───────────────────────── public API ──────────────────────

export interface TUIHandle {
  update(sessions: Map<string, Session>): void;
  destroy(): void;
  waitUntilExit(): Promise<void>;
}

/**
 * Check whether the real stdin supports raw mode.
 * Piped stdin and some terminals (Cursor IDE) lack it.
 */
function stdinSupportsRaw(): boolean {
  try {
    return process.stdin.isTTY === true && typeof process.stdin.setRawMode === 'function';
  } catch {
    return false;
  }
}

/**
 * Create a fake stdin stream that ink will accept.
 * Must quack like a TTY: setRawMode, ref, unref, isTTY, etc.
 */
function createMockStdin(): NodeJS.ReadableStream {
  const mock = new PassThrough() as any;
  mock.isTTY = true;
  mock.isRaw = false;
  mock.setRawMode = (mode: boolean) => { mock.isRaw = mode; return mock; };
  mock.ref = () => mock;
  mock.unref = () => mock;
  return mock;
}

export function createTUI(interactive: boolean): TUIHandle {
  const canRaw = stdinSupportsRaw();
  const effectiveInteractive = interactive && canRaw;

  // If stdin can't do raw mode (piped input, Cursor terminal, etc.)
  // give ink a mock stdin that fakes raw-mode support so it won't crash.
  const stdin = canRaw ? process.stdin : createMockStdin();

  const inst = render(
    React.createElement(App, { sessions: new Map(), interactive: effectiveInteractive }),
    { stdin } as any,
  );

  return {
    update(sessions: Map<string, Session>) {
      inst.rerender(
        React.createElement(App, { sessions, interactive: effectiveInteractive }),
      );
    },
    destroy() {
      inst.unmount();
    },
    async waitUntilExit() {
      if (!effectiveInteractive) {
        // No keyboard input, so waitUntilExit would hang forever.
        // Caller controls lifecycle instead.
        return;
      }
      await inst.waitUntilExit();
    },
  };
}
