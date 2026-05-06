import type { AgentKind, AgentSession } from "@shared/events.ts";
import { StatusBadge } from "./ui/StatusBadge.tsx";
import { formatRelative, classNames } from "../utils.ts";
import { AGENT_META } from "../agentMeta.ts";

type SessionFilter = AgentKind | "all";

export function SessionSidebar({
  sessions,
  allSessions,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  connected,
}: {
  sessions: AgentSession[];
  allSessions: AgentSession[];
  filter: SessionFilter;
  onFilterChange: (filter: SessionFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  connected: boolean;
}) {
  const counts = {
    all: allSessions.length,
    "claude-code": allSessions.filter((s) => s.agent === "claude-code").length,
    codex: allSessions.filter((s) => s.agent === "codex").length,
  };
  const emptyLabel =
    filter === "codex"
      ? "No Codex sessions."
      : filter === "claude-code"
        ? "No Claude Code sessions."
        : "No sessions yet.";

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
      <div className="grid grid-cols-3 gap-1 px-2 py-2 border-b border-zinc-800/80 text-[11px]">
        <FilterButton
          active={filter === "all"}
          count={counts.all}
          dotClass="bg-zinc-500"
          label="All"
          onClick={() => onFilterChange("all")}
        />
        <FilterButton
          active={filter === "claude-code"}
          activeClass={AGENT_META["claude-code"].activeClass}
          count={counts["claude-code"]}
          dotClass={AGENT_META["claude-code"].dotClass}
          label="Claude ..."
          onClick={() => onFilterChange("claude-code")}
        />
        <FilterButton
          active={filter === "codex"}
          activeClass={AGENT_META.codex.activeClass}
          count={counts.codex}
          dotClass={AGENT_META.codex.dotClass}
          label="Codex"
          onClick={() => onFilterChange("codex")}
        />
      </div>
      <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500">
        <span>Sessions</span>
        <span className="font-mono text-zinc-600">{sessions.length}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-zinc-500">
            {emptyLabel}
            <br />
            {filter === "codex"
              ? "Configure ~/.codex/config.toml hooks."
              : "Run an agent in a configured repo."}
          </div>
        ) : (
          <ul className="space-y-0.5 px-2 pb-3">
            {sessions.map((s) => {
              const active = s.id === selectedId;
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
                      <span
                        className={classNames(
                          "size-1.5 rounded-full",
                          AGENT_META[s.agent].dotClass,
                        )}
                        title={AGENT_META[s.agent].label}
                      />
                      <StatusBadge status={s.status} />
                      <span className="ml-auto text-[10px] text-zinc-500 font-mono">
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

function FilterButton({
  active,
  activeClass,
  count,
  dotClass,
  label,
  onClick,
}: {
  active: boolean;
  activeClass?: string;
  count: number;
  dotClass: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "flex items-center justify-center gap-1.5 rounded border border-transparent px-1.5 py-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300",
        active && (activeClass ?? "text-zinc-200 border-zinc-700 bg-zinc-900"),
      )}
    >
      <span className={classNames("size-1.5 rounded-full", dotClass)} />
      <span className="truncate">{label}</span>
      <span className="font-mono text-[10px] text-zinc-500">{count}</span>
    </button>
  );
}
