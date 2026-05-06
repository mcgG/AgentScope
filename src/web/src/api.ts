import type { AgentEvent, AgentSession } from "@shared/events.ts";

export async function fetchSessions(): Promise<AgentSession[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error(`fetchSessions: ${res.status}`);
  const data = (await res.json()) as { sessions: AgentSession[] };
  return data.sessions;
}

export async function fetchEvents(sessionId: string): Promise<AgentEvent[]> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/events`,
  );
  if (!res.ok) throw new Error(`fetchEvents: ${res.status}`);
  const data = (await res.json()) as { events: AgentEvent[] };
  return data.events;
}
