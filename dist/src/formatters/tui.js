/**
 * Terminal UI using ink (React for the terminal).
 *
 * Replaces the broken blessed-based TUI.
 * - No mouse-tracking escape codes
 * - Proper terminal handling via ink
 * - stdin piping works (ink skips input when stdin is not a TTY)
 */
import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { PassThrough } from 'stream';
// ───────────────────────── helpers ─────────────────────────
function fmtDur(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60)
        return rs ? `${m}m ${rs}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
}
function shorten(path, cwd) {
    if (cwd && path.startsWith(cwd)) {
        const s = path.slice(cwd.length);
        return s.startsWith('/') ? s.slice(1) : s;
    }
    return path;
}
function tcSummary(tc, cwd) {
    const a = tc.args;
    if (!a)
        return '';
    const p = a.path || a.file_path;
    if (p)
        return shorten(p, cwd);
    const cmd = a.command || a.simpleCommand;
    if (cmd)
        return String(cmd).substring(0, 60);
    return '';
}
function groupTCByModelCall(s) {
    const map = new Map();
    for (const tc of s.toolCalls.values()) {
        const key = tc.modelCallId || '_orphan';
        let arr = map.get(key);
        if (!arr) {
            arr = [];
            map.set(key, arr);
        }
        arr.push(tc);
    }
    for (const arr of map.values())
        arr.sort((a, b) => a.startedAt - b.startedAt);
    return map;
}
// ───────────────────────── components ──────────────────────
function SessionHeader({ session: s }) {
    const id = s.id.substring(0, 8);
    const dur = (s.endTime && s.startTime) ? fmtDur(s.endTime - s.startTime) : 'running';
    return (React.createElement(Box, { borderStyle: "round", borderColor: "blue", paddingX: 1, flexDirection: "column" },
        React.createElement(Text, null,
            React.createElement(Text, { bold: true, color: "blue" },
                "Session ",
                id),
            React.createElement(Text, { dimColor: true }, "  \u00B7  "),
            React.createElement(Text, null, s.model || '?'),
            React.createElement(Text, { dimColor: true }, "  \u00B7  "),
            React.createElement(Text, null, dur)),
        s.cwd ? React.createElement(Text, { dimColor: true }, s.cwd) : null));
}
function UserBlock({ message }) {
    const text = (message.fullText || '').trim();
    const preview = text.length > 300 ? text.substring(0, 300) + '…' : text;
    return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
        React.createElement(Text, { bold: true, color: "green" }, "\u25B6 User"),
        React.createElement(Box, { marginLeft: 2 },
            React.createElement(Text, { wrap: "wrap" }, preview || '(empty)'))));
}
function ToolCallLine({ tc, cwd, last }) {
    const prefix = last ? '└─' : '├─';
    const icon = tc.error
        ? React.createElement(Text, { color: "red" }, "\u2717")
        : tc.completedAt
            ? React.createElement(Text, { color: "green" }, "\u2713")
            : React.createElement(Text, { color: "yellow" }, "\u23F3");
    const summary = tcSummary(tc, cwd);
    const dur = tc.duration != null ? fmtDur(tc.duration) : '';
    return (React.createElement(Box, null,
        React.createElement(Text, { dimColor: true },
            prefix,
            " "),
        icon,
        React.createElement(Text, { bold: true },
            " ",
            tc.name),
        summary ? React.createElement(Text, { dimColor: true },
            "  ",
            summary) : null,
        dur ? React.createElement(Text, { dimColor: true },
            "  (",
            dur,
            ")") : null,
        tc.error ? React.createElement(Text, { color: "red" }, "  ERROR") : null));
}
function AssistantBlock({ message, toolCalls, cwd }) {
    const text = (message.fullText || '').trim();
    const preview = text.length > 500 ? text.substring(0, 500) + '…' : text;
    return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
        React.createElement(Text, { bold: true, color: "cyan" }, "\u25C0 Assistant"),
        preview ? (React.createElement(Box, { marginLeft: 2 },
            React.createElement(Text, { wrap: "wrap" }, preview))) : null,
        toolCalls.length > 0 ? (React.createElement(Box, { flexDirection: "column", marginLeft: 2, marginTop: preview ? 1 : 0 }, toolCalls.map((tc, i) => (React.createElement(ToolCallLine, { key: tc.id, tc: tc, cwd: cwd, last: i === toolCalls.length - 1 }))))) : null));
}
function ResultBlock({ result }) {
    const sub = result.subtype || 'unknown';
    const dur = result.duration_ms ? fmtDur(result.duration_ms) : '';
    const isErr = result.is_error;
    return (React.createElement(Box, { marginTop: 1 },
        React.createElement(Text, { bold: true, color: isErr ? 'red' : 'green' },
            isErr ? '✗' : '✔',
            " Result: ",
            sub),
        dur ? React.createElement(Text, { dimColor: true },
            "  (",
            dur,
            ")") : null));
}
function SessionView({ session }) {
    const msgs = [...session.messages.values()].sort((a, b) => a.startTime - b.startTime);
    const tcByMC = groupTCByModelCall(session);
    const userMsgs = msgs.filter(m => m.role === 'user');
    const assistantMsgs = msgs.filter(m => m.role === 'assistant');
    return (React.createElement(Box, { flexDirection: "column", marginBottom: 1 },
        React.createElement(SessionHeader, { session: session }),
        userMsgs.map((m, i) => React.createElement(UserBlock, { key: `u${i}`, message: m })),
        assistantMsgs.map((m) => {
            const tcs = m.modelCallId ? (tcByMC.get(m.modelCallId) || []) : [];
            return (React.createElement(AssistantBlock, { key: m.key, message: m, toolCalls: tcs, cwd: session.cwd }));
        }),
        (tcByMC.get('_orphan') || []).length > 0 && (React.createElement(Box, { flexDirection: "column", marginTop: 1, marginLeft: 2 },
            React.createElement(Text, { bold: true, dimColor: true }, "Other Tool Calls"),
            (tcByMC.get('_orphan') || []).map((tc, i, arr) => (React.createElement(ToolCallLine, { key: tc.id, tc: tc, cwd: session.cwd, last: i === arr.length - 1 }))))),
        session.results.map((r, i) => React.createElement(ResultBlock, { key: `r${i}`, result: r }))));
}
function App({ sessions, interactive }) {
    const { exit } = useApp();
    useInput((input, key) => {
        if (interactive && (input === 'q' || key.escape)) {
            exit();
        }
    });
    const list = [...sessions.values()];
    if (list.length === 0) {
        return React.createElement(Text, { dimColor: true }, "Waiting for data\u2026");
    }
    return (React.createElement(Box, { flexDirection: "column" },
        list.map(s => React.createElement(SessionView, { key: s.id, session: s })),
        interactive ? (React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true }, "Press q to quit"))) : null));
}
/**
 * Check whether the real stdin supports raw mode.
 * Piped stdin and some terminals (Cursor IDE) lack it.
 */
function stdinSupportsRaw() {
    try {
        return process.stdin.isTTY === true && typeof process.stdin.setRawMode === 'function';
    }
    catch {
        return false;
    }
}
/**
 * Create a fake stdin stream that ink will accept.
 * Must quack like a TTY: setRawMode, ref, unref, isTTY, etc.
 */
function createMockStdin() {
    const mock = new PassThrough();
    mock.isTTY = true;
    mock.isRaw = false;
    mock.setRawMode = (mode) => { mock.isRaw = mode; return mock; };
    mock.ref = () => mock;
    mock.unref = () => mock;
    return mock;
}
export function createTUI(interactive) {
    const canRaw = stdinSupportsRaw();
    const effectiveInteractive = interactive && canRaw;
    // If stdin can't do raw mode (piped input, Cursor terminal, etc.)
    // give ink a mock stdin that fakes raw-mode support so it won't crash.
    const stdin = canRaw ? process.stdin : createMockStdin();
    const inst = render(React.createElement(App, { sessions: new Map(), interactive: effectiveInteractive }), { stdin });
    return {
        update(sessions) {
            inst.rerender(React.createElement(App, { sessions, interactive: effectiveInteractive }));
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
//# sourceMappingURL=tui.js.map