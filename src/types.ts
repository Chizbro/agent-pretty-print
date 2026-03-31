/**
 * Type definitions for log parser
 */

export interface LogEvent {
  type: 'system' | 'user' | 'assistant' | 'tool_call' | 'result' | 'thinking' | 'rate_limit_event';
  subtype?: string;
  session_id: string;
  timestamp_ms?: number;
  timestamp?: string;
  model_call_id?: string;
  call_id?: string;
  message?: {
    id?: string;
    role: 'user' | 'assistant';
    content: Array<{ type: string; text?: string; thinking?: string; [key: string]: any }>;
    [key: string]: any;
  };
  tool_call?: {
    [toolName: string]: {
      args?: any;
      result?: any;
    };
  };
  result?: string;
  text?: string;
  model?: string;
  cwd?: string;
  apiKeySource?: string;
  permissionMode?: string;
  duration_ms?: number;
  duration_api_ms?: number;
  is_error?: boolean;
  request_id?: string;
  [key: string]: any;
}

export interface ToolCall {
  id: string;
  name: string;
  rawName: string;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  args?: any;
  result?: any;
  error?: boolean;
  modelCallId?: string;
}

export interface Message {
  key: string;
  modelCallId?: string;
  role: 'user' | 'assistant';
  chunks: LogEvent[];
  fullText: string;
  startTime: number;
  endTime?: number;
}

export interface Session {
  id: string;
  startTime: number;
  endTime?: number;
  model?: string;
  cwd?: string;
  apiKeySource?: string;
  permissionMode?: string;
  events: LogEvent[];
  toolCalls: Map<string, ToolCall>;
  messages: Map<string, Message>;
  results: LogEvent[];
}
