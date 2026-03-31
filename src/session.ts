/**
 * Session aggregator that groups events and extracts metadata.
 *
 * Fixed: startTime is now derived from the first timestamped event
 * rather than Date.now() (which gave parse-time, not session-time).
 */

import type { LogEvent, Session } from './types.js';
import { ToolCallAggregator } from './toolCall.js';
import { MessageReconstructor } from './message.js';

export class SessionAggregator {
  private sessions: Map<string, Session> = new Map();
  private toolCallAggregator = new ToolCallAggregator();
  private messageReconstructor = new MessageReconstructor();
  private claudeToolUses: Map<string, Map<string, {
    name: string;
    modelCallId?: string;
    args?: any;
    startedAt?: number;
  }>> = new Map();

  addEvent(event: LogEvent): void {
    const sessionId = event.session_id;
    if (!sessionId) return;

    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        startTime: 0,
        events: [],
        toolCalls: new Map(),
        messages: new Map(),
        results: [],
      };
      this.sessions.set(sessionId, session);
    }

    session.events.push(event);

    // --- metadata from system/init ---
    if (event.type === 'system' && event.subtype === 'init') {
      if (event.model) session.model = event.model;
      if (event.cwd) session.cwd = event.cwd;
      if (event.apiKeySource) session.apiKeySource = event.apiKeySource;
      if (event.permissionMode) session.permissionMode = event.permissionMode;
    }

    // Claude assistant messages carry the model inside message.model
    if (event.type === 'assistant' && !session.model && event.message?.model) {
      session.model = event.message.model;
    }

    // --- startTime = earliest timestamp, endTime = latest ---
    if (event.timestamp_ms) {
      if (!session.startTime || event.timestamp_ms < session.startTime) {
        session.startTime = event.timestamp_ms;
      }
      session.endTime = Math.max(session.endTime || 0, event.timestamp_ms);
    }

    // Claude result events carry duration but no timestamps —
    // synthesize endTime so session duration renders correctly.
    if (event.type === 'result' && event.duration_ms && !session.endTime) {
      if (session.startTime) {
        session.endTime = session.startTime + event.duration_ms;
      }
    }

    // --- delegate to sub-aggregators ---
    if (event.type === 'tool_call') {
      this.toolCallAggregator.addEvent(event);
    }
    if (event.type === 'assistant') {
      this.ingestClaudeToolUse(event);
    }
    if (event.type === 'user') {
      this.ingestClaudeToolResult(event);
    }
    if (event.type === 'user' || event.type === 'assistant') {
      this.messageReconstructor.addEvent(event);
    }
    if (event.type === 'result') {
      session.results.push(event);
    }
    // rate_limit_event — skip (informational only)
  }

  getSessions(): Map<string, Session> {
    for (const session of this.sessions.values()) {
      session.toolCalls = this.toolCallAggregator.getToolCalls(session.id);
      session.messages = this.messageReconstructor.getMessages(session.id);
    }
    return this.sessions;
  }

  private ingestClaudeToolUse(event: LogEvent): void {
    const content = event.message?.content;
    if (!Array.isArray(content)) return;

    const modelCallId = event.model_call_id || event.message?.id;
    for (const item of content) {
      if (!item || typeof item !== 'object' || item.type !== 'tool_use') continue;
      const toolUseId = typeof item.id === 'string' ? item.id : undefined;
      const toolName = typeof item.name === 'string' ? item.name : undefined;
      if (!toolUseId || !toolName) continue;

      let sessionToolUses = this.claudeToolUses.get(event.session_id);
      if (!sessionToolUses) {
        sessionToolUses = new Map();
        this.claudeToolUses.set(event.session_id, sessionToolUses);
      }
      sessionToolUses.set(toolUseId, {
        name: toolName,
        modelCallId,
        args: item.input,
        startedAt: event.timestamp_ms,
      });

      const syntheticStart: LogEvent = {
        type: 'tool_call',
        subtype: 'started',
        session_id: event.session_id,
        call_id: toolUseId,
        model_call_id: modelCallId,
        timestamp_ms: event.timestamp_ms,
        tool_call: {
          [toolName]: {
            args: item.input,
          },
        },
      };
      this.toolCallAggregator.addEvent(syntheticStart);
    }
  }

  private ingestClaudeToolResult(event: LogEvent): void {
    const content = event.message?.content;
    if (!Array.isArray(content)) return;
    const sessionToolUses = this.claudeToolUses.get(event.session_id);
    if (!sessionToolUses) return;

    for (const item of content) {
      if (!item || typeof item !== 'object' || item.type !== 'tool_result') continue;
      const toolUseId = typeof item.tool_use_id === 'string' ? item.tool_use_id : undefined;
      if (!toolUseId) continue;
      const started = sessionToolUses.get(toolUseId);
      if (!started) continue;

      const syntheticComplete: LogEvent = {
        type: 'tool_call',
        subtype: 'completed',
        session_id: event.session_id,
        call_id: toolUseId,
        model_call_id: started.modelCallId,
        timestamp_ms: event.timestamp_ms,
        tool_call: {
          [started.name]: {
            result: {
              content: item.content,
              error: !!item.is_error,
            },
          },
        },
      };
      this.toolCallAggregator.addEvent(syntheticComplete);
      sessionToolUses.delete(toolUseId);
    }
  }
}
