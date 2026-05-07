import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { Collapsible } from "../ui/Collapsible.tsx";
import { CopyButton } from "../ui/CopyButton.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";
import { classNames } from "../../utils.ts";

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseOutput(out: unknown): {
  bytes?: number;
  code?: number;
  codeText?: string;
  result?: string;
} {
  let parsed: unknown = out;
  if (typeof out === "string") {
    try {
      parsed = JSON.parse(out);
    } catch {
      return { result: out };
    }
  }
  const obj = asObj(parsed);
  return {
    bytes: typeof obj.bytes === "number" ? obj.bytes : undefined,
    code: typeof obj.code === "number" ? obj.code : undefined,
    codeText: asStr(obj.codeText),
    result: asStr(obj.result) || undefined,
  };
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function WebFetchCard({ event }: { event: AgentEvent }) {
  const input = asObj(event.input);
  const url = asStr(input.url);
  const prompt = asStr(input.prompt);
  const { bytes, code, codeText, result } = parseOutput(event.output);

  const okStatus = code != null && code >= 200 && code < 300;

  return (
    <CardShell
      event={event}
      icon={<GlobeIcon />}
      title="Web fetch"
      subtitle={
        url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-300 hover:underline break-all font-mono text-[12px]"
          >
            {domain(url)}
            <span className="text-zinc-500">
              {url.replace(/^https?:\/\/[^/]+/, "")}
            </span>
          </a>
        ) : undefined
      }
      headerRight={
        code != null ? (
          <span
            className={classNames(
              "text-[10px] font-mono shrink-0 px-1.5 py-px rounded border",
              okStatus
                ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                : "text-red-300 bg-red-500/10 border-red-500/30",
            )}
          >
            {code} {codeText ?? ""}
          </span>
        ) : undefined
      }
    >
      {prompt && (
        <div className="px-3 pb-2 -mt-1">
          <div className="rounded-md bg-zinc-950/60 border border-zinc-800/60 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">
              prompt
            </div>
            <div className="text-[12px] text-zinc-200">{prompt}</div>
          </div>
        </div>
      )}
      {bytes != null && (
        <div className="px-3 pb-2 text-[11px] text-zinc-500 font-mono">
          {bytes.toLocaleString()} bytes
        </div>
      )}
      {result && (
        <Collapsible
          label="Result"
          rightSlot={<CopyButton value={result} label="Copy" />}
        >
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap">
            {result}
          </pre>
        </Collapsible>
      )}
      <RawEventViewer event={event} />
    </CardShell>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-sky-300"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
