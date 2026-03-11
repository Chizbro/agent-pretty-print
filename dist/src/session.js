/**
 * Session aggregator that groups events and extracts metadata.
 *
 * Fixed: startTime is now derived from the first timestamped event
 * rather than Date.now() (which gave parse-time, not session-time).
 */
import { ToolCallAggregator } from './toolCall.js';
import { MessageReconstructor } from './message.js';
export class SessionAggregator {
    sessions = new Map();
    toolCallAggregator = new ToolCallAggregator();
    messageReconstructor = new MessageReconstructor();
    addEvent(event) {
        const sessionId = event.session_id;
        if (!sessionId)
            return;
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
            if (event.model)
                session.model = event.model;
            if (event.cwd)
                session.cwd = event.cwd;
            if (event.apiKeySource)
                session.apiKeySource = event.apiKeySource;
            if (event.permissionMode)
                session.permissionMode = event.permissionMode;
        }
        // --- startTime = earliest timestamp, endTime = latest ---
        if (event.timestamp_ms) {
            if (!session.startTime || event.timestamp_ms < session.startTime) {
                session.startTime = event.timestamp_ms;
            }
            session.endTime = Math.max(session.endTime || 0, event.timestamp_ms);
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
    }
    getSessions() {
        for (const session of this.sessions.values()) {
            session.toolCalls = this.toolCallAggregator.getToolCalls(session.id);
            session.messages = this.messageReconstructor.getMessages(session.id);
        }
        return this.sessions;
    }
}
//# sourceMappingURL=session.js.map