import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, AgentSession } from "@shared/events.ts";
import { fetchEvents, fetchSessions } from "./api.ts";
import { SessionSidebar } from "./components/SessionSidebar.tsx";
import { SessionHeader } from "./components/SessionHeader.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { GraphView } from "./components/GraphView.tsx";
import { Dashboard } from "./components/Dashboard.tsx";
import { PlaygroundView } from "./components/PlaygroundView.tsx";
import type { AgentFilter, AgentKind } from "./agentMeta.ts";

type ViewMode = "timeline" | "graph" | "playground";

const RECENT_EVENT_CAP = 200;

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

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const options: { key: ViewMode; label: string }[] = [
    { key: "timeline", label: "Timeline" },
    { key: "graph", label: "Graph" },
    { key: "playground", label: "Playground" },
  ];
  return (
    <div className="inline-flex items-center rounded-md bg-zinc-900/60 border border-zinc-800 p-0.5">
      {options.map((opt) => {
        const active = mode === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={
              "px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors " +
              (active
                ? "bg-zinc-700/60 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [eventsBySession, setEventsBySession] = useState<EventsBySession>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [showDashboard, setShowDashboard] = useState(true);
  const [recentEvents, setRecentEvents] = useState<AgentEvent[]>([]);
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

  // Load events when selection changes. Always re-fetch authoritative state
  // from the server (SSE only delivers deltas during the user's session and may
  // have missed events while another session was selected).
  useEffect(() => {
    if (!selectedId) return;
    fetchEvents(selectedId)
      .then((events) => {
        setEventsBySession((prev) => {
          const existing = prev[selectedId] ?? [];
          if (events.length >= existing.length) return { ...prev, [selectedId]: events };
          // Server somehow has fewer events than we cached; merge to be safe.
          const byId = new Map(existing.map((e) => [e.id, e]));
          for (const e of events) byId.set(e.id, e);
          const merged = Array.from(byId.values()).sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp),
          );
          return { ...prev, [selectedId]: merged };
        });
      })
      .catch(() => {});
  }, [selectedId]);

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
          setRecentEvents((prev) => {
            const next = upsertEvent(prev, event);
            return next.length > RECENT_EVENT_CAP
              ? next.slice(next.length - RECENT_EVENT_CAP)
              : next;
          });
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
    setShowDashboard(false);
  }, []);

  const showLiveDashboard = useCallback(() => {
    setShowDashboard(true);
  }, []);

  const handleAgentFilterChange = useCallback(
    (next: AgentFilter) => {
      setAgentFilter(next);
      const visible =
        next === "all"
          ? sessions
          : sessions.filter((s) => (s.agent as AgentKind) === next);
      const stillVisible =
        selectedId != null && visible.some((s) => s.id === selectedId);
      if (!stillVisible) {
        userSelectedRef.current = false;
        setSelectedId(visible.length > 0 ? visible[0]!.id : null);
      }
    },
    [sessions, selectedId],
  );

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );
  const selectedEvents = selectedId ? eventsBySession[selectedId] ?? [] : [];

  return (
    <div className="flex h-full">
      <SessionSidebar
        sessions={sessions}
        selectedId={showDashboard ? null : selectedId}
        onSelect={selectSession}
        connected={connected}
        agentFilter={agentFilter}
        onAgentFilterChange={handleAgentFilterChange}
        dashboardActive={showDashboard}
        onShowDashboard={showLiveDashboard}
      />
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        {showDashboard ? (
          <Dashboard
            sessions={sessions}
            recentEvents={recentEvents}
            onSelect={selectSession}
          />
        ) : selectedSession ? (
          <>
            <SessionHeader session={selectedSession} />
            <div className="flex items-center gap-4 px-6 py-2 border-b border-zinc-800/60 text-[11px] text-zinc-500">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
              <span className="ml-auto font-mono">id: {selectedSession.id.slice(0, 8)}</span>
            </div>
            {viewMode === "timeline" ? (
              <Timeline events={selectedEvents} />
            ) : viewMode === "graph" ? (
              <GraphView events={selectedEvents} />
            ) : (
              <PlaygroundView events={selectedEvents} session={selectedSession} />
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
