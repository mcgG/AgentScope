import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";

export function UserPromptCard({ event }: { event: AgentEvent }) {
  const prompt = event.prompt ?? event.summary ?? "";
  return (
    <CardShell
      event={event}
      icon={<span className="text-xs">›</span>}
      title="User prompt"
    >
      {prompt && (
        <div className="px-3 pb-3">
          <div className="rounded-md border-l-2 border-blue-500/60 bg-blue-500/5 px-3 py-2 text-[13px] text-zinc-200 whitespace-pre-wrap">
            {prompt}
          </div>
        </div>
      )}
      <RawEventViewer event={event} />
    </CardShell>
  );
}
