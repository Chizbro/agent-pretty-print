/**
 * Tool call aggregator that matches started / completed pairs.
 *
 * Fixed: operator-precedence bug in error detection.
 * Improved: tool-name extraction gives readable names + keeps rawName.
 */
import type { LogEvent, ToolCall } from './types.js';
export declare class ToolCallAggregator {
    private toolCalls;
    addEvent(event: LogEvent): void;
    private extractRawName;
    private extractArgs;
    private extractResult;
    private humanize;
    getToolCalls(sessionId: string): Map<string, ToolCall>;
}
