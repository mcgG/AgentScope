import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { Collapsible } from "../ui/Collapsible.tsx";
import { CopyButton } from "../ui/CopyButton.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function TerminalCard({ event }: { event: AgentEvent }) {
  const input = asObj(event.input);
  const output = asObj(event.output);
  const command = asStr(input.command);
  const description = asStr(input.description);
  const stdout = asStr(output.stdout);
  const stderr = asStr(output.stderr);
  const interrupted = output.interrupted === true;

  return (
    <CardShell
      event={event}
      icon={<span className="font-mono text-xs">$_</span>}
      title="Bash"
      subtitle={
        description ? (
          <span className="text-zinc-400">{description}</span>
        ) : undefined
      }
    >
      {command && (
        <div className="px-3 pb-2 -mt-1">
          <div className="flex items-start gap-2 rounded-md bg-zinc-950/80 border border-zinc-800/80 px-2.5 py-1.5">
            <span className="text-emerald-500 font-mono text-xs mt-0.5 select-none">
              $
            </span>
            <pre className="flex-1 font-mono text-xs text-zinc-200 whitespace-pre-wrap break-all">
              {command}
            </pre>
            <CopyButton value={command} label="Copy" />
          </div>
        </div>
      )}
      {event.cwd && (
        <div className="px-3 pb-2 text-[11px] text-zinc-500 font-mono break-all">
          cwd: {event.cwd}
        </div>
      )}
      {(stdout || stderr || interrupted) && (
        <Collapsible
          label="Output"
          defaultOpen={event.status === "failed" || stderr.length > 0}
          count={stdout.length + stderr.length}
          rightSlot={
            stdout && <CopyButton value={stdout} label="Copy stdout" />
          }
        >
          {stdout && (
            <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap">
              {stdout}
            </pre>
          )}
          {stderr && (
            <div className="mt-2">
              <div className="text-[11px] text-red-300 font-medium mb-1">
                stderr
              </div>
              <pre className="text-[12px] font-mono text-red-200 bg-red-950/30 border border-red-900/40 rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap">
                {stderr}
              </pre>
            </div>
          )}
          {interrupted && (
            <div className="mt-2 text-[12px] text-amber-300">
              Command was interrupted
            </div>
          )}
        </Collapsible>
      )}
      <RawEventViewer event={event} />
    </CardShell>
  );
}
