import { useMemo, useState } from "react";
import type { AgentEvent } from "@shared/events.ts";
import { Collapsible } from "./ui/Collapsible.tsx";
import { CopyButton } from "./ui/CopyButton.tsx";
import { StatusBadge } from "./ui/StatusBadge.tsx";
import { classNames, formatDuration, formatTime } from "../utils.ts";

type WorkerStatus = "running" | "success" | "failed";

type WorkerNode = {
  id: string;
  threadId?: string;
  nickname?: string;
  role: string;
  description: string;
  prompt: string;
  startedAt: string;
  durationMs?: number;
  status: WorkerStatus;
  result?: string;
  progress: ProgressItem[];
};

type WaitResult = {
  threadId: string;
  nickname?: string;
  role?: string;
  status: "completed" | "failed" | "running";
  result?: string;
};

type ProgressItem = {
  timestamp: string;
  title: string;
  summary?: string;
  detail?: string;
  status?: string;
};

const ROLE_STYLES: Record<string, { dot: string; pill: string }> = {
  explorer: {
    dot: "bg-emerald-400",
    pill: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  },
  worker: {
    dot: "bg-sky-400",
    pill: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  },
  "general-purpose": {
    dot: "bg-amber-400",
    pill: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  },
  "claude-code-guide": {
    dot: "bg-pink-400",
    pill: "text-pink-300 bg-pink-500/10 border-pink-500/30",
  },
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function roleStyle(role: string) {
  return (
    ROLE_STYLES[role] ?? {
      dot: "bg-violet-400",
      pill: "text-violet-300 bg-violet-500/10 border-violet-500/30",
    }
  );
}

function readWaitResults(event: AgentEvent): WaitResult[] {
  const out = asObj(event.output);
  const statuses = Array.isArray(out.agent_statuses)
    ? out.agent_statuses
    : Array.isArray(out.statuses)
      ? out.statuses
      : [];

  return statuses.flatMap((item): WaitResult[] => {
    const obj = asObj(item);
    const nested = asObj(obj.status);
    const completed = asStr(nested.completed);
    const failed = asStr(nested.failed) || asStr(nested.error);
    const flatStatus = asStr(obj.status);
    const flatResult = asStr(obj.result);
    const threadId =
      asStr(obj.thread_id) || asStr(obj.threadId) || asStr(obj.agent_path);
    if (!threadId) return [];
    const status: WaitResult["status"] = failed || flatStatus === "failed"
      ? "failed"
      : completed || flatStatus === "completed"
        ? "completed"
        : "running";
    const result: WaitResult = {
      threadId,
      status,
    };
    const nickname = asStr(obj.agent_nickname) || asStr(obj.nickname);
    const role = asStr(obj.agent_role) || asStr(obj.role);
    if (nickname) result.nickname = nickname;
    if (role) result.role = role;
    if (completed || failed || flatResult) {
      result.result = completed || failed || flatResult;
    }
    return [result];
  });
}

function readCodexWorker(event: AgentEvent): WorkerNode | undefined {
  if (event.toolName !== "spawn_agent") return undefined;
  const input = asObj(event.input);
  const output = asObj(event.output);
  const threadId =
    asStr(output.new_thread_id) || asStr(output.agent_id) || undefined;
  const role =
    asStr(output.new_agent_role) ||
    asStr(input.agent_type) ||
    "subagent";
  const nickname =
    asStr(output.new_agent_nickname) || asStr(output.nickname) || undefined;
  const prompt = asStr(output.prompt) || asStr(input.message);
  const description = asStr(input.description) || firstLine(prompt);

  return {
    id: event.id,
    threadId,
    nickname,
    role,
    description,
    prompt,
    startedAt: event.timestamp,
    durationMs: event.durationMs,
    status: "running",
    progress: readProgress(output),
  };
}

function readClaudeWorker(event: AgentEvent): WorkerNode | undefined {
  if (event.toolName !== "Agent" && event.toolName !== "Task") return undefined;
  const input = asObj(event.input);
  const output = asObj(event.output);
  const role = asStr(input.subagent_type) || asStr(output.agentType) || "subagent";
  const description = asStr(input.description);
  const prompt = asStr(input.prompt);
  const parsed = parseAgentOutput(event.output);
  const finished =
    event.eventType === "tool_completed" || event.eventType === "tool_failed";

  return {
    id: event.id,
    threadId: asStr(output.agentId) || event.toolUseId,
    role,
    description: description || firstLine(prompt),
    prompt,
    startedAt: event.timestamp,
    durationMs: event.durationMs,
    status: !finished ? "running" : event.status === "failed" ? "failed" : "success",
    result: parsed.result,
    progress: [],
  };
}

function readProgress(output: Record<string, unknown>): ProgressItem[] {
  if (!Array.isArray(output.progress)) return [];
  return output.progress.flatMap((item): ProgressItem[] => {
    const obj = asObj(item);
    const timestamp = asStr(obj.timestamp);
    const title = asStr(obj.title);
    if (!timestamp || !title) return [];
    const progress: ProgressItem = { timestamp, title };
    const summary = asStr(obj.summary);
    const detail = asStr(obj.detail);
    const status = asStr(obj.status);
    if (summary) progress.summary = summary;
    if (detail) progress.detail = detail;
    if (status) progress.status = status;
    return [progress];
  });
}

function parseAgentOutput(out: unknown): { result?: string } {
  if (typeof out === "string") {
    try {
      return parseAgentOutput(JSON.parse(out));
    } catch {
      return { result: out };
    }
  }
  const obj = asObj(out);
  const content = Array.isArray(obj.content)
    ? obj.content
        .map((part) => asStr(asObj(part).text))
        .filter(Boolean)
        .join("\n\n")
    : "";
  return {
    result:
      content ||
      asStr(obj.result) ||
      asStr(obj.last_assistant_message) ||
      asStr(obj.output) ||
      undefined,
  };
}

function buildWorkers(events: AgentEvent[]): WorkerNode[] {
  const byId = new Map<string, WorkerNode>();
  const waitResults = new Map<string, WaitResult>();

  for (const event of [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const codexWorker = readCodexWorker(event);
    const claudeWorker = readClaudeWorker(event);
    const worker = codexWorker ?? claudeWorker;
    if (worker) {
      byId.set(worker.threadId ?? worker.id, worker);
      continue;
    }
    if (event.toolName === "wait_agent") {
      for (const result of readWaitResults(event)) {
        waitResults.set(result.threadId, result);
      }
    }
  }

  for (const [threadId, result] of waitResults) {
    const worker = byId.get(threadId);
    if (!worker) continue;
    worker.nickname = worker.nickname ?? result.nickname;
    worker.role = worker.role || result.role || "subagent";
    worker.status =
      result.status === "failed"
        ? "failed"
        : result.status === "completed"
          ? "success"
          : "running";
    worker.result = result.result ?? worker.result;
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );
}

function groupParallel(workers: WorkerNode[]): WorkerNode[][] {
  if (workers.length === 0) return [];
  const groups: WorkerNode[][] = [];
  let current: WorkerNode[] = [];
  let lastStart = 0;

  for (const worker of workers) {
    const start = new Date(worker.startedAt).getTime();
    if (current.length === 0 || start - lastStart < 10_000) {
      current.push(worker);
      lastStart = start;
    } else {
      groups.push(current);
      current = [worker];
      lastStart = start;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim())?.trim().slice(0, 140) ?? "";
}

export function WorkflowView({ events }: { events: AgentEvent[] }) {
  const workers = useMemo(() => buildWorkers(events), [events]);
  const groups = useMemo(() => groupParallel(workers), [workers]);
  const firstPrompt = events.find((e) => e.eventType === "user_prompt")?.prompt;
  const running = workers.filter((w) => w.status === "running").length;
  const failed = workers.filter((w) => w.status === "failed").length;
  const completed = workers.filter((w) => w.status === "success").length;

  if (workers.length === 0) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <div className="text-sm text-zinc-400">No subagents in this session</div>
          <div className="mt-2 text-xs leading-relaxed text-zinc-500">
            Workflow appears when AgentScope sees Claude Code Agent/Task calls
            or Codex spawn_agent transcript records.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <section className="grid gap-3 border-b border-zinc-800/80 pb-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border border-blue-500/40 bg-blue-500/15 text-blue-300">
              <OrchestratorIcon />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-blue-300">
                Orchestrator
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-zinc-200">
                {firstPrompt ?? "Main agent session"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <Metric label="workers" value={workers.length} />
            <Metric label="done" value={completed} tone="emerald" />
            <Metric label={failed ? "failed" : "running"} value={failed || running} tone={failed ? "red" : "blue"} />
          </div>
        </section>

        <div className="relative py-5">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500/40 via-zinc-700 to-zinc-800" />
          {groups.map((group, index) => (
            <WorkerGroup key={index} workers={group} />
          ))}
        </div>

        <ConvergenceNode running={running > 0} failed={failed > 0} />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: number;
  tone?: "zinc" | "emerald" | "blue" | "red";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "blue"
        ? "text-blue-300"
        : tone === "red"
          ? "text-red-300"
          : "text-zinc-200";
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-2">
      <div className={classNames("font-mono text-base", color)}>{value}</div>
      <div className="mt-0.5 uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

function WorkerGroup({ workers }: { workers: WorkerNode[] }) {
  return (
    <section className="relative py-3 pl-9">
      <div className="absolute left-4 top-6 h-px w-5 bg-zinc-700" />
      {workers.length > 1 && (
        <div className="mb-2 inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] uppercase tracking-wider text-amber-300">
          {workers.length} parallel workers
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {workers.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} />
        ))}
      </div>
    </section>
  );
}

function WorkerCard({ worker }: { worker: WorkerNode }) {
  const [open, setOpen] = useState(false);
  const style = roleStyle(worker.role);
  const displayName = worker.nickname ?? worker.description ?? worker.role;

  return (
    <article className="relative">
      <div
        className={classNames(
          "absolute -left-[34px] top-4 size-2.5 rounded-full ring-2 ring-zinc-950",
          style.dot,
          worker.status === "running" && "animate-pulse",
        )}
      />
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        className={classNames(
          "w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3.5 py-3 text-left transition-colors hover:border-zinc-700",
          worker.status === "failed" && "border-red-900/70 ring-1 ring-red-900/40",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={classNames(
              "rounded border px-1.5 py-px font-mono text-[10px] uppercase tracking-wide",
              style.pill,
            )}
          >
            {worker.role}
          </span>
          <StatusBadge status={worker.status} />
          {worker.durationMs != null && (
            <span className="font-mono text-[11px] text-zinc-500">
              {formatDuration(worker.durationMs)}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-zinc-600">
            {formatTime(worker.startedAt)}
          </span>
        </div>
        <div className="mt-2 text-[13px] font-medium text-zinc-100">
          {displayName}
        </div>
        {worker.nickname && worker.description && (
          <div className="mt-1 line-clamp-2 text-xs text-zinc-500">
            {worker.description}
          </div>
        )}
      </button>
      {open && (
        <div className="mt-1 overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/50">
          {worker.threadId && (
            <div className="border-b border-zinc-800 px-3 py-2 font-mono text-[11px] text-zinc-500">
              thread: {worker.threadId.slice(0, 8)}
            </div>
          )}
          {worker.prompt && (
            <Collapsible
              label="Assignment"
              defaultOpen
              count={`${worker.prompt.split("\n").length} lines`}
              rightSlot={<CopyButton value={worker.prompt} label="Copy" />}
            >
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-3 text-[12px] text-zinc-200">
                {worker.prompt}
              </pre>
            </Collapsible>
          )}
          {worker.progress.length > 0 && (
            <Collapsible
              label="Progress"
              defaultOpen
              count={`${worker.progress.length} events`}
            >
              <ProgressList items={worker.progress} />
            </Collapsible>
          )}
          {worker.result && (
            <Collapsible
              label="Result"
              defaultOpen
              rightSlot={<CopyButton value={worker.result} label="Copy" />}
            >
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-3 text-[12px] leading-relaxed text-zinc-200">
                {worker.result}
              </pre>
            </Collapsible>
          )}
        </div>
      )}
    </article>
  );
}

function ProgressList({ items }: { items: ProgressItem[] }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950">
      {items.map((item, index) => (
        <div
          key={`${item.timestamp}-${index}`}
          className="grid grid-cols-[76px_1fr] gap-3 border-b border-zinc-900 px-3 py-2 last:border-b-0"
        >
          <div className="pt-0.5 font-mono text-[10px] text-zinc-600">
            {formatTime(item.timestamp)}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[12px] font-medium text-zinc-300">
                {item.title}
              </span>
              {item.status && (
                <span className="truncate font-mono text-[10px] uppercase text-zinc-600">
                  {item.status}
                </span>
              )}
            </div>
            {item.summary && (
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                {item.summary}
              </div>
            )}
            {item.detail && item.detail !== item.summary && (
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-[11px] text-zinc-500 hover:text-zinc-300">
                  Details
                </summary>
                <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-black/30 p-2 text-[11px] leading-relaxed text-zinc-300">
                  {item.detail}
                </pre>
              </details>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConvergenceNode({
  running,
  failed,
}: {
  running: boolean;
  failed: boolean;
}) {
  const label = running
    ? "Awaiting worker results"
    : failed
      ? "Returned with failures"
      : "Joined back to orchestrator";
  const color = running
    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
    : failed
      ? "border-red-500/40 bg-red-500/15 text-red-300"
      : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";

  return (
    <div className="flex items-center gap-3 border-t border-zinc-800/80 pt-5">
      <div
        className={classNames(
          "flex size-9 shrink-0 items-center justify-center rounded-full border",
          color,
        )}
      >
        <ConvergeIcon />
      </div>
      <div className="text-sm text-zinc-300">{label}</div>
    </div>
  );
}

function OrchestratorIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </svg>
  );
}

function ConvergeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 5l7 7-7 7" />
      <path d="M19 5l-7 7 7 7" />
    </svg>
  );
}
