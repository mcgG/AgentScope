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

const SUBAGENT_COLORS: Record<string, string> = {
  Explore: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  Plan: "text-violet-300 bg-violet-500/10 border-violet-500/30",
  "general-purpose":
    "text-amber-300 bg-amber-500/10 border-amber-500/30",
  "claude-code-guide":
    "text-pink-300 bg-pink-500/10 border-pink-500/30",
};

function colorFor(subagent: string): string {
  return (
    SUBAGENT_COLORS[subagent] ??
    "text-purple-300 bg-purple-500/10 border-purple-500/30"
  );
}

function parseAgentOutput(out: unknown): { status?: string; result?: string } {
  let parsed: unknown = out;
  if (typeof out === "string") {
    try {
      parsed = JSON.parse(out);
    } catch {
      return { result: out };
    }
  }
  const obj = asObj(parsed);
  const status = asStr(obj.status);
  const result =
    asStr(obj.result) ||
    asStr(obj.last_assistant_message) ||
    asStr(obj.output);
  return {
    status: status || undefined,
    result: result || undefined,
  };
}

export function AgentCard({ event }: { event: AgentEvent }) {
  const input = asObj(event.input);
  const output = asObj(event.output);
  const isCodexSpawn = event.toolName === "spawn_agent";
  const isCodexWait = event.toolName === "wait_agent";
  const subagent =
    asStr(output.new_agent_role) ||
    asStr(input.agent_type) ||
    asStr(input.subagent_type) ||
    "general-purpose";
  const nickname =
    asStr(output.new_agent_nickname) ||
    asStr(output.nickname) ||
    asStr(output.agent_nickname);
  const description =
    asStr(input.description) ||
    asStr(output.prompt).split("\n").find(Boolean)?.slice(0, 120) ||
    asStr(input.message).split("\n").find(Boolean)?.slice(0, 120) ||
    "";
  const prompt = asStr(input.prompt) || asStr(input.message) || asStr(output.prompt);
  const { result } = parseAgentOutput(event.output);
  const waitResults = isCodexWait ? readWaitResults(event.output) : [];

  return (
    <CardShell
      event={event}
      icon={<RobotIcon />}
      title={
        <span className="flex items-center gap-2">
          <span>{isCodexWait ? "Subagent join" : "Subagent"}</span>
          <span
            className={`text-[10px] font-mono uppercase tracking-wide rounded px-1.5 py-px border ${colorFor(subagent)}`}
          >
            {subagent}
          </span>
          {nickname && (
            <span className="text-[11px] text-zinc-400">{nickname}</span>
          )}
        </span>
      }
      subtitle={
        description ? (
          <span className="text-zinc-200">{description}</span>
        ) : undefined
      }
    >
      {prompt && (
        <Collapsible
          label="Prompt"
          count={`${prompt.split("\n").length} lines`}
          rightSlot={<CopyButton value={prompt} label="Copy" />}
        >
          <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap">
            {prompt}
          </pre>
        </Collapsible>
      )}
      {result && (
        <Collapsible
          label="Result"
          defaultOpen
          rightSlot={<CopyButton value={result} label="Copy" />}
        >
          <pre className="text-[12px] text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap leading-relaxed">
            {result}
          </pre>
        </Collapsible>
      )}
      {waitResults.length > 0 && (
        <div className="grid gap-2">
          {waitResults.map((item) => (
            <div
              key={item.threadId}
              className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-zinc-200">
                  {item.nickname ?? item.threadId.slice(0, 8)}
                </span>
                <span className="rounded border border-zinc-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-zinc-400">
                  {item.role ?? "subagent"}
                </span>
                <span className="ml-auto text-[10px] font-mono text-zinc-500">
                  {item.status}
                </span>
              </div>
              {item.result && (
                <div className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-zinc-400">
                  {item.result}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <RawEventViewer event={event} />
    </CardShell>
  );
}

function readWaitResults(out: unknown): Array<{
  threadId: string;
  nickname?: string;
  role?: string;
  status: string;
  result?: string;
}> {
  const obj = asObj(out);
  const statuses = Array.isArray(obj.agent_statuses)
    ? obj.agent_statuses
    : Array.isArray(obj.statuses)
      ? obj.statuses
      : [];
  return statuses
    .map((status) => {
      const s = asObj(status);
      const nested = asObj(s.status);
      const completed = asStr(nested.completed);
      const failed = asStr(nested.failed) || asStr(nested.error);
      const flatStatus = asStr(s.status);
      const flatResult = asStr(s.result);
      const threadId =
        asStr(s.thread_id) || asStr(s.threadId) || asStr(s.agent_path);
      if (!threadId) return undefined;
      return {
        threadId,
        nickname: asStr(s.agent_nickname) || asStr(s.nickname) || undefined,
        role: asStr(s.agent_role) || asStr(s.role) || undefined,
        status:
          failed || flatStatus === "failed"
            ? "failed"
            : completed || flatStatus === "completed"
              ? "completed"
              : "running",
        result: completed || failed || flatResult || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function RobotIcon() {
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
      className="text-purple-300"
    >
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M12 8V4" />
      <circle cx="12" cy="3" r="1" />
      <circle cx="9" cy="13" r="1" fill="currentColor" />
      <circle cx="15" cy="13" r="1" fill="currentColor" />
      <path d="M9 17h6" />
    </svg>
  );
}
