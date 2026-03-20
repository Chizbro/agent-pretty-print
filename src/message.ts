/**
 * Message reconstructor that collects streaming chunks.
 *
 * Fixed: user messages (which lack model_call_id) are now captured
 * using a synthetic key. Assistant messages without model_call_id
 * are treated as previews and skipped to avoid duplicates.
 */

import type { LogEvent, Message } from './types.js';

export class MessageReconstructor {
  // sessionId -> messageKey -> Message
  private messages: Map<string, Map<string, Message>> = new Map();

  addEvent(event: LogEvent): void {
    if (event.type !== 'user' && event.type !== 'assistant') {
      return;
    }
    if (!event.message) {
      return;
    }

    const sessionId = event.session_id;
    let key: string;

    if (event.type === 'user') {
      // User messages never have model_call_id.
      // Use a synthetic key so they aren't dropped.
      key = `user-${sessionId}`;
    } else if (event.model_call_id) {
      // Assistant streaming chunks keyed by model_call_id (Cursor).
      key = event.model_call_id;
    } else if (event.message?.id) {
      // Claude Code assistant messages use message.id instead of model_call_id.
      key = event.message.id;
    } else {
      // Assistant messages without any id are early previews
      // that get re-emitted with an id moments later. Skip.
      return;
    }

    let sessionMessages = this.messages.get(sessionId);
    if (!sessionMessages) {
      sessionMessages = new Map();
      this.messages.set(sessionId, sessionMessages);
    }

    let message = sessionMessages.get(key);
    if (!message) {
      message = {
        key,
        modelCallId: event.model_call_id || event.message?.id,
        role: event.message.role ?? (event.type === 'user' ? 'user' : 'assistant'),
        chunks: [],
        fullText: '',
        startTime: event.timestamp_ms || 0,
      };
      sessionMessages.set(key, message);
    }

    message.chunks.push(event);
    message.fullText = this.reconstructText(message.chunks);

    if (event.timestamp_ms) {
      message.endTime = Math.max(message.endTime || 0, event.timestamp_ms);
    }
  }

  private reconstructText(chunks: LogEvent[]): string {
    let text = '';
    for (const chunk of chunks) {
      const content = chunk.message?.content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (item && typeof item === 'object' && typeof item.text === 'string') {
          text += item.text;
        }
      }
    }
    return text;
  }

  getMessages(sessionId: string): Map<string, Message> {
    return this.messages.get(sessionId) || new Map();
  }
}
