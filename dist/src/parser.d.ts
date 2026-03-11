/**
 * JSONL parser that reads log files and groups events by session.
 *
 * Fixed: console.error suppressed when silent (TUI active).
 * Fixed: watchFile race condition with a guard flag.
 */
import type { Session } from './types.js';
export declare class LogParser {
    private aggregator;
    private silent;
    private rawFile;
    constructor(opts?: {
        silent?: boolean;
        rawFile?: string;
    });
    /** Parse an entire file synchronously. */
    parseFile(filePath: string): Map<string, Session>;
    /** Parse a file as a stream (async). */
    parseFileStream(filePath: string, onProgress?: (sessions: Map<string, Session>) => void): Promise<Map<string, Session>>;
    /** Watch a file for appended lines. Returns a cleanup function. */
    watchFile(filePath: string, onUpdate: (sessions: Map<string, Session>) => void, intervalMs?: number): () => void;
    /** Parse from stdin (for piped input). */
    parseStdin(onProgress?: (sessions: Map<string, Session>) => void): Promise<Map<string, Session>>;
    getSessions(): Map<string, Session>;
    /** Try to parse one JSONL line. Returns true if an event was added. */
    private ingestLine;
}
