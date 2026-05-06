import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { Collapsible } from "../ui/Collapsible.tsx";
import { CopyButton } from "../ui/CopyButton.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";
import { ContentBlocks, isContentBlockArray } from "./ContentBlocks.tsx";

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

const ACTION_GLYPH: Record<string, string> = {
  screenshot: "📷",
  left_click: "👆",
  right_click: "☝",
  double_click: "👆👆",
  type: "⌨",
  key: "⌨",
  scroll: "↕",
  wait: "⏱",
  hover: "🎯",
  drag: "✥",
  navigate: "🌐",
};

function trimUrl(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function shortToolLabel(toolName: string): string {
  const tail = toolName.replace(/^mcp__[^_]+__/, "");
  return tail
    .replace(/^browser_/, "")
    .replace(/^tabs_/, "tabs.")
    .replace(/_/g, " ");
}

export function BrowserCard({ event }: { event: AgentEvent }) {
  const input = asObj(event.input);
  const tool = event.toolName ?? "browser";
  const isComputer = tool.endsWith("__computer");
  const isBatch = tool.endsWith("__browser_batch");
  const isNavigate = tool.endsWith("__navigate");
  const isFind = tool.endsWith("__find");
  const isFormInput = tool.endsWith("__form_input");
  const isJsExec = tool.endsWith("__javascript_tool");

  const url = asStr(input.url);
  const action = asStr(input.action);
  const text = asStr(input.text);
  const query = asStr(input.query);
  const tabId = input.tabId;

  const subtitle = (() => {
    if (isNavigate && url) return url;
    if (isComputer && action) {
      const coord = Array.isArray(input.coordinate)
        ? `(${(input.coordinate as number[]).join(", ")})`
        : "";
      return `${action} ${coord}${text ? ` · "${truncate(text, 40)}"` : ""}`;
    }
    if (isBatch) {
      const actions = asArr(input.actions);
      return `${actions.length} action${actions.length === 1 ? "" : "s"}`;
    }
    if (isFind && query) return `find: ${query}`;
    if (isFormInput) {
      const value = asStr(input.value);
      return value ? `set: ${truncate(value, 60)}` : undefined;
    }
    if (isJsExec) return "javascript_exec";
    return shortToolLabel(tool);
  })();

  return (
    <CardShell
      event={event}
      icon={<BrowserIcon />}
      title={
        <span className="flex items-center gap-2">
          <span>Chrome</span>
          <span className="text-[10px] font-mono uppercase tracking-wide text-blue-300/80 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-px">
            {shortToolLabel(tool)}
          </span>
        </span>
      }
      subtitle={
        subtitle ? (
          <span className="text-zinc-300 break-all">{subtitle}</span>
        ) : undefined
      }
      headerRight={
        typeof tabId === "number" ? (
          <span className="text-[10px] font-mono text-zinc-500 shrink-0">
            tab {String(tabId).slice(-4)}
          </span>
        ) : undefined
      }
    >
      {isBatch && <BatchActions actions={asArr(input.actions)} />}
      {isJsExec && asStr(input.text) && (
        <div className="px-3 pb-2">
          <pre className="text-[12px] font-mono text-amber-100 bg-amber-950/20 border border-amber-900/30 rounded p-2.5 max-h-56 overflow-auto whitespace-pre-wrap break-all">
            {asStr(input.text)}
          </pre>
        </div>
      )}

      <OutputSection event={event} />
      <RawEventViewer event={event} />
    </CardShell>
  );
}

function BatchActions({ actions }: { actions: unknown[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="px-3 pb-2">
      <ol className="space-y-1">
        {actions.map((a, i) => {
          const obj = asObj(a);
          const name = asStr(obj.name);
          const inp = asObj(obj.input);
          const action = asStr(inp.action);
          const url = asStr(inp.url);
          const text = asStr(inp.text);
          const glyph =
            ACTION_GLYPH[action] ??
            (name === "navigate" ? ACTION_GLYPH.navigate : "•");
          const label = (() => {
            if (name === "navigate") return `navigate → ${trimUrl(url)}`;
            if (name === "computer") {
              const coord = Array.isArray(inp.coordinate)
                ? ` (${(inp.coordinate as number[]).join(", ")})`
                : "";
              return `${action || "computer"}${coord}${text ? ` · "${truncate(text, 30)}"` : ""}`;
            }
            return name;
          })();
          return (
            <li
              key={i}
              className="flex items-baseline gap-2 text-[12px] font-mono"
            >
              <span className="text-zinc-600 w-5 text-right shrink-0">
                {i + 1}.
              </span>
              <span className="text-zinc-500 w-4 text-center shrink-0">
                {glyph}
              </span>
              <span className="text-zinc-200 break-all">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function OutputSection({ event }: { event: AgentEvent }) {
  if (event.output == null) return null;

  if (isContentBlockArray(event.output)) {
    const hasImage = (event.output as Array<{ type?: string }>).some(
      (b) => b?.type === "image",
    );
    return (
      <Collapsible
        label={hasImage ? "Result (with image)" : "Result"}
        defaultOpen
      >
        <ContentBlocks blocks={event.output} />
      </Collapsible>
    );
  }

  const json = JSON.stringify(event.output, null, 2);
  return (
    <Collapsible
      label="Result"
      rightSlot={<CopyButton value={json} label="Copy" />}
    >
      <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap">
        {json}
      </pre>
    </Collapsible>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function BrowserIcon() {
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
      className="text-blue-300"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
