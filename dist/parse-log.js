#!/usr/bin/env node
/**
 * Log parser CLI.
 *
 * Modes:
 *   parse-log <file>                 → TUI (interactive)
 *   parse-log <file> -o out.md       → markdown file
 *   parse-log <file> -w              → watch file, TUI live
 *   command | parse-log              → stdin, TUI non-interactive
 *   command | parse-log -o out.md    → stdin, markdown file
 */
import { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import { LogParser } from './src/parser.js';
import { MarkdownFormatter } from './src/formatters/markdown.js';
const program = new Command();
program
    .name('parse-log')
    .description('Parse JSONL log files into human-readable format')
    .version('2.0.0')
    .argument('[file]', 'JSONL log file (omit or use - for stdin)')
    .option('-o, --output <path>', 'Write markdown to file')
    .option('-r, --raw <path>', 'Tee raw JSONL lines to file')
    .option('-t, --tui', 'Force TUI mode')
    .option('-w, --watch', 'Watch file for new lines')
    .option('-s, --session-id <id>', 'Show only this session')
    .option('-e, --errors-only', 'Show only sessions with errors')
    .action(async (file, opts) => {
    // ── detect input source ──
    const fromStdin = !file || file === '-' || (!process.stdin.isTTY && !file);
    if (!fromStdin) {
        if (!existsSync(file)) {
            process.stderr.write(`File not found: ${file}\n`);
            process.exit(1);
        }
    }
    else if (process.stdin.isTTY) {
        process.stderr.write('No input. Provide a file or pipe via stdin.\n');
        process.exit(1);
    }
    // ── detect output mode ──
    const hasFile = !!opts.output;
    const wantTUI = opts.tui || (!hasFile && process.stdout.isTTY);
    // When stdin is piped, TUI works but is non-interactive
    // (ink skips keyboard input when stdin is not a TTY).
    const interactive = wantTUI && !fromStdin;
    const parser = new LogParser({ silent: wantTUI, rawFile: opts.raw });
    const mdFmt = hasFile ? new MarkdownFormatter() : null;
    let tui = null;
    if (wantTUI) {
        if (!process.stdout.isTTY && !opts.tui) {
            // Only block auto-detected TUI; if user explicitly passed --tui, let it try.
            process.stderr.write('TUI requires a TTY on stdout. Use -o instead.\n');
            process.exit(1);
        }
        const mod = await import('./src/formatters/tui.js');
        tui = mod.createTUI(interactive);
    }
    // ── filter helper ──
    const filter = (sessions) => {
        let out = sessions;
        if (opts.sessionId) {
            const s = out.get(opts.sessionId);
            out = s ? new Map([[opts.sessionId, s]]) : new Map();
        }
        if (opts.errorsOnly) {
            out = new Map([...out.entries()].filter(([, s]) => {
                for (const tc of s.toolCalls.values())
                    if (tc.error)
                        return true;
                for (const r of s.results)
                    if (r.is_error)
                        return true;
                return false;
            }));
        }
        return out;
    };
    // ── push updates ──
    let debounce = null;
    const flush = () => {
        const filtered = filter(parser.getSessions());
        if (tui)
            tui.update(filtered);
        if (mdFmt)
            writeFileSync(opts.output, mdFmt.format(filtered), 'utf-8');
    };
    const scheduleFlush = () => {
        if (debounce)
            clearTimeout(debounce);
        debounce = setTimeout(flush, 80);
    };
    // ── run ──
    if (fromStdin) {
        await parser.parseStdin(scheduleFlush);
        flush();
        if (tui) {
            // If non-interactive stdin TUI, wait a moment then exit cleanly
            await new Promise(r => setTimeout(r, 200));
            tui.destroy();
        }
        process.exit(0);
    }
    else if (opts.watch) {
        await parser.parseFileStream(file, scheduleFlush);
        flush();
        const stop = parser.watchFile(file, () => flush(), 500);
        if (tui) {
            await tui.waitUntilExit();
            stop();
        }
        else {
            process.on('SIGINT', () => { stop(); process.exit(0); });
        }
    }
    else {
        // one-shot file parse
        parser.parseFile(file);
        flush();
        if (tui) {
            // waitUntilExit resolves immediately if no keyboard input.
            // In that case the output stays on screen and process exits.
            await tui.waitUntilExit();
        }
        process.exit(0);
    }
});
program.parse();
//# sourceMappingURL=parse-log.js.map