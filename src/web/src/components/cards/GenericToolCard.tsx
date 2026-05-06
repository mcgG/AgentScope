import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { Collapsible } from "../ui/Collapsible.tsx";
import { CopyButton } from "../ui/CopyButton.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";

export function GenericToolCard({ event }: { event: AgentEvent }) {
  const inputJson =
    event.input !== undefined
      ? JSON.stringify(event.input, null, 2)
      : undefined;
  const outputJson =
    event.output !== undefined
      ? JSON.stringify(event.output, null, 2)
      : undefined;
  return (
    <CardShell
      event={event}
      icon={<span className="text-xs">⚙</span>}
      title={event.toolName ?? event.title}
      subtitle={event.summary}
    >
      {inputJson && (
        <Collapsible
          label="Input"
          rightSlot={<CopyButton value={inputJson} label="Copy" />}
        >
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap">
            {inputJson}
          </pre>
        </Collapsible>
      )}
      {outputJson && (
        <Collapsible
          label="Output"
          defaultOpen={event.status === "failed"}
          rightSlot={<CopyButton value={outputJson} label="Copy" />}
        >
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap">
            {outputJson}
          </pre>
        </Collapsible>
      )}
      {event.error && (
        <div className="px-3 pb-3">
          <div className="text-[11px] text-red-300 font-medium mb-1">Error</div>
          <pre className="text-[12px] font-mono text-red-200 bg-red-950/30 border border-red-900/40 rounded p-3 whitespace-pre-wrap">
            {event.error}
          </pre>
        </div>
      )}
      <RawEventViewer event={event} />
    </CardShell>
  );
}
