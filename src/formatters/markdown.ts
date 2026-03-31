/**
 * Markdown formatter for human-readable file output.
 *
 * Fixed: escapeMarkdown no longer mangles code blocks / tables.
 */

import type { Session, ToolCall, Message } from '../types.js';

export class MarkdownFormatter {
  format(sessions: Map<string, Session>): string {
    const parts: string[] = [];
    for (const session of sessions.values()) {
      parts.push(this.fmtSession(session));
    }
    return parts.join('\n\n---\n\n') + '\n';
  }

  private fmtSession(s: Session): string {
    const out: string[] = [];

    // header
    const sessionTs = fmtTsLabel(s.startTime || s.endTime);
    out.push(`# Session \`${s.id.substring(0, 8)}\` [${sessionTs}]`);
    const meta: string[] = [];
    if (s.model) meta.push(`**Model:** ${s.model}`);
    if (s.startTime) meta.push(`**Started:** ${new Date(s.startTime).toISOString()}`);
    if (s.endTime && s.startTime) meta.push(`**Duration:** ${fmtDur(s.endTime - s.startTime)}`);
    if (s.cwd) meta.push(`**CWD:** \`${s.cwd}\``);
    if (meta.length) out.push(meta.join('  \n'));

    // messages + tool calls interleaved
    const msgs = [...s.messages.values()].sort((a, b) => a.startTime - b.startTime);
    const tcByMC = groupToolCallsByModelCall(s);

    for (const msg of msgs) {
      const text = msg.fullText.trim();
      const tcs = msg.modelCallId ? (tcByMC.get(msg.modelCallId) || []) : [];

      // Skip empty messages (e.g. whitespace-only streaming deltas)
      if (!text && tcs.length === 0 && msg.role === 'assistant') continue;

      out.push('');
      const label = msg.role === 'user' ? '## User' : '## Assistant';
      const msgTs = fmtTsLabel(resolveMessageTs(msg, s));
      out.push(`${label} [${msgTs}]`);
      if (text) out.push(text);

      if (tcs.length) {
        out.push('');
        out.push('| Status | Tool | Argument | Duration |');
        out.push('|--------|------|----------|----------|');
        for (const tc of tcs) {
          const status = tc.error ? '✗' : tc.completedAt ? '✓' : '⏳';
          const arg = summarizeArg(tc, s.cwd);
          const dur = tc.duration != null ? fmtDur(tc.duration) : '';
          out.push(`| ${status} | ${tc.name} | \`${arg}\` | ${dur} |`);
        }
      }
    }

    // orphan tool calls (no matching model call)
    const orphans = tcByMC.get('_orphan') || [];
    if (orphans.length) {
      out.push('');
      const orphanTs = fmtTsLabel(orphans.reduce((min, tc) => {
        if (!tc.startedAt) return min;
        return !min || tc.startedAt < min ? tc.startedAt : min;
      }, 0 as number));
      out.push(`## Other Tool Calls [${orphanTs}]`);
      for (const tc of orphans) {
        const status = tc.error ? '✗' : tc.completedAt ? '✓' : '⏳';
        out.push(`- ${status} **${tc.name}** \`${summarizeArg(tc, s.cwd)}\` ${tc.duration != null ? fmtDur(tc.duration) : ''}`);
      }
    }

    // results
    for (const r of s.results) {
      out.push('');
      const sub = r.subtype || 'unknown';
      const dur = r.duration_ms ? fmtDur(r.duration_ms) : '';
      const cost = r.total_cost_usd != null ? `$${r.total_cost_usd.toFixed(4)}` : '';
      const turns = r.num_turns != null ? `${r.num_turns} turn${r.num_turns !== 1 ? 's' : ''}` : '';
      const meta = [dur, cost, turns].filter(Boolean).join(' · ');
      const err = r.is_error ? ' **ERROR**' : '';
      const resultTs = fmtTsLabel(r.timestamp_ms || s.endTime || s.startTime);
      out.push(`## Result: ${sub} [${resultTs}]${meta ? ` (${meta})` : ''}${err}`);
      if (r.result) {
        const txt = typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2);
        if (txt.length > 800) {
          out.push('```');
          out.push(txt.substring(0, 800) + '\n…');
          out.push('```');
        } else {
          out.push('```');
          out.push(txt);
          out.push('```');
        }
      }
    }

    return out.join('\n');
  }
}

// ---- helpers ----

function groupToolCallsByModelCall(s: Session): Map<string, ToolCall[]> {
  const map = new Map<string, ToolCall[]>();
  for (const tc of s.toolCalls.values()) {
    const key = tc.modelCallId || '_orphan';
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push(tc);
  }
  // sort each group by startedAt
  for (const arr of map.values()) arr.sort((a, b) => a.startedAt - b.startedAt);
  return map;
}

function summarizeArg(tc: ToolCall, cwd?: string): string {
  const a = tc.args;
  if (!a) return '';
  const p: string | undefined = a.path || a.file_path;
  if (p) return shorten(p, cwd);
  const cmd: string | undefined = a.command || a.simpleCommand;
  if (cmd) return String(cmd).substring(0, 80);
  return Object.keys(a).slice(0, 2).map(k => `${k}=…`).join(', ');
}

function shorten(path: string, cwd?: string): string {
  if (cwd && path.startsWith(cwd)) {
    const s = path.slice(cwd.length);
    return s.startsWith('/') ? s.slice(1) : s;
  }
  return path;
}

function fmtTs(ts?: number): string {
  if (!ts || ts <= 0) return '';
  return new Date(ts).toISOString();
}

function fmtTsLabel(ts?: number): string {
  return fmtTs(ts) || 'no-timestamp';
}

function resolveMessageTs(msg: Message, s: Session): number | undefined {
  return msg.startTime || msg.endTime || s.startTime || s.endTime;
}

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
