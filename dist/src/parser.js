/**
 * JSONL parser that reads log files and groups events by session.
 *
 * Fixed: console.error suppressed when silent (TUI active).
 * Fixed: watchFile race condition with a guard flag.
 */
import { readFileSync, createReadStream, appendFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { SessionAggregator } from './session.js';
export class LogParser {
    aggregator = new SessionAggregator();
    silent;
    rawFile;
    constructor(opts = {}) {
        this.silent = opts.silent ?? false;
        this.rawFile = opts.rawFile ?? null;
        // Truncate the raw file so each run starts fresh
        if (this.rawFile)
            writeFileSync(this.rawFile, '', 'utf-8');
    }
    /** Parse an entire file synchronously. */
    parseFile(filePath) {
        const content = readFileSync(filePath, 'utf-8');
        for (const line of content.split('\n')) {
            this.ingestLine(line);
        }
        return this.aggregator.getSessions();
    }
    /** Parse a file as a stream (async). */
    async parseFileStream(filePath, onProgress) {
        return new Promise((resolve, reject) => {
            const rl = createInterface({
                input: createReadStream(filePath, 'utf-8'),
                crlfDelay: Infinity,
            });
            rl.on('line', (line) => {
                if (this.ingestLine(line) && onProgress) {
                    onProgress(this.aggregator.getSessions());
                }
            });
            rl.on('close', () => resolve(this.aggregator.getSessions()));
            rl.on('error', reject);
        });
    }
    /** Watch a file for appended lines. Returns a cleanup function. */
    watchFile(filePath, onUpdate, intervalMs = 500) {
        let lastSize = 0;
        let checking = false; // guard against overlapping polls
        const poll = async () => {
            if (checking)
                return;
            checking = true;
            try {
                const { stat } = await import('fs/promises');
                const stats = await stat(filePath);
                if (stats.size <= lastSize)
                    return;
                const nextSize = stats.size;
                await new Promise((resolve, reject) => {
                    const rl = createInterface({
                        input: createReadStream(filePath, { encoding: 'utf-8', start: lastSize }),
                        crlfDelay: Infinity,
                    });
                    rl.on('line', (line) => this.ingestLine(line));
                    rl.on('close', () => { lastSize = nextSize; resolve(); });
                    rl.on('error', reject);
                });
                onUpdate(this.aggregator.getSessions());
            }
            catch {
                // file may not exist yet
            }
            finally {
                checking = false;
            }
        };
        poll();
        const id = setInterval(poll, intervalMs);
        return () => clearInterval(id);
    }
    /** Parse from stdin (for piped input). */
    parseStdin(onProgress) {
        return new Promise((resolve, reject) => {
            if (process.stdin.isTTY) {
                reject(new Error('No piped input on stdin'));
                return;
            }
            const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
            rl.on('line', (line) => {
                if (this.ingestLine(line) && onProgress) {
                    onProgress(this.aggregator.getSessions());
                }
            });
            rl.on('close', () => resolve(this.aggregator.getSessions()));
            rl.on('error', reject);
        });
    }
    getSessions() {
        return this.aggregator.getSessions();
    }
    // ---- internal ----
    /** Try to parse one JSONL line. Returns true if an event was added. */
    ingestLine(raw) {
        const trimmed = raw.trim();
        if (!trimmed)
            return false;
        // Tee the raw line to file before parsing
        if (this.rawFile) {
            appendFileSync(this.rawFile, trimmed + '\n', 'utf-8');
        }
        try {
            const event = JSON.parse(trimmed);
            this.aggregator.addEvent(event);
            return true;
        }
        catch {
            if (!this.silent) {
                process.stderr.write(`[parse-log] bad JSON: ${trimmed.substring(0, 80)}…\n`);
            }
            return false;
        }
    }
}
//# sourceMappingURL=parser.js.map