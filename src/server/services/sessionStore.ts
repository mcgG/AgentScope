import { nanoid } from "nanoid";
import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  AgentEvent,
  AgentKind,
  AgentSession,
  AgentSessionStatus,
} from "../../shared/events.ts";
import {
  normalizeHookPayload,
  type NormalizedHookEvent,
} from "./eventNormalizer.ts";
import { eventBus } from "./eventBus.ts";

const SESSIONS_DIR = resolve(process.cwd(), ".agentscope/sessions");

type IngestResult = {
  event: AgentEvent;
  session: AgentSession;
};

class SessionStore {
  private sessions = new Map<string, AgentSession>();
  private events = new Map<string, AgentEvent[]>();
  private toolUseIdToEventId = new Map<string, string>();

  async init(): Promise<void> {
    await mkdir(SESSIONS_DIR, { recursive: true });
    let files: string[] = [];
    try {
      files = await readdir(SESSIONS_DIR);
    } catch {
      return;
    }

    const sessionFiles = files.filter(
      (f) => f.endsWith(".json") && !f.endsWith(".events.jsonl"),
    );

    for (const file of sessionFiles) {
      try {
        const sessionId = file.replace(/\.json$/, "");
        const sessionRaw = await readFile(join(SESSIONS_DIR, file), "utf8");
        const session: AgentSession = normalizeLoadedSession(
          JSON.parse(sessionRaw) as AgentSession,
        );
        this.sessions.set(session.id, session);

        const eventsPath = join(SESSIONS_DIR, `${sessionId}.events.jsonl`);
        try {
          const eventsRaw = await readFile(eventsPath, "utf8");
          const lines = eventsRaw.split("\n").filter((l) => l.trim());
          const eventMap = new Map<string, AgentEvent>();
          for (const line of lines) {
            try {
              const e = normalizeLoadedEvent(JSON.parse(line) as AgentEvent, session);
              eventMap.set(e.id, e);
              if (e.toolUseId && e.eventType === "tool_started") {
                this.toolUseIdToEventId.set(e.toolUseId, e.id);
              }
            } catch {
              // skip malformed line
            }
          }
          const sortedEvents = Array.from(eventMap.values()).sort(
            (a, b) => a.timestamp.localeCompare(b.timestamp),
          );
          this.events.set(sessionId, sortedEvents);
          await this.syncDerivedCodexEvents(session.id);
        } catch {
          this.events.set(sessionId, []);
          await this.syncDerivedCodexEvents(session.id);
        }
      } catch (e) {
        console.warn(`Failed to load session file ${file}:`, e);
      }
    }
  }

  async ingest(raw: unknown, agent?: AgentKind): Promise<IngestResult> {
    const normalized = normalizeHookPayload(raw, agent);
    const sessionId = normalized.sessionId;

    const session = this.upsertSession(sessionId, normalized);

    let event: AgentEvent;
    const toolUseId = normalized.toolUseId;
    const isToolEnd =
      normalized.eventType === "tool_completed" ||
      normalized.eventType === "tool_failed";

    if (toolUseId && isToolEnd && this.toolUseIdToEventId.has(toolUseId)) {
      const existingId = this.toolUseIdToEventId.get(toolUseId)!;
      const existing = this.findEvent(sessionId, existingId);
      if (existing) {
        const startedMs = new Date(existing.timestamp).getTime();
        const endedMs = new Date(normalized.timestamp).getTime();
        event = {
          ...existing,
          ...normalized,
          id: existing.id,
          timestamp: existing.timestamp,
          input: normalized.input ?? existing.input,
          durationMs: endedMs - startedMs,
        };
        this.replaceEvent(sessionId, event);
      } else {
        event = { ...normalized, id: `evt_${nanoid(10)}` };
        this.appendEvent(sessionId, event);
      }
    } else {
      event = { ...normalized, id: `evt_${nanoid(10)}` };
      this.appendEvent(sessionId, event);
      if (toolUseId && normalized.eventType === "tool_started") {
        this.toolUseIdToEventId.set(toolUseId, event.id);
      }
    }

    const orphans =
      normalized.hookEventName === "Stop" ||
      normalized.hookEventName === "SubagentStop"
        ? this.finalizeOrphanedTools(sessionId, event.id)
        : [];

    this.recountSession(sessionId);
    const updatedSession = this.sessions.get(sessionId)!;

    await this.persist(updatedSession, event);
    await this.syncDerivedCodexEvents(updatedSession.id);
    for (const orphan of orphans) {
      await this.persistEvent(sessionId, orphan);
      eventBus.emit("event_upserted", orphan);
    }

    eventBus.emit("event_upserted", event);
    eventBus.emit("session_upserted", updatedSession);

    return { event, session: updatedSession };
  }

