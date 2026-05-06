import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";

export function SessionLifecycleCard({ event }: { event: AgentEvent }) {
  const isStart = event.eventType === "session_started";
  return (
    <CardShell
      event={event}
      icon={<span className="text-xs">{isStart ? "▶" : "■"}</span>}
      title={event.title}
      subtitle={event.summary}
    >
      <RawEventViewer event={event} />
    </CardShell>
  );
}
