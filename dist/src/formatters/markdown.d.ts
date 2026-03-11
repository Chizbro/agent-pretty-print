/**
 * Markdown formatter for human-readable file output.
 *
 * Fixed: escapeMarkdown no longer mangles code blocks / tables.
 */
import type { Session } from '../types.js';
export declare class MarkdownFormatter {
    format(sessions: Map<string, Session>): string;
    private fmtSession;
}
