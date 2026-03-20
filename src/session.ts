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
}
