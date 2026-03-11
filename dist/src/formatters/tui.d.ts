/**
 * Terminal UI using ink (React for the terminal).
 *
 * Replaces the broken blessed-based TUI.
 * - No mouse-tracking escape codes
 * - Proper terminal handling via ink
 * - stdin piping works (ink skips input when stdin is not a TTY)
 */
import type { Session } from '../types.js';
export interface TUIHandle {
    update(sessions: Map<string, Session>): void;
    destroy(): void;
    waitUntilExit(): Promise<void>;
}
export declare function createTUI(interactive: boolean): TUIHandle;
