import { useEffect, useMemo, useState } from "react";
import type { AgentEvent, AgentSession } from "@shared/events.ts";
import { agentMeta, type AgentKind } from "../agentMeta.ts";
import { classNames, formatDuration, formatRelative } from "../utils.ts";

const RATE_WINDOW_MS = 60_000;

type UsageRange = "today" | "7d" | "30d" | "90d" | "year" | "all";

type Rollup = {
  range: UsageRange;
  totals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
    cacheHitRate: number;
  };
  bySession: Array<{
    sessionId: string;
    cost: number;
    tokens: number;
    turns: number;
  }>;
};

function useUsage(range: UsageRange): Rollup | null {
  const [data, setData] = useState<Rollup | null>(null);
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/usage?range=${range}`);
        if (!r.ok) return;
        const json = (await r.json()) as Rollup;
        if (!stopped) setData(json);
      } catch {
        // ignore
      }
    };
    tick();
    const id = setInterval(tick, 8_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [range]);
  return data;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatUsd(n: number): string {
  if (n >= 1000) return `$${n.toFixed(0)}`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

const RANGE_LABEL: Record<UsageRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  year: "Year",
  all: "All time",
};

export function Dashboard({
  sessions,
  recentEvents,
  onSelect,
}: {
  sessions: AgentSession[];
  recentEvents: AgentEvent[];
  onSelect: (id: string) => void;
}) {
  const [, force] = useState(0);
  const [range, setRange] = useState<UsageRange>("today");
  const usage = useUsage(range);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const metrics = useMemo(() => computeMetrics(sessions, recentEvents), [
    sessions,
    recentEvents,
  ]);

  const activeSessions = sessions.filter((s) => s.status === "running");
  const recentSessions = sessions.slice(0, 12);

  return (
    <div className="flex-1 overflow-auto bg-zinc-950">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Hero
          activeCount={activeSessions.length}
          totalSessions={sessions.length}
        />

        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricTile
            label="Tools / min"
            value={metrics.toolsPerMin.toFixed(1)}
            accent="blue"
            trend={metrics.toolsPerMin > 0 ? "live" : "idle"}
          />
          <MetricTile
            label="Active subagents"
            value={String(metrics.activeSubagents)}
            accent="purple"
            trend={metrics.activeSubagents > 0 ? "live" : "idle"}
          />
          <MetricTile
            label="Errors (last min)"
            value={String(metrics.errorsLastMin)}
            accent={metrics.errorsLastMin > 0 ? "red" : "zinc"}
          />
          <MetricTile
            label="Avg tool latency"
            value={
              metrics.avgLatencyMs > 0
                ? formatDuration(Math.round(metrics.avgLatencyMs))
                : "—"
            }
            accent="amber"
          />
          <MetricTile
            label="Total tools today"
            value={String(metrics.toolsToday)}
            accent="emerald"
          />
          <MetricTile
            label="Total tokens"
            value={usage ? formatTokens(totalTokens(usage)) : "—"}
            accent="zinc"
            hint={usage ? `${formatPct(usage.totals.cacheHitRate)} cache hit` : undefined}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <RangeSelector value={range} onChange={setRange} />
          <MetricTile
            label="Cost"
            value={usage ? formatUsd(usage.totals.cost) : "—"}
            accent="emerald"
          />
          <MetricTile
            label="Input"
            value={usage ? formatTokens(usage.totals.input) : "—"}
            accent="blue"
            hint="non-cached"
          />
          <MetricTile
            label="Output"
            value={usage ? formatTokens(usage.totals.output) : "—"}
            accent="purple"
          />
          <MetricTile
            label="Cache read"
            value={usage ? formatTokens(usage.totals.cacheRead) : "—"}
            accent="amber"
            hint={usage ? `${formatPct(usage.totals.cacheHitRate)} hit` : undefined}
          />
          <MetricTile
            label="Cache write"
            value={usage ? formatTokens(usage.totals.cacheWrite) : "—"}
            accent="zinc"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SectionTitle
              title="Recent sessions"
              right={`${sessions.length} total`}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentSessions.map((s) => (
                <SessionTile
                  key={s.id}
                  session={s}
                  recentForSession={metrics.recentBySession.get(s.id)}
                  usage={usage?.bySession.find((x) => x.sessionId === s.id)}
                  onSelect={onSelect}
                />
              ))}
              {recentSessions.length === 0 && (
                <div className="col-span-full text-center text-xs text-zinc-500 py-8">
                  No sessions yet. Run any configured agent and events will
                  stream in here.
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <SectionTitle title="Live ticker" right="last 30s" />
            <LiveTicker events={metrics.tickerEvents} sessions={sessions} />
          </div>
        </div>
      </div>
    </div>
  );
}

function totalTokens(u: Rollup): number {
  return u.totals.input + u.totals.output + u.totals.cacheRead + u.totals.cacheWrite;
}

function formatPct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

function RangeSelector({
  value,
  onChange,
}: {
  value: UsageRange;
  onChange: (r: UsageRange) => void;
}) {
  const options: UsageRange[] = ["today", "7d", "30d", "90d", "year", "all"];
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-1.5 flex flex-col">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
        Range
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={classNames(
              "rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors",
              value === opt
                ? "bg-blue-500/20 text-blue-200 border border-blue-500/40"
                : "text-zinc-400 hover:text-zinc-200 border border-transparent",
            )}
          >
            {RANGE_LABEL[opt]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Hero({
  activeCount,
  totalSessions,
}: {
  activeCount: number;
  totalSessions: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex">
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="absolute inset-0 size-2.5 rounded-full bg-emerald-400 animate-ping opacity-60" />
      </span>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-emerald-300/80 font-semibold">
          Live
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">
          {activeCount > 0
            ? `${activeCount} agent${activeCount === 1 ? "" : "s"} working right now`
            : "No active sessions"}
        </h1>
        <div className="text-[11px] text-zinc-500 font-mono">
          {totalSessions} session{totalSessions === 1 ? "" : "s"} captured
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h2 className="text-[11px] uppercase tracking-widest text-zinc-400 font-semibold">
        {title}
      </h2>
      {right && (
        <span className="text-[11px] font-mono text-zinc-500">{right}</span>
      )}
    </div>
  );
}

const ACCENT: Record<
  string,
  { ring: string; dot: string; label: string; value: string }
> = {
  blue: {
    ring: "border-blue-500/30",
    dot: "bg-blue-400",
    label: "text-blue-300/80",
    value: "text-blue-100",
  },
  purple: {
    ring: "border-purple-500/30",
    dot: "bg-purple-400",
    label: "text-purple-300/80",
    value: "text-purple-100",
  },
  red: {
    ring: "border-red-500/30",
    dot: "bg-red-400",
    label: "text-red-300/80",
    value: "text-red-100",
  },
  amber: {
    ring: "border-amber-500/30",
    dot: "bg-amber-400",
    label: "text-amber-300/80",
    value: "text-amber-100",
  },
  emerald: {
    ring: "border-emerald-500/30",
    dot: "bg-emerald-400",
    label: "text-emerald-300/80",
    value: "text-emerald-100",
  },
  zinc: {
    ring: "border-zinc-700",
    dot: "bg-zinc-600",
    label: "text-zinc-500",
    value: "text-zinc-300",
  },
};

function MetricTile({
  label,
  value,
  accent,
  trend,
  hint,
}: {
  label: string;
  value: string;
  accent: keyof typeof ACCENT;
  trend?: "live" | "idle";
  hint?: string;
}) {
  const c = ACCENT[accent] ?? ACCENT.zinc;
  return (
    <div
      className={classNames(
        "rounded-lg border bg-zinc-900/40 px-3 py-2.5",
        c?.ring,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={classNames(
            "size-1.5 rounded-full",
            c?.dot,
            trend === "live" && "animate-pulse",
          )}
        />
        <div
          className={classNames(
            "text-[10px] uppercase tracking-wider font-semibold",
            c?.label,
          )}
        >
          {label}
        </div>
      </div>
      <div
        className={classNames(
          "mt-1 text-2xl font-mono font-semibold tabular-nums",
          c?.value,
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] font-mono text-zinc-600 italic">
          {hint}
        </div>
      )}
    </div>
  );
}

function SessionTile({
  session,
  recentForSession,
  usage,
  onSelect,
}: {
  session: AgentSession;
  recentForSession: AgentEvent[] | undefined;
  usage?: { cost: number; tokens: number; turns: number };
  onSelect: (id: string) => void;
}) {
  const meta = agentMeta(session.agent as AgentKind);
  const isRunning = session.status === "running";
  const lastEvent = recentForSession?.[recentForSession.length - 1];
  const lastTool = lastEvent?.toolName;

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      className={classNames(
        "text-left rounded-lg border bg-zinc-900/40 px-3.5 py-3 hover:border-zinc-600 transition-colors",
        isRunning
          ? "border-blue-500/40 shadow-[0_0_30px_-15px_rgba(59,130,246,0.6)]"
          : "border-zinc-800",
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={classNames("size-1.5 rounded-full", meta.dotClass)}
          title={meta.label}
        />
        <span
          className={classNames(
            "text-[10px] uppercase tracking-widest font-semibold",
            meta.textClass,
          )}
        >
          {meta.short}
        </span>
        <span
          className={classNames(
            "ml-auto text-[10px] font-mono px-1.5 py-px rounded border",
            isRunning
              ? "text-blue-300 bg-blue-500/10 border-blue-500/30"
              : session.status === "failed"
                ? "text-red-300 bg-red-500/10 border-red-500/30"
                : "text-zinc-400 bg-zinc-800/40 border-zinc-700/40",
          )}
        >
          {session.status}
        </span>
      </div>
      <div className="text-[13px] text-zinc-200 line-clamp-2 leading-snug min-h-[2.5em]">
        {session.title ?? "Untitled session"}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-zinc-500">
        <span>
          {session.toolCallCount} tools · {session.eventCount} events
        </span>
        <span>{formatRelative(session.lastActivityAt)}</span>
      </div>
      {usage && (usage.tokens > 0 || usage.cost > 0) && (
        <div className="mt-2 flex items-center gap-2 text-[10px] font-mono">
          <span className="text-amber-300">
            🪙 {formatTokens(usage.tokens)}
          </span>
          <span className="text-emerald-300">
            💰 {formatUsd(usage.cost)}
          </span>
          {usage.turns > 0 && (
            <span className="text-zinc-500 ml-auto">{usage.turns} turns</span>
          )}
        </div>
      )}
      {isRunning && lastTool && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-200">
          <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="font-mono truncate">{lastTool}</span>
        </div>
      )}
    </button>
  );
}

function LiveTicker({
  events,
  sessions,
}: {
  events: AgentEvent[];
  sessions: AgentSession[];
}) {
  const sessionMap = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions],
  );
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 overflow-hidden">
      <div className="max-h-[480px] overflow-auto">
        {events.length === 0 ? (
          <div className="text-center text-[11px] text-zinc-600 py-8">
            Waiting for events…
          </div>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {events.map((e) => {
              const session = sessionMap.get(e.sessionId);
              const meta = session
                ? agentMeta(session.agent as AgentKind)
                : null;
              const isFailed =
                e.eventType === "tool_failed" || e.status === "failed";
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono animate-spawn-in"
                >
                  <span className="text-zinc-600 tabular-nums shrink-0">
                    {new Date(e.timestamp).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  {meta && (
                    <span
                      className={classNames("size-1.5 rounded-full shrink-0", meta.dotClass)}
                      title={meta.label}
                    />
                  )}
                  <span
                    className={classNames(
                      "truncate",
                      isFailed ? "text-red-300" : "text-zinc-200",
                    )}
                  >
                    {e.toolName ?? e.title}
                  </span>
                  {e.durationMs != null && (
                    <span className="ml-auto shrink-0 text-zinc-500">
                      {formatDuration(e.durationMs)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

type Metrics = {
  toolsPerMin: number;
  toolsToday: number;
  errorsLastMin: number;
  activeSubagents: number;
  avgLatencyMs: number;
  recentBySession: Map<string, AgentEvent[]>;
  tickerEvents: AgentEvent[];
};

function computeMetrics(
  sessions: AgentSession[],
  recentEvents: AgentEvent[],
): Metrics {
  const now = Date.now();
  const minuteAgo = now - RATE_WINDOW_MS;

  const completionsLastMin = recentEvents.filter((e) => {
    if (
      e.eventType !== "tool_completed" &&
      e.eventType !== "tool_failed"
    ) {
      return false;
    }
    return new Date(e.timestamp).getTime() >= minuteAgo;
  });

  const toolsPerMin = completionsLastMin.length;

  const errorsLastMin = recentEvents.filter(
    (e) =>
      (e.eventType === "tool_failed" || e.status === "failed") &&
      new Date(e.timestamp).getTime() >= minuteAgo,
  ).length;

  const activeSubagents = recentEvents.filter(
    (e) =>
      e.toolName &&
      ["Agent", "Task", "spawn_agent"].includes(e.toolName) &&
      e.eventType === "tool_started" &&
      e.status === "running",
  ).length;

  const durations = completionsLastMin
    .map((e) => e.durationMs)
    .filter((d): d is number => typeof d === "number");
  const avgLatencyMs =
    durations.length > 0
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : 0;

  const toolsToday = sessions.reduce((s, x) => s + x.toolCallCount, 0);

  const recentBySession = new Map<string, AgentEvent[]>();
  for (const e of recentEvents) {
    const list = recentBySession.get(e.sessionId) ?? [];
    list.push(e);
    recentBySession.set(e.sessionId, list);
  }

  const tickerCutoff = now - 30_000;
  const tickerEvents = recentEvents
    .filter(
      (e) =>
        new Date(e.timestamp).getTime() >= tickerCutoff &&
        e.toolName != null &&
        (e.eventType === "tool_completed" ||
          e.eventType === "tool_failed" ||
          e.eventType === "tool_started"),
    )
    .slice(-30)
    .reverse();

  return {
    toolsPerMin,
    toolsToday,
    errorsLastMin,
    activeSubagents,
    avgLatencyMs,
    recentBySession,
    tickerEvents,
  };
}
