import type { AgentEvent } from "@shared/events.ts";
import { Collapsible } from "../ui/Collapsible.tsx";
import { CopyButton } from "../ui/CopyButton.tsx";

export function RawEventViewer({ event }: { event: AgentEvent }) {
  const json = JSON.stringify(event.raw, null, 2);
  return (
    <Collapsible
      label="Raw payload"
      rightSlot={<CopyButton value={json} label="Copy JSON" />}
    >
      <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 rounded p-3 overflow-auto max-h-96">
        {json}
      </pre>
    </Collapsible>
  );
}
