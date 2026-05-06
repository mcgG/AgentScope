import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, AgentKind, AgentSession } from "@shared/events.ts";
import { fetchEvents, fetchSessions } from "./api.ts";
import { SessionSidebar } from "./components/SessionSidebar.tsx";
import { SessionHeader } from "./components/SessionHeader.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { WorkflowView } from "./components/WorkflowView.tsx";

type EventsBySession = Record<string, AgentEvent[]>;
type SessionFilter = AgentKind | "all";
type ViewMode = "timeline" | "workflow";

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
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [connected, setConnected] = useState(false);
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

  const visibleSessions = useMemo(
    () =>
      sessionFilter === "all"
        ? sessions
        : sessions.filter((s) => s.agent === sessionFilter),
    [sessionFilter, sessions],
  );

  useEffect(() => {
    if (visibleSessions.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visibleSessions.some((s) => s.id === selectedId)) {
      setSelectedId(visibleSessions[0]!.id);
    }
  }, [selectedId, visibleSessions]);

  const selectedSession = useMemo(
    () => visibleSessions.find((s) => s.id === selectedId) ?? null,
    [selectedId, visibleSessions],
  );
  const selectedEvents = selectedId ? eventsBySession[selectedId] ?? [] : [];

  useEffect(() => {
    if (!selectedId || viewMode !== "workflow" || selectedSession?.agent !== "codex") {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      fetchEvents(selectedId)
        .then((events) => {
          if (!cancelled) {
            setEventsBySession((prev) => ({ ...prev, [selectedId]: events }));
          }
        })
        .catch(() => {});
    };
    const timer = window.setInterval(refresh, 2_000);
    refresh();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedId, selectedSession?.agent, viewMode]);

  return (
    <div className="flex h-full">
      <SessionSidebar
        sessions={visibleSessions}
        allSessions={sessions}
        filter={sessionFilter}
        onFilterChange={setSessionFilter}
        selectedId={selectedId}
        onSelect={selectSession}
        connected={connected}
      />
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        {selectedSession ? (
          <>
            <SessionHeader session={selectedSession} />
            <div className="flex items-center gap-4 px-6 py-2 border-b border-zinc-800/60 text-[11px] text-zinc-500">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
              <span className="ml-auto font-mono">id: {selectedSession.id.slice(0, 8)}</span>
            </div>
            {viewMode === "timeline" ? (
              <Timeline events={selectedEvents} />
            ) : (
              <WorkflowView events={selectedEvents} />
            )}
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

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const options: Array<{ key: ViewMode; label: string }> = [
    { key: "timeline", label: "Timeline" },
    { key: "workflow", label: "Workflow" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
      {options.map((option) => {
        const active = mode === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={
              "rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
              (active
                ? "bg-zinc-700/70 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200")
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
