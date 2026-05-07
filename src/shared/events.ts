export type AgentKind = "claude-code" | "codex";

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
  agent: AgentKind;
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
  source: AgentKind;
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
  agentId?: string;
  agentType?: string;
  raw: unknown;
};

export type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
};

export type UsageRange = "today" | "7d" | "30d" | "90d" | "year" | "all";

export type UsageBucket = {
  key: string;
  input: number;
  output: number;
  cost: number;
  turns: number;
};

export type UsageRollup = {
  range: UsageRange;
  bucketSize: "hour" | "day" | "month";
  totals: UsageTotals & { cacheHitRate: number };
  byModel: Array<{ model: string; tokens: number; cost: number; turns: number }>;
  bySession: Array<{
    sessionId: string;
    title?: string;
    agent?: string;
    cost: number;
    tokens: number;
    turns: number;
  }>;
  series: UsageBucket[];
  generatedAt: string;
};

export type UsageDelta = {
  sessionId: string;
  totals: UsageTotals;
  lastTs?: string;
};

export type SseMessage =
  | { type: "session_upserted"; session: AgentSession }
  | { type: "event_upserted"; event: AgentEvent }
  | { type: "usage_upserted"; usage: UsageDelta }
  | { type: "hello"; serverStartedAt: string };
