import type {
  AgentSessionStatus,
  AgentToolStatus,
} from "@shared/events.ts";
import { classNames } from "../../utils.ts";

type Status = AgentToolStatus | AgentSessionStatus | undefined;

const STYLES: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  unknown: "bg-zinc-700/40 text-zinc-300 border-zinc-600/40",
};

export function StatusBadge({
  status,
  label,
}: {
  status: Status;
  label?: string;
}) {
  const s = status ?? "unknown";
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium uppercase tracking-wide",
        STYLES[s] ?? STYLES.unknown,
      )}
    >
      {s === "running" && (
        <span className="inline-block size-1.5 rounded-full bg-blue-400 animate-pulse" />
      )}
      {label ?? s}
    </span>
  );
}
