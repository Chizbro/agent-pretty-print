/**
 * Message reconstructor that collects streaming chunks.
 *
 * Fixed: user messages (which lack model_call_id) are now captured
 * using a synthetic key. Assistant messages without model_call_id
 * are treated as previews and skipped to avoid duplicates.
 */
import type { LogEvent, Message } from './types.js';
export declare class MessageReconstructor {
    private messages;
    addEvent(event: LogEvent): void;
    private reconstructText;
    getMessages(sessionId: string): Map<string, Message>;
}
