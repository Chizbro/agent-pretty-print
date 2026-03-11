/**
 * Session aggregator that groups events and extracts metadata.
 *
 * Fixed: startTime is now derived from the first timestamped event
 * rather than Date.now() (which gave parse-time, not session-time).
 */
import type { LogEvent, Session } from './types.js';
export declare class SessionAggregator {
    private sessions;
    private toolCallAggregator;
    private messageReconstructor;
    addEvent(event: LogEvent): void;
    getSessions(): Map<string, Session>;
}
