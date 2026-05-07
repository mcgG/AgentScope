import type { AgentSession } from "@shared/events.ts";
import { StatusBadge } from "./ui/StatusBadge.tsx";
import { formatRelative, classNames } from "../utils.ts";
import {
  agentMeta,
  type AgentFilter,
  type AgentKind,
} from "../agentMeta.ts";

type TabDef = {
  key: AgentFilter;
  label: string;
  dotClass: string;
};

const TABS: TabDef[] = [
  { key: "all", label: "All", dotClass: "bg-zinc-400" },
  { key: "claude-code", label: "Claude Code", dotClass: "bg-amber-500" },
  { key: "codex", label: "Codex", dotClass: "bg-emerald-400" },
];

export function SessionSidebar({
  sessions,
  selectedId,
  onSelect,
  connected,
  agentFilter,
  onAgentFilterChange,
  dashboardActive,
  onShowDashboard,
}: {
  sessions: AgentSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  connected: boolean;
  agentFilter: AgentFilter;
  onAgentFilterChange: (filter: AgentFilter) => void;
  dashboardActive: boolean;
  onShowDashboard: () => void;
}) {
  const activeCount = sessions.filter((s) => s.status === "running").length;
  const counts: Record<AgentFilter, number> = {
    all: sessions.length,
    "claude-code": sessions.filter((s) => s.agent === "claude-code").length,
    codex: sessions.filter((s) => (s.agent as AgentKind) === "codex").length,
  };

  const filtered =
    agentFilter === "all"
      ? sessions
      : sessions.filter((s) => (s.agent as AgentKind) === agentFilter);

  const emptyMessage = (() => {
    if (agentFilter === "codex") {
      return (
        <>
          No Codex sessions.
          <br />
          Configure <span className="font-mono">~/.codex/config.toml</span>{" "}
          hooks.
        </>
      );
    }
    if (agentFilter === "claude-code") {
      return (
        <>
          No sessions yet.
          <br />
          Run Claude Code in a configured repo.
        </>
      );
    }
    return (
      <>
        No sessions yet.
        <br />
        Run Claude Code or Codex in a configured repo.
      </>
    );
  })();

  return (
    <aside className="flex flex-col h-full w-72 shrink-0 border-r border-zinc-800/80 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">
            AgentScope
          </span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            v0.1
          </span>
        </div>
        <span
          className={classNames(
            "size-2 rounded-full",
            connected ? "bg-emerald-500" : "bg-zinc-600",
          )}
          title={connected ? "Live" : "Disconnected"}
        />
      </div>
      <div className="px-2 pt-2 pb-1 border-b border-zinc-800/80">
        <button
          type="button"
          onClick={onShowDashboard}
          className={classNames(
            "w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
            dashboardActive
              ? "bg-emerald-500/10 ring-1 ring-emerald-500/30"
              : "hover:bg-zinc-900",
          )}
        >
          <span className="relative inline-flex size-2 shrink-0">
            <span
              className={classNames(
                "size-2 rounded-full",
                activeCount > 0 ? "bg-emerald-400" : "bg-zinc-500",
              )}
            />
            {activeCount > 0 && (
              <span className="absolute inset-0 size-2 rounded-full bg-emerald-400 animate-ping opacity-60" />
            )}
          </span>
          <span
            className={classNames(
              "text-[12px] font-semibold flex-1",
              dashboardActive ? "text-emerald-200" : "text-zinc-200",
            )}
          >
            Live dashboard
          </span>
          {activeCount > 0 && (
            <span className="text-[10px] font-mono text-emerald-300">
              {activeCount} live
            </span>
          )}
        </button>
      </div>
      <div
        className="flex items-stretch border-b border-zinc-800/80 px-2 pt-1"
        role="tablist"
        aria-label="Filter sessions by agent"
      >
        {TABS.map((tab) => {
          const active = agentFilter === tab.key;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onAgentFilterChange(tab.key)}
              className={classNames(
                "flex-1 min-w-0 flex items-center justify-center gap-1.5 px-1.5 py-1.5 text-[11px] font-medium border-b-2 transition-colors -mb-px",
                active
                  ? "border-blue-500 text-zinc-100 bg-zinc-900/60"
                  : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40",
              )}
            >
              <span
                className={classNames(
                  "size-1.5 rounded-full shrink-0",
                  tab.dotClass,
                  !active && "opacity-70",
                )}
              />
              <span className="truncate">{tab.label}</span>
              <span
                className={classNames(
                  "font-mono text-[10px] shrink-0",
                  active ? "text-zinc-400" : "text-zinc-600",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500">
        <span>Sessions</span>
        <span className="font-mono text-zinc-600">{filtered.length}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-zinc-500">
            {emptyMessage}
          </div>
        ) : (
          <ul className="space-y-0.5 px-2 pb-3">
            {filtered.map((s) => {
              const active = s.id === selectedId;
              const meta = agentMeta(s.agent as AgentKind);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className={classNames(
                      "w-full text-left rounded-md px-2.5 py-2 transition-colors",
                      active
                        ? "bg-zinc-800/80 ring-1 ring-zinc-700"
                        : "hover:bg-zinc-900",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={s.status} />
                      <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
                        <span
                          className={classNames(
                            "size-1.5 rounded-full",
                            meta.dotClass,
                          )}
                          title={meta.label}
                          aria-label={meta.label}
                        />
                        {formatRelative(s.lastActivityAt)}
                      </span>
                    </div>
                    <div className="text-[13px] text-zinc-200 line-clamp-2 leading-snug">
                      {s.title ?? "Untitled session"}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
                      <span>{s.toolCallCount} tools</span>
                      <span>{s.eventCount} events</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
