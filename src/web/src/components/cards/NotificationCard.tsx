import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function NotificationCard({ event }: { event: AgentEvent }) {
  const raw = asObj(event.raw);
  const message = asStr(raw.message) || event.summary || "";
  const looksLikePerm =
    /permission|approve|allow|grant/i.test(message) ||
    event.hookEventName === "PreCompact";

  return (
    <CardShell
      event={event}
      icon={
        <span className="text-amber-300 text-base leading-none">
          {looksLikePerm ? "🛡" : "ⓘ"}
        </span>
      }
      title={event.title}
      subtitle={
        message ? (
          <span className="text-amber-200/90">{message}</span>
        ) : undefined
      }
    >
      <RawEventViewer event={event} />
    </CardShell>
  );
}
