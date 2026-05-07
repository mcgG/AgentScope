import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { Collapsible } from "../ui/Collapsible.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

type SearchResult = { title: string; url: string };

function flattenResults(output: unknown): SearchResult[] {
  let parsed: unknown = output;
  if (typeof output === "string") {
    try {
      parsed = JSON.parse(output);
    } catch {
      return [];
    }
  }
  const obj = asObj(parsed);
  const groups = asArr(obj.results);
  const out: SearchResult[] = [];
  for (const g of groups) {
    const inner = asArr(asObj(g).content);
    for (const item of inner) {
      const it = asObj(item);
      const title = asStr(it.title);
      const url = asStr(it.url);
      if (title && url) out.push({ title, url });
    }
  }
  return out;
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function WebSearchCard({ event }: { event: AgentEvent }) {
  const input = asObj(event.input);
  const query = asStr(input.query);
  const results = flattenResults(event.output);

  return (
    <CardShell
      event={event}
      icon={<SearchIcon />}
      title="Web search"
      subtitle={
        query ? (
          <span className="text-zinc-200">"{query}"</span>
        ) : undefined
      }
      headerRight={
        results.length > 0 ? (
          <span className="text-[10px] font-mono text-zinc-500 shrink-0">
            {results.length} result{results.length === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
    >
      {results.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {results.slice(0, 8).map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-baseline gap-2 group rounded-md px-2 py-1.5 hover:bg-zinc-800/40 -mx-2 transition-colors"
            >
              <span className="text-[10px] font-mono text-zinc-500 w-4 text-right shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-blue-300 group-hover:text-blue-200 group-hover:underline truncate">
                  {r.title}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 truncate">
                  {domain(r.url)}
                </div>
              </div>
            </a>
          ))}
          {results.length > 8 && (
            <div className="text-[11px] text-zinc-500 pl-7">
              + {results.length - 8} more
            </div>
          )}
        </div>
      )}
      {results.length === 0 && event.output != null && (
        <Collapsible label="Raw output">
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap">
            {typeof event.output === "string"
              ? event.output
              : JSON.stringify(event.output, null, 2)}
          </pre>
        </Collapsible>
      )}
      <RawEventViewer event={event} />
    </CardShell>
  );
}

function SearchIcon() {
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
      className="text-cyan-300"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
