import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, AgentSession } from "@shared/events.ts";
import { fetchEvents, fetchSessions } from "./api.ts";
import { SessionSidebar } from "./components/SessionSidebar.tsx";
import { SessionHeader } from "./components/SessionHeader.tsx";
import { Timeline } from "./components/Timeline.tsx";

type EventsBySession = Record<string, AgentEvent[]>;

function upsertSession(
  list: AgentSession[],
  next: AgentSession,
): AgentSession[] {
  const idx = list.findIndex((s) => s.id === next.id);
  if (idx >= 0) {
    const out = [...list];
    out[idx] = next;
    return sortSessions(out);
  }
  return sortSessions([...list, next]);
}

function sortSessions(list: AgentSession[]): AgentSession[] {
  return [...list].sort((a, b) =>
    b.lastActivityAt.localeCompare(a.lastActivityAt),
  );
}

function upsertEvent(list: AgentEvent[], next: AgentEvent): AgentEvent[] {
  const idx = list.findIndex((e) => e.id === next.id);
  if (idx >= 0) {
    const out = [...list];
    out[idx] = next;
    return out;
  }
  return [...list, next];
}

export default function App() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [eventsBySession, setEventsBySession] = useState<EventsBySession>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const userSelectedRef = useRef(false);

  // Initial sessions load
  useEffect(() => {
    fetchSessions()
      .then((s) => {
        setSessions(sortSessions(s));
        if (!userSelectedRef.current && s.length > 0) {
          setSelectedId(s[0]!.id);
        }
      })
      .catch(() => {
        /* server probably starting; SSE will catch up */
      });
  }, []);

  // Load events when selection changes (if not already cached)
  useEffect(() => {
    if (!selectedId) return;
    if (eventsBySession[selectedId]) return;
    fetchEvents(selectedId)
      .then((events) => {
        setEventsBySession((prev) => ({ ...prev, [selectedId]: events }));
      })
      .catch(() => {});
  }, [selectedId, eventsBySession]);

  // SSE subscription
  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 0;
    let cancelled = false;

    const connect = () => {
      es = new EventSource("/api/events/stream");
      es.addEventListener("hello", () => {
        retry = 0;
        setConnected(true);
      });
      es.addEventListener("session_upserted", (e) => {
        try {
          const session = JSON.parse((e as MessageEvent).data) as AgentSession;
          setSessions((prev) => upsertSession(prev, session));
          if (!userSelectedRef.current) {
            setSelectedId((prev) => prev ?? session.id);
          }
        } catch {}
      });
      es.addEventListener("event_upserted", (e) => {
        try {
          const event = JSON.parse((e as MessageEvent).data) as AgentEvent;
          setEventsBySession((prev) => ({
            ...prev,
            [event.sessionId]: upsertEvent(prev[event.sessionId] ?? [], event),
          }));
        } catch {}
      });
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (cancelled) return;
        retry = Math.min(retry + 1, 5);
        setTimeout(connect, 500 * retry);
      };
    };

    connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, []);

  const selectSession = useCallback((id: string) => {
    userSelectedRef.current = true;
    setSelectedId(id);
  }, []);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );
  const selectedEvents = selectedId ? eventsBySession[selectedId] ?? [] : [];

  return (
    <div className="flex h-full">
      <SessionSidebar
        sessions={sessions}
        selectedId={selectedId}
        onSelect={selectSession}
        connected={connected}
      />
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        {selectedSession ? (
          <>
            <SessionHeader session={selectedSession} />
            <div className="flex items-center gap-4 px-6 py-2 border-b border-zinc-800/60 text-[11px] text-zinc-500">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="size-3 accent-blue-500"
                />
                Auto-scroll
              </label>
              <span className="ml-auto font-mono">id: {selectedSession.id.slice(0, 8)}</span>
            </div>
            <div className="flex-1 overflow-auto">
              <Timeline events={selectedEvents} autoScroll={autoScroll} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <div className="text-base mb-2">No session selected</div>
              <div className="text-xs">
                Configure Claude Code hooks and run a session.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