  private finalizeOrphanedTools(
    sessionId: string,
    skipEventId: string,
  ): AgentEvent[] {
    const list = this.events.get(sessionId) ?? [];
    const finalized: AgentEvent[] = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.id === skipEventId) continue;
      if (e.status === "running") {
        const updated: AgentEvent = {
          ...e,
          status: "unknown",
          eventType: "tool_completed",
          summary: e.summary
            ? `${e.summary} · (no PostToolUse received)`
            : "(no PostToolUse received)",
        };
        list[i] = updated;
        finalized.push(updated);
      }
    }
    this.events.set(sessionId, list);
    return finalized;
  }

  private upsertSession(
    sessionId: string,
    normalized: NormalizedHookEvent,
  ): AgentSession {
    const now = normalized.timestamp;
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        agent: normalized.source,
        status: "running",
        cwd: normalized.cwd,
        startedAt: now,
        lastActivityAt: now,
        eventCount: 0,
        toolCallCount: 0,
      };
      const transcriptPath = readTranscriptPath(normalized.raw);
      if (transcriptPath) session.transcriptPath = transcriptPath;
      this.sessions.set(sessionId, session);
      this.events.set(sessionId, []);
    }

    if (session.agent !== normalized.source) {
      session.agent = normalized.source;
    }

    if (!session.cwd && normalized.cwd) session.cwd = normalized.cwd;
    if (!session.transcriptPath) {
      const tp = readTranscriptPath(normalized.raw);
      if (tp) session.transcriptPath = tp;
    }
    session.lastActivityAt = now;

    let nextStatus: AgentSessionStatus | undefined;
    if (normalized.hookEventName === "SessionStart") {
      session.status = "running";
      session.source = readSessionSource(normalized.raw);
    } else if (
      normalized.hookEventName === "Stop" ||
      normalized.hookEventName === "SubagentStop"
    ) {
      session.status = "completed";
      session.endedAt = now;
      const last = readLastAssistantMessage(normalized.raw);
      if (last) session.lastAssistantMessage = last;
    } else if (normalized.eventType === "tool_failed" && session.status === "running") {
      // a single failed tool doesn't fail the session, only mark on Stop
    }
    if (nextStatus) session.status = nextStatus;

    if (
      !session.title &&
      normalized.hookEventName === "UserPromptSubmit" &&
      normalized.prompt
    ) {
      session.title = normalized.prompt.slice(0, 80);
    }

    return session;
  }

  private appendEvent(sessionId: string, event: AgentEvent): void {
    const list = this.events.get(sessionId) ?? [];
    list.push(event);
    this.events.set(sessionId, list);
  }

  private async syncDerivedCodexEvents(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.agent !== "codex" || !session.transcriptPath) {
      return;
    }
    const derived = await readCodexTranscriptEvents(session);
    if (derived.length === 0) return;

    const existing = this.events.get(sessionId) ?? [];
    const userEvents = existing.filter((e) => !e.id.startsWith("codex_"));
    const merged = [...userEvents, ...derived].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    this.events.set(sessionId, merged);
    this.recountSession(sessionId);
  }

  private replaceEvent(sessionId: string, event: AgentEvent): void {
    const list = this.events.get(sessionId) ?? [];
    const idx = list.findIndex((e) => e.id === event.id);
    if (idx >= 0) list[idx] = event;
    else list.push(event);
    this.events.set(sessionId, list);
  }

  private findEvent(
    sessionId: string,
    eventId: string,
  ): AgentEvent | undefined {
    return this.events.get(sessionId)?.find((e) => e.id === eventId);
  }

  private recountSession(sessionId: string): void {
    const list = this.events.get(sessionId) ?? [];
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.eventCount = list.length;
    session.toolCallCount = list.filter(
      (e) =>
        e.eventType === "tool_started" ||
        e.eventType === "tool_completed" ||
        e.eventType === "tool_failed",
    ).length;
  }

  private async persist(
    session: AgentSession,
    event: AgentEvent,
  ): Promise<void> {
    const sessionFile = join(SESSIONS_DIR, `${session.id}.json`);
    await mkdir(SESSIONS_DIR, { recursive: true });
    await Promise.all([
      writeFile(sessionFile, JSON.stringify(session, null, 2), "utf8"),
      this.persistEvent(session.id, event),
    ]);
  }

  private async persistEvent(
    sessionId: string,
    event: AgentEvent,
  ): Promise<void> {
    const eventsFile = join(SESSIONS_DIR, `${sessionId}.events.jsonl`);
    await appendFile(eventsFile, JSON.stringify(event) + "\n", "utf8");
  }

  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).sort((a, b) =>
      b.lastActivityAt.localeCompare(a.lastActivityAt),
    );
  }

  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  async getEvents(sessionId: string): Promise<AgentEvent[]> {
    await this.syncDerivedCodexEvents(sessionId);
    return this.events.get(sessionId) ?? [];
  }

  async clearAll(): Promise<void> {
    this.sessions.clear();
    this.events.clear();
    this.toolUseIdToEventId.clear();
  }
}

