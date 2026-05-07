import { nanoid } from "nanoid";
import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
        const session: AgentSession = JSON.parse(sessionRaw);
        this.sessions.set(session.id, session);

        const eventsPath = join(SESSIONS_DIR, `${sessionId}.events.jsonl`);
        try {
          const eventsRaw = await readFile(eventsPath, "utf8");
          const lines = eventsRaw.split("\n").filter((l) => l.trim());
          const eventMap = new Map<string, AgentEvent>();
          for (const line of lines) {
            try {
              const e = JSON.parse(line) as AgentEvent;
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
        } catch {
          this.events.set(sessionId, []);
        }
      } catch (e) {
        console.warn(`Failed to load session file ${file}:`, e);
      }
    }
  }

  async ingest(
    raw: unknown,
    agent: AgentKind = "claude-code",
  ): Promise<IngestResult> {
    const normalized = normalizeHookPayload(raw, agent);
    const sessionId = normalized.sessionId;

    const session = this.upsertSession(sessionId, normalized, agent);

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
    agent: AgentKind = "claude-code",
  ): AgentSession {
    const now = normalized.timestamp;
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        agent,
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

  getEvents(sessionId: string): AgentEvent[] {
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
    const r = raw as Record<string, unknown>;
    const v = r.transcript_path ?? r.transcriptPath;
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
    const r = raw as Record<string, unknown>;
    const v = r.last_assistant_message ?? r.lastAssistantMessage;
    if (typeof v === "string") return v;
  }
  return undefined;
}

export const sessionStore = new SessionStore();
