/**
 * Tool call aggregator that matches started / completed pairs.
 *
 * Fixed: operator-precedence bug in error detection.
 * Improved: tool-name extraction gives readable names + keeps rawName.
 */

import type { LogEvent, ToolCall } from './types.js';

const TOOL_LABELS: Record<string, string> = {
  // Cursor tool names
  readToolCall: 'Read',
  lsToolCall: 'List',
  editToolCall: 'Edit',
  writeToolCall: 'Write',
  shellToolCall: 'Shell',
  applyPatchToolCall: 'Patch',
  updateTodosToolCall: 'Todos',
  searchToolCall: 'Search',
  globToolCall: 'Glob',
  grepToolCall: 'Grep',
  // Claude Code tool names (already human-readable, but normalize casing)
  Bash: 'Shell',
  Read: 'Read',
  Edit: 'Edit',
  Write: 'Write',
  Glob: 'Glob',
  Grep: 'Grep',
  Skill: 'Skill',
  Agent: 'Agent',
  WebFetch: 'Web Fetch',
  WebSearch: 'Web Search',
  NotebookEdit: 'Notebook Edit',
  TodoWrite: 'Todos',
  TaskCreate: 'Task Create',
  TaskUpdate: 'Task Update',
  TaskGet: 'Task Get',
  TaskList: 'Task List',
  TaskOutput: 'Task Output',
  TaskStop: 'Task Stop',
  ToolSearch: 'Tool Search',
  AskUserQuestion: 'Ask User',
  EnterPlanMode: 'Plan Mode',
  ExitPlanMode: 'Exit Plan',
  EnterWorktree: 'Worktree',
  ExitWorktree: 'Exit Worktree',
  CronCreate: 'Cron Create',
  CronDelete: 'Cron Delete',
  CronList: 'Cron List',
};

export class ToolCallAggregator {
  // sessionId -> callId -> ToolCall
  private toolCalls: Map<string, Map<string, ToolCall>> = new Map();

  addEvent(event: LogEvent): void {
    if (event.type !== 'tool_call' || !event.call_id) return;

    const sessionId = event.session_id;
    const callId = event.call_id;

    let sessionCalls = this.toolCalls.get(sessionId);
    if (!sessionCalls) {
      sessionCalls = new Map();
      this.toolCalls.set(sessionId, sessionCalls);
    }

    let tc = sessionCalls.get(callId);
    if (!tc) {
      const rawName = this.extractRawName(event);
      tc = {
        id: callId,
        rawName,
        name: TOOL_LABELS[rawName] || this.humanize(rawName),
        startedAt: event.timestamp_ms || 0,
        modelCallId: event.model_call_id,
      };
      sessionCalls.set(callId, tc);
    }

    if (event.subtype === 'started') {
      tc.startedAt = event.timestamp_ms || tc.startedAt;
      tc.args = this.extractArgs(event);
    } else if (event.subtype === 'completed') {
      tc.completedAt = event.timestamp_ms || 0;
      if (tc.startedAt && tc.completedAt) {
        tc.duration = tc.completedAt - tc.startedAt;
      }
      tc.result = this.extractResult(event);
      // Fixed: was `'success' in obj === false` (precedence bug)
      if (tc.result && typeof tc.result === 'object' && 'error' in tc.result) {
        tc.error = true;
      }
    }
  }

  private extractRawName(event: LogEvent): string {
    const obj = event.tool_call;
    if (!obj || typeof obj !== 'object') return 'unknown';
    return Object.keys(obj)[0] || 'unknown';
  }

  private extractArgs(event: LogEvent): any {
    const obj = event.tool_call;
    if (!obj || typeof obj !== 'object') return undefined;
    const key = Object.keys(obj)[0];
    return key ? obj[key]?.args : undefined;
  }

  private extractResult(event: LogEvent): any {
    const obj = event.tool_call;
    if (!obj || typeof obj !== 'object') return undefined;
    const key = Object.keys(obj)[0];
    return key ? obj[key]?.result : undefined;
  }

  private humanize(raw: string): string {
    return raw
      .replace(/ToolCall$/, '')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^\w/, c => c.toUpperCase());
  }

  getToolCalls(sessionId: string): Map<string, ToolCall> {
    return this.toolCalls.get(sessionId) || new Map();
  }
}