function readTranscriptPath(raw: unknown): string | undefined {
  if (raw && typeof raw === "object") {
    const v = (raw as Record<string, unknown>).transcript_path;
    if (typeof v === "string") return v;
  }
  return undefined;
}

function readSessionSource(raw: unknown): string | undefined {
  if (raw && typeof raw === "object") {
    const v = (raw as Record<string, unknown>).source;
    if (typeof v === "string") return v;
  }
  return undefined;
}

function readLastAssistantMessage(raw: unknown): string | undefined {
  if (raw && typeof raw === "object") {
    const v = (raw as Record<string, unknown>).last_assistant_message;
    if (typeof v === "string") return v;
  }
  return undefined;
}

export const sessionStore = new SessionStore();

async function readCodexTranscriptEvents(
  session: AgentSession,
): Promise<AgentEvent[]> {
  if (!session.transcriptPath) return [];
  let raw = "";
  try {
    raw = await readFile(session.transcriptPath, "utf8");
  } catch {
    return [];
  }

  const calls = new Map<
    string,
    { name: string; arguments: Record<string, unknown>; timestamp: string }
  >();
  const events = new Map<string, AgentEvent>();

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const row = asObj(entry);
    const timestamp = asStr(row.timestamp) || session.startedAt;
    const payload = asObj(row.payload);
    const type = asStr(row.type);
    const payloadType = asStr(payload.type);

    if (type === "response_item" && payloadType === "function_call") {
      const name = asStr(payload.name);
      if (name !== "spawn_agent" && name !== "wait_agent") continue;
      const callId = asStr(payload.call_id);
      if (!callId) continue;
      const args = parseJsonObject(asStr(payload.arguments));
      calls.set(callId, { name, arguments: args, timestamp });
      events.set(
        `codex_${session.id}_${callId}`,
        createCodexToolEvent(session, {
          callId,
          timestamp,
          toolName: name,
          input: args,
          output: undefined,
          status: "running",
          title:
            name === "spawn_agent"
              ? "Spawning subagent"
              : "Waiting for subagents",
        }),
      );
      continue;
    }

    if (type !== "event_msg") continue;

    if (payloadType === "collab_agent_spawn_end") {
      const callId = asStr(payload.call_id);
      if (!callId) continue;
      const call = calls.get(callId);
      const threadId = asStr(payload.new_thread_id);
      const progress = threadId
        ? await readCodexSubagentProgress(session.transcriptPath, threadId)
        : [];
      const input = call?.arguments ?? {
        agent_type: asStr(payload.new_agent_role),
        message: asStr(payload.prompt),
      };
      const nickname = asStr(payload.new_agent_nickname);
      events.set(
        `codex_${session.id}_${callId}`,
        createCodexToolEvent(session, {
          callId,
          timestamp: call?.timestamp ?? timestamp,
          toolName: "spawn_agent",
          input,
          output: progress.length > 0 ? { ...payload, progress } : payload,
          status: "success",
          title: nickname ? `Spawned ${nickname}` : "Spawned subagent",
          durationMs: call ? elapsedMs(call.timestamp, timestamp) : undefined,
        }),
      );
      continue;
    }

    if (payloadType === "collab_waiting_end") {
      const callId = asStr(payload.call_id);
      if (!callId) continue;
      const call = calls.get(callId);
      const statuses = readAgentStatuses(payload);
      events.set(
        `codex_${session.id}_${callId}`,
        createCodexToolEvent(session, {
          callId,
          timestamp: call?.timestamp ?? timestamp,
          toolName: "wait_agent",
          input: call?.arguments ?? {},
          output: { ...payload, agent_statuses: statuses },
          status: statuses.some((s) => s.status === "failed")
            ? "failed"
            : "success",
          title: `Joined ${statuses.length || "subagent"} result${
            statuses.length === 1 ? "" : "s"
          }`,
          durationMs: call ? elapsedMs(call.timestamp, timestamp) : undefined,
        }),
      );
    }
  }

  return Array.from(events.values()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}

