/**
 * Tool call aggregator that matches started / completed pairs.
 *
 * Fixed: operator-precedence bug in error detection.
 * Improved: tool-name extraction gives readable names + keeps rawName.
 */
const TOOL_LABELS = {
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
};
export class ToolCallAggregator {
    // sessionId -> callId -> ToolCall
    toolCalls = new Map();
    addEvent(event) {
        if (event.type !== 'tool_call' || !event.call_id)
            return;
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
        }
        else if (event.subtype === 'completed') {
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
    extractRawName(event) {
        const obj = event.tool_call;
        if (!obj || typeof obj !== 'object')
            return 'unknown';
        return Object.keys(obj)[0] || 'unknown';
    }
    extractArgs(event) {
        const obj = event.tool_call;
        if (!obj || typeof obj !== 'object')
            return undefined;
        const key = Object.keys(obj)[0];
        return key ? obj[key]?.args : undefined;
    }
    extractResult(event) {
        const obj = event.tool_call;
        if (!obj || typeof obj !== 'object')
            return undefined;
        const key = Object.keys(obj)[0];
        return key ? obj[key]?.result : undefined;
    }
    humanize(raw) {
        return raw
            .replace(/ToolCall$/, '')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .replace(/^\w/, c => c.toUpperCase());
    }
    getToolCalls(sessionId) {
        return this.toolCalls.get(sessionId) || new Map();
    }
}
//# sourceMappingURL=toolCall.js.map