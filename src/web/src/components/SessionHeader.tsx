import type { AgentSession } from "@shared/events.ts";
import { StatusBadge } from "./ui/StatusBadge.tsx";
import { formatRelative } from "../utils.ts";

export function SessionHeader({ session }: { session: AgentSession }) {
  return (
    <header className="border-b border-zinc-800/80 px-6 py-4 bg-zinc-950/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Claude Code
            </span>
            <StatusBadge status={session.status} />
          </div>
          <h1 className="text-base font-medium text-zinc-100 leading-snug truncate">
            {session.title ?? "Untitled session"}
          </h1>
          {session.cwd && (
            <div
              className="mt-1 text-[11px] font-mono text-zinc-500 truncate"
              title={session.cwd}
            >
              {session.cwd}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end text-[11px] text-zinc-500 font-mono">
          <span>started {formatRelative(session.startedAt)}</span>
          {session.endedAt && (
            <span>ended {formatRelative(session.endedAt)}</span>
          )}
          <span className="mt-1">
            {session.toolCallCount} tools · {session.eventCount} events
          </span>
        </div>
      </div>
    </header>
  );
}
