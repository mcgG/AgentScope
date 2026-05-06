import type { ReactNode } from "react";
import type { AgentEvent } from "@shared/events.ts";
import { StatusBadge } from "../ui/StatusBadge.tsx";
import { formatDuration, formatTime, classNames } from "../../utils.ts";

export function CardShell({
  event,
  icon,
  title,
  subtitle,
  headerRight,
  children,
}: {
  event: AgentEvent;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  children?: ReactNode;
}) {
  const failed = event.status === "failed" || event.eventType === "tool_failed";
  return (
    <div
      className={classNames(
        "rounded-lg border bg-zinc-900/60 backdrop-blur-sm overflow-hidden",
        failed
          ? "border-red-900/60 ring-1 ring-red-900/40"
          : "border-zinc-800",
      )}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-800/80 text-zinc-300">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100 truncate">
              {title}
            </span>
            {event.status && <StatusBadge status={event.status} />}
            {event.durationMs != null && (
              <span className="text-[11px] text-zinc-500 font-mono">
                {formatDuration(event.durationMs)}
              </span>
            )}
            <span className="text-[11px] text-zinc-600 font-mono ml-auto">
              {formatTime(event.timestamp)}
            </span>
          </div>
          {subtitle && (
            <div className="mt-1 text-[12px] text-zinc-400 break-all">
              {subtitle}
            </div>
          )}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}