type CodexProgressItem = {
  timestamp: string;
  title: string;
  summary?: string;
  detail?: string;
  status?: string;
};

async function readCodexSubagentProgress(
  parentTranscriptPath: string,
  threadId: string,
): Promise<CodexProgressItem[]> {
  let childPath: string | undefined;
  try {
    const parentDir = dirname(parentTranscriptPath);
    const files = await readdir(parentDir);
    childPath = files.find((file) => file.endsWith(`${threadId}.jsonl`));
    if (childPath) childPath = join(parentDir, childPath);
  } catch {
    return [];
  }
  if (!childPath) return [];

  let raw = "";
  try {
    raw = await readFile(childPath, "utf8");
  } catch {
    return [];
  }

  const progress: CodexProgressItem[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const row = asObj(entry);
    const timestamp = asStr(row.timestamp);
    const payload = asObj(row.payload);
    const type = asStr(row.type);
    const payloadType = asStr(payload.type);
    if (!timestamp) continue;

    if (type === "event_msg" && payloadType === "task_started") {
      progress.push({ timestamp, title: "Started subagent", status: "running" });
      continue;
    }

    if (type === "event_msg" && payloadType === "agent_message") {
      const message = asStr(payload.message);
      if (!message) continue;
      progress.push({
        timestamp,
        title: asStr(payload.phase) === "final_answer" ? "Final answer" : "Agent update",
        summary: firstLine(message),
        detail: message,
        status: "success",
      });
      continue;
    }

    if (type === "response_item" && payloadType === "web_search_call") {
      const action = asObj(payload.action);
      const actionType = asStr(action.type);
      const url = asStr(action.url);
      const query = asStr(action.query);
      progress.push({
        timestamp,
        title: actionType === "open_page" ? "Opened page" : "Web search",
        summary: url || query || actionType || "web search",
        status: asStr(payload.status) || "success",
      });
      continue;
    }

    if (type === "response_item" && payloadType === "function_call") {
      const name = asStr(payload.name) || "Tool call";
      progress.push({
        timestamp,
        title: name,
        summary: summarizeCodexFunctionCall(payload),
        status: asStr(payload.status) || "running",
      });
      continue;
    }

    if (type === "event_msg" && payloadType === "task_complete") {
      progress.push({
        timestamp,
        title: "Completed subagent",
        summary: firstLine(asStr(payload.last_agent_message)),
        status: "success",
      });
    }
  }

  return progress;
}

function createCodexToolEvent(
  session: AgentSession,
  data: {
    callId: string;
    timestamp: string;
    toolName: string;
    input: unknown;
    output: unknown;
    status: NonNullable<AgentEvent["status"]>;
    title: string;
    durationMs?: number;
  },
): AgentEvent {
  const eventType =
    data.status === "running"
      ? "tool_started"
      : data.status === "failed"
        ? "tool_failed"
        : "tool_completed";
  return {
    id: `codex_${session.id}_${data.callId}`,
    sessionId: session.id,
    timestamp: data.timestamp,
    source: "codex",
    hookEventName: "CodexTranscript",
    eventType,
    toolUseId: data.callId,
    toolName: data.toolName,
    status: data.status,
    title: data.title,
    summary: summarizeCodexTool(data.toolName, data.input, data.output),
    input: data.input,
    output: data.output,
    cwd: session.cwd,
    durationMs: data.durationMs,
    raw: {
      source: "codex_transcript",
      transcript_path: session.transcriptPath,
      input: data.input,
      output: data.output,
    },
  };
}

