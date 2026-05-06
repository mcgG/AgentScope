export type AgentSessionStatus =
  | "running"
  | "completed"
  | "failed"
  | "unknown";

export type AgentEventType =
  | "session_started"
  | "session_ended"
  | "user_prompt"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "notification"
  | "unknown";

export type AgentToolStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "unknown";

export type AgentSession = {
  id: string;
  title?: string;
  agent: "claude-code";
  status: AgentSessionStatus;
  cwd?: string;
  transcriptPath?: string;
  source?: string;
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
  eventCount: number;
  toolCallCount: number;
  lastAssistantMessage?: string;
};

export type AgentEvent = {
  id: string;
  sessionId: string;
  timestamp: string;
  source: "claude-code";
  hookEventName: string;
  eventType: AgentEventType;
  toolUseId?: string;
  toolName?: string;
  status?: AgentToolStatus;
  title: string;
  summary?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  cwd?: string;
  durationMs?: number;
  prompt?: string;
  raw: unknown;
};

export type SseMessage =
  | { type: "session_upserted"; session: AgentSession }
  | { type: "event_upserted"; event: AgentEvent }
  | { type: "hello"; serverStartedAt: string };
