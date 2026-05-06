import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { Collapsible } from "../ui/Collapsible.tsx";
import { CopyButton } from "../ui/CopyButton.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";
import { ContentBlocks, isContentBlockArray } from "./ContentBlocks.tsx";

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseMcpName(toolName: string | undefined): {
  server?: string;
  short: string;
  isMcp: boolean;
} {
  if (!toolName) return { short: "tool", isMcp: false };
  const m = toolName.match(/^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/);
  if (!m) return { short: toolName, isMcp: false };
  return { server: m[1] ?? "", short: m[2] ?? toolName, isMcp: true };
}

export function GenericToolCard({ event }: { event: AgentEvent }) {
  const { server, short, isMcp } = parseMcpName(event.toolName);
  const inputJson =
    event.input !== undefined
      ? JSON.stringify(event.input, null, 2)
      : undefined;

  const outputIsBlocks = isContentBlockArray(event.output);
  const outputHasImage =
    outputIsBlocks &&
    (event.output as Array<{ type?: string }>).some(
      (b) => b?.type === "image",
    );
  const outputJson =
    !outputIsBlocks && event.output !== undefined
      ? JSON.stringify(event.output, null, 2)
      : undefined;

  return (
    <CardShell
      event={event}
      icon={isMcp ? <McpIcon /> : <span className="text-xs">⚙</span>}
      title={
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate">
            {isMcp ? short.replace(/_/g, " ") : event.toolName ?? event.title}
          </span>
          {isMcp && server && (
            <span className="text-[10px] font-mono uppercase tracking-wide text-fuchsia-300/80 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded px-1.5 py-px shrink-0">
              {server}
            </span>
          )}
        </span>
      }
      subtitle={event.summary}
    >
      {isObj(event.input) && Object.keys(event.input).length > 0 && (
        <KeyValueInput input={event.input} fullJson={inputJson} />
      )}
      {!isObj(event.input) && inputJson && (
        <Collapsible
          label="Input"
          rightSlot={<CopyButton value={inputJson} label="Copy" />}
        >
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap">
            {inputJson}
          </pre>
        </Collapsible>
      )}
      {outputIsBlocks && (
        <Collapsible
          label={outputHasImage ? "Result (with image)" : "Result"}
          defaultOpen={outputHasImage}
        >
          <ContentBlocks blocks={event.output} />
        </Collapsible>
      )}
      {outputJson && (
        <Collapsible
          label="Output"
          defaultOpen={event.status === "failed"}
          rightSlot={<CopyButton value={outputJson} label="Copy" />}
        >
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap">
            {outputJson}
          </pre>
        </Collapsible>
      )}
      {event.error && (
        <div className="px-3 pb-3">
          <div className="text-[11px] text-red-300 font-medium mb-1">
            Error
          </div>
          <pre className="text-[12px] font-mono text-red-200 bg-red-950/30 border border-red-900/40 rounded p-3 whitespace-pre-wrap">
            {event.error}
          </pre>
        </div>
      )}
      <RawEventViewer event={event} />
    </CardShell>
  );
}

function KeyValueInput({
  input,
  fullJson,
}: {
  input: Record<string, unknown>;
  fullJson?: string;
}) {
  const entries = Object.entries(input);
  return (
    <Collapsible
      label="Input"
      defaultOpen
      count={entries.length}
      rightSlot={
        fullJson ? <CopyButton value={fullJson} label="Copy JSON" /> : undefined
      }
    >
      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 divide-y divide-zinc-800/70 overflow-hidden">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-3 px-2.5 py-1.5">
            <div className="text-[11px] font-mono uppercase tracking-wide text-zinc-500 w-28 shrink-0 truncate">
              {k}
            </div>
            <div className="text-[12px] font-mono text-zinc-200 break-all min-w-0 flex-1">
              <ValuePreview value={v} />
            </div>
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

function ValuePreview({ value }: { value: unknown }) {
  if (value == null) return <span className="text-zinc-600">null</span>;
  if (typeof value === "string") {
    if (value.length > 200) {
      return (
        <span className="whitespace-pre-wrap">
          {value.slice(0, 200)}
          <span className="text-zinc-500">…</span>
        </span>
      );
    }
    return <span className="whitespace-pre-wrap">{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-amber-200">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="text-zinc-400">
        [{value.length} item{value.length === 1 ? "" : "s"}]
      </span>
    );
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    return (
      <span className="text-zinc-400 truncate inline-block max-w-full align-bottom">
        {json.length > 120 ? `${json.slice(0, 120)}…` : json}
      </span>
    );
  }
  return <span>{String(value)}</span>;
}

function McpIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-fuchsia-300"
    >
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="m4.93 4.93 2.83 2.83" />
      <path d="m16.24 16.24 2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="m4.93 19.07 2.83-2.83" />
      <path d="m16.24 7.76 2.83-2.83" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