function summarizeCodexTool(
  toolName: string,
  input: unknown,
  output: unknown,
): string | undefined {
  const inObj = asObj(input);
  if (toolName === "spawn_agent") {
    const outObj = asObj(output);
    return (
      asStr(outObj.prompt) ||
      asStr(inObj.message) ||
      asStr(inObj.description) ||
      undefined
    );
  }
  if (toolName === "wait_agent") {
    const statuses = readAgentStatuses(asObj(output));
    if (statuses.length > 0) {
      return statuses.map((s) => s.nickname || s.threadId).join(", ");
    }
  }
  return undefined;
}

function readAgentStatuses(value: unknown): Array<{
  threadId: string;
  nickname?: string;
  role?: string;
  status: "completed" | "failed" | "running";
  result?: string;
}> {
  const obj = asObj(value);
  const rawStatuses = Array.isArray(obj.agent_statuses)
    ? obj.agent_statuses
    : Array.isArray(obj.statuses)
      ? obj.statuses
      : [];

  return rawStatuses
    .map((item) => {
      const s = asObj(item);
      const nestedStatus = asObj(s.status);
      const completed = asStr(nestedStatus.completed);
      const failed = asStr(nestedStatus.failed) || asStr(nestedStatus.error);
      const flatStatus = asStr(s.status);
      const flatResult = asStr(s.result);
      const threadId =
        asStr(s.thread_id) || asStr(s.threadId) || asStr(s.agent_path);
      if (!threadId) return undefined;
      const status: "completed" | "failed" | "running" = failed || flatStatus === "failed"
        ? "failed"
        : completed || flatStatus === "completed"
          ? "completed"
          : "running";
      return {
        threadId,
        nickname: asStr(s.agent_nickname) || asStr(s.nickname) || undefined,
        role: asStr(s.agent_role) || asStr(s.role) || undefined,
        status,
        result: completed || failed || flatResult || undefined,
      };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value) return {};
  try {
    return asObj(JSON.parse(value));
  } catch {
    return {};
  }
}

function elapsedMs(start: string, end: string): number {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

function summarizeCodexFunctionCall(payload: Record<string, unknown>): string | undefined {
  const args = parseJsonObject(asStr(payload.arguments));
  return (
    asStr(args.cmd) ||
    asStr(args.command) ||
    asStr(args.query) ||
    asStr(args.url) ||
    asStr(args.message) ||
    asStr(args.prompt) ||
    undefined
  );
}

function firstLine(text: string): string | undefined {
  return text.split("\n").find((line) => line.trim())?.trim().slice(0, 180);
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeLoadedSession(session: AgentSession): AgentSession {
  if (session.transcriptPath?.includes("/.codex/")) {
    return { ...session, agent: "codex" };
  }
  if (session.agent === "codex" || session.agent === "claude-code") {
    return session;
  }
  return { ...session, agent: inferAgentKindFromSession(session) };
}

function normalizeLoadedEvent(
  event: AgentEvent,
  session: AgentSession,
): AgentEvent {
  if (event.source === "codex" || event.source === "claude-code") {
    if (event.source === session.agent) return event;
    if (session.agent === "codex" && inferAgentKindFromEvent(event) === "codex") {
      return { ...event, source: "codex" };
    }
    return event;
  }
  return { ...event, source: session.agent };
}

function inferAgentKindFromSession(session: AgentSession): AgentKind {
  if (session.transcriptPath?.includes("/.codex/")) return "codex";
  return "claude-code";
}

function inferAgentKindFromEvent(event: AgentEvent): AgentKind {
  const raw = event.raw;
  if (raw && typeof raw === "object") {
    const transcriptPath = (raw as Record<string, unknown>).transcript_path;
    if (typeof transcriptPath === "string" && transcriptPath.includes("/.codex/")) {
      return "codex";
    }
  }
  return "claude-code";
}
