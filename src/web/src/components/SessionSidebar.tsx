import type { AgentSession } from "@shared/events.ts";
import { StatusBadge } from "./ui/StatusBadge.tsx";
import { formatRelative, classNames } from "../utils.ts";

export function SessionSidebar({
  sessions,
  selectedId,
  onSelect,
  connected,
}: {
  sessions: AgentSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  connected: boolean;
}) {
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
      <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500">
        <span>Sessions</span>
        <span className="font-mono text-zinc-600">{sessions.length}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-zinc-500">
            No sessions yet.
            <br />
            Run Claude Code in a configured repo.
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
