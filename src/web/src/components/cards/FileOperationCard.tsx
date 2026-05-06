import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { Collapsible } from "../ui/Collapsible.tsx";
import { CopyButton } from "../ui/CopyButton.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";
import { shortenPath, classNames } from "../../utils.ts";

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

const ICONS: Record<string, string> = {
  Read: "📖",
  Write: "📝",
  Edit: "✎",
  MultiEdit: "✎+",
};

export function FileOperationCard({ event }: { event: AgentEvent }) {
  const input = asObj(event.input);
  const output = asObj(event.output);
  const filePath = asStr(input.file_path);
  const tool = event.toolName ?? "File";
  const icon = ICONS[tool] ?? "📄";

  const oldString = asStr(input.old_string);
  const newString = asStr(input.new_string);
  const structuredPatch = asArr(output.structuredPatch);
  const fileObj = asObj(output.file);
  const fileContent = asStr(fileObj.content);

  return (
    <CardShell
      event={event}
      icon={<span className="text-sm">{icon}</span>}
      title={tool}
      subtitle={
        filePath ? (
          <span
            className="font-mono text-xs text-zinc-300"
            title={filePath}
          >
            {shortenPath(filePath, 80)}
          </span>
        ) : undefined
      }
      headerRight={
        filePath ? (
          <CopyButton value={filePath} label="Copy path" />
        ) : undefined
      }
    >
      {structuredPatch.length > 0 && (
        <Collapsible label="Diff" defaultOpen>
          <DiffView patch={structuredPatch} />
        </Collapsible>
      )}
      {tool === "Edit" && structuredPatch.length === 0 && oldString && (
        <Collapsible label="Replacement">
          <div className="space-y-2">
            <div>
              <div className="text-[11px] text-red-300 font-medium mb-1">
                old
              </div>
              <pre className="text-[12px] font-mono text-red-200 bg-red-950/20 border border-red-900/40 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap">
                {oldString}
              </pre>
            </div>
            <div>
              <div className="text-[11px] text-emerald-300 font-medium mb-1">
                new
              </div>
              <pre className="text-[12px] font-mono text-emerald-200 bg-emerald-950/20 border border-emerald-900/40 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap">
                {newString}
              </pre>
            </div>
          </div>
        </Collapsible>
      )}
      {tool === "Read" && fileContent && (
        <Collapsible
          label="Content"
          count={`${fileContent.split("\n").length} lines`}
        >
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap">
            {fileContent}
          </pre>
        </Collapsible>
      )}
      {tool === "Write" && asStr(input.content) && (
        <Collapsible label="Content written">
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap">
            {asStr(input.content)}
          </pre>
        </Collapsible>
      )}
      <RawEventViewer event={event} />
    </CardShell>
  );
}

function DiffView({ patch }: { patch: unknown[] }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 overflow-auto max-h-96">
      {patch.map((hunk, i) => {
        if (!hunk || typeof hunk !== "object") return null;
        const h = hunk as Record<string, unknown>;
        const lines = Array.isArray(h.lines) ? (h.lines as unknown[]) : [];
        const oldStart = typeof h.oldStart === "number" ? h.oldStart : 0;
        const newStart = typeof h.newStart === "number" ? h.newStart : 0;
        const oldLines = typeof h.oldLines === "number" ? h.oldLines : 0;
        const newLines = typeof h.newLines === "number" ? h.newLines : 0;
        return (
          <div key={i}>
            <div className="px-3 py-1 text-[11px] font-mono text-zinc-500 bg-zinc-900/60 border-b border-zinc-800">
              @@ -{oldStart},{oldLines} +{newStart},{newLines} @@
            </div>
            {lines.map((line, j) => {
              const s = typeof line === "string" ? line : "";
              const kind =
                s.startsWith("+") && !s.startsWith("+++")
                  ? "add"
                  : s.startsWith("-") && !s.startsWith("---")
                    ? "del"
                    : "ctx";
              return (
                <pre
                  key={j}
                  className={classNames(
                    "px-3 py-0.5 text-[12px] font-mono whitespace-pre-wrap",
                    kind === "add" && "bg-emerald-950/30 text-emerald-200",
                    kind === "del" && "bg-red-950/30 text-red-200",
                    kind === "ctx" && "text-zinc-400",
                  )}
                >
                  {s}
                </pre>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
