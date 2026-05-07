import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentEvent } from "@shared/events.ts";
import { Collapsible } from "./ui/Collapsible.tsx";
import { StatusBadge } from "./ui/StatusBadge.tsx";
import { CopyButton } from "./ui/CopyButton.tsx";
import { EventCard } from "./cards/EventCard.tsx";
import { classNames, formatDuration, formatTime } from "../utils.ts";

const AGENT_DISPATCH_TOOLS = new Set([
  "Agent",
  "Task",
  "spawn_agent",
  "wait_agent",
]);

type SubagentNode = {
  id: string;
  toolUseId?: string;
  agentId?: string;
  subagentType: string;
  description: string;
  prompt: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "running" | "success" | "failed";
  result?: string;
  internalEvents: AgentEvent[];
  trackIndex: number;
};

const SUBAGENT_PALETTE: Record<
  string,
  { dotClass: string; pillClass: string }
> = {
  Explore: {
    dotClass: "bg-emerald-400",
    pillClass: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  },
  Plan: {
    dotClass: "bg-violet-400",
    pillClass: "text-violet-300 bg-violet-500/10 border-violet-500/30",
  },
  "general-purpose": {
    dotClass: "bg-amber-400",
    pillClass: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  },
  "claude-code-guide": {
    dotClass: "bg-pink-400",
    pillClass: "text-pink-300 bg-pink-500/10 border-pink-500/30",
  },
};

function paletteFor(subagent: string) {
  return (
    SUBAGENT_PALETTE[subagent] ?? {
      dotClass: "bg-purple-400",
      pillClass: "text-purple-300 bg-purple-500/10 border-purple-500/30",
    }
  );
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function getAgentId(e: AgentEvent): string | undefined {
  if (e.agentId) return e.agentId;
  const raw = asObj(e.raw);
  return asStr(raw.agent_id) || asStr(raw.agentId) || undefined;
}

function buildSubagentNodes(events: AgentEvent[]): SubagentNode[] {
  const sorted = [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const agentById = new Map<string, AgentEvent>();
  const subagentStops: AgentEvent[] = [];

  for (const e of sorted) {
    if (e.toolName && AGENT_DISPATCH_TOOLS.has(e.toolName) && e.toolUseId) {
      agentById.set(e.toolUseId, e);
    } else if (e.hookEventName === "SubagentStop") {
      subagentStops.push(e);
    }
  }

  // Pair each SubagentStop with the matching Agent dispatch by completion
  // order. Merged Agent events keep their STARTED timestamp, so we sort by
  // their effective end time (started + durationMs) and walk the SubagentStop
  // queue in chronological order.
  const agentIdByToolUseId = new Map<string, string>();

  const completedAgentsInEndOrder = sorted
    .filter(
      (e) =>
        e.toolName &&
        AGENT_DISPATCH_TOOLS.has(e.toolName) &&
        (e.eventType === "tool_completed" || e.eventType === "tool_failed") &&
        e.toolUseId,
    )
    .map((e) => ({
      ev: e,
      endMs:
        new Date(e.timestamp).getTime() +
        (typeof e.durationMs === "number" ? e.durationMs : 0),
    }))
    .sort((a, b) => a.endMs - b.endMs);

  const stopsInOrder = [...subagentStops].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  for (
    let i = 0;
    i < stopsInOrder.length && i < completedAgentsInEndOrder.length;
    i++
  ) {
    const stop = stopsInOrder[i];
    const completed = completedAgentsInEndOrder[i]?.ev;
    if (!stop || !completed?.toolUseId) continue;
    const stopAgentId = getAgentId(stop);
    if (stopAgentId) {
      agentIdByToolUseId.set(completed.toolUseId, stopAgentId);
    }
  }

  // Map: agent_id → list of internal events emitted while that subagent ran.
  const internalByAgentId = new Map<string, AgentEvent[]>();
  for (const e of sorted) {
    const aid = getAgentId(e);
    if (!aid) continue;
    if (e.hookEventName === "SubagentStop") continue;
    if (e.eventType !== "tool_completed" && e.eventType !== "tool_failed") {
      continue;
    }
    const list = internalByAgentId.get(aid) ?? [];
    list.push(e);
    internalByAgentId.set(aid, list);
  }

  const stopByTime = [...subagentStops];
  const nodes: SubagentNode[] = [];
  for (const [toolUseId, ev] of agentById) {
    const input = asObj(ev.input);
    const output = asObj(ev.output);
    const subagentType =
      asStr(input.subagent_type) ||
      asStr(input.agent_type) ||
      asStr(output.new_agent_role) ||
      "general-purpose";
    const description =
      asStr(input.description) ||
      asStr(input.message).split("\n").find(Boolean)?.slice(0, 120) ||
      asStr(input.prompt).split("\n").find(Boolean)?.slice(0, 120) ||
      "";
    const prompt =
      asStr(input.prompt) || asStr(input.message) || asStr(output.prompt);

    const isFinished =
      ev.eventType === "tool_completed" || ev.eventType === "tool_failed";
    const status: SubagentNode["status"] = !isFinished
      ? "running"
      : ev.status === "failed"
        ? "failed"
        : "success";

    const startedAt = ev.timestamp;
    const durationMs = ev.durationMs;
    const endedAt =
      isFinished && durationMs != null
        ? new Date(new Date(startedAt).getTime() + durationMs).toISOString()
        : undefined;

    const agentId = agentIdByToolUseId.get(toolUseId);

    let result: string | undefined;
    if (isFinished) {
      if (agentId) {
        const stop = stopByTime.find((s) => s.agentId === agentId);
        if (stop) result = asStr(stop.summary) || asStr(stop.prompt);
      }
      if (!result) {
        result = asStr(output.result) || asStr(output.last_assistant_message);
      }
    }

    const internalEvents = agentId
      ? (internalByAgentId.get(agentId) ?? []).slice().sort((a, b) =>
          a.timestamp.localeCompare(b.timestamp),
        )
      : [];

    nodes.push({
      id: ev.id,
      toolUseId,
      agentId,
      subagentType,
      description,
      prompt,
      startedAt,
      endedAt,
      durationMs,
      status,
      result,
      internalEvents,
      trackIndex: 0,
    });
  }

  nodes.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  assignTracks(nodes);
  return nodes;
}

function assignTracks(nodes: SubagentNode[]): void {
  const trackEnds: number[] = [];
  for (const node of nodes) {
    const start = new Date(node.startedAt).getTime();
    const end = node.endedAt
      ? new Date(node.endedAt).getTime()
      : Number.POSITIVE_INFINITY;
    let placed = false;
    for (let i = 0; i < trackEnds.length; i++) {
      if ((trackEnds[i] ?? 0) <= start) {
        node.trackIndex = i;
        trackEnds[i] = end;
        placed = true;
        break;
      }
    }
    if (!placed) {
      node.trackIndex = trackEnds.length;
      trackEnds.push(end);
    }
  }
}

function groupByTime(nodes: SubagentNode[]): SubagentNode[][] {
  if (nodes.length === 0) return [];
  const groups: SubagentNode[][] = [];
  let current: SubagentNode[] = [];
  let currentEnd = 0;

  for (const n of nodes) {
    const start = new Date(n.startedAt).getTime();
    if (current.length === 0 || start < currentEnd) {
      current.push(n);
      const end = n.endedAt
        ? new Date(n.endedAt).getTime()
        : Number.POSITIVE_INFINITY;
      currentEnd = Math.max(currentEnd, end);
    } else {
      groups.push(current);
      current = [n];
      currentEnd = n.endedAt
        ? new Date(n.endedAt).getTime()
        : Number.POSITIVE_INFINITY;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export function GraphView({ events }: { events: AgentEvent[] }) {
  const nodes = useMemo(() => buildSubagentNodes(events), [events]);
  const groups = useMemo(() => groupByTime(nodes), [nodes]);

  const userPrompts = useMemo(
    () =>
      events
        .filter((e) => e.eventType === "user_prompt")
        .map((e) => e.prompt ?? e.summary ?? "")
        .filter(Boolean),
    [events],
  );

  const totalSubagents = nodes.length;
  const successCount = nodes.filter((n) => n.status === "success").length;
  const runningCount = nodes.filter((n) => n.status === "running").length;
  const failedCount = nodes.filter((n) => n.status === "failed").length;

  if (nodes.length === 0) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <div className="text-zinc-400 text-sm mb-2">
            No subagents in this session
          </div>
          <div className="text-zinc-500 text-xs">
            The Graph view appears when the main agent dispatches{" "}
            <span className="font-mono text-zinc-300">Task</span> /{" "}
            <span className="font-mono text-zinc-300">Agent</span> tool calls
            to subagents.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <OrchestratorNode
          firstPrompt={userPrompts[0]}
          totalSubagents={totalSubagents}
          successCount={successCount}
          runningCount={runningCount}
          failedCount={failedCount}
        />

        <Spine />
        {groups.map((group, gi) => (
          <ForkJoinGroup key={gi} group={group} groupIndex={gi} />
        ))}
        <Spine />

        <ConvergenceNode failed={failedCount > 0} running={runningCount > 0} />
      </div>
    </div>
  );
}

function Spine() {
  return <div className="mx-auto h-6 w-px bg-zinc-700/70" />;
}

function OrchestratorNode({
  firstPrompt,
  totalSubagents,
  successCount,
  runningCount,
  failedCount,
}: {
  firstPrompt: string | undefined;
  totalSubagents: number;
  successCount: number;
  runningCount: number;
  failedCount: number;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-b from-blue-500/10 to-blue-500/5 px-4 py-3 shadow-[0_0_40px_-15px_rgba(59,130,246,0.5)]">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-500/20 border border-blue-500/50">
            <OrchestratorIcon />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] uppercase tracking-widest text-blue-300/90 font-semibold">
                Orchestrator
              </span>
              <span className="text-[11px] font-mono text-zinc-500 ml-auto">
                {totalSubagents} subagent{totalSubagents === 1 ? "" : "s"}
                {successCount > 0 && (
                  <span className="ml-2 text-emerald-400">
                    · {successCount} ✓
                  </span>
                )}
                {runningCount > 0 && (
                  <span className="ml-2 text-blue-400">
                    · {runningCount} running
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="ml-2 text-red-400">· {failedCount} ✗</span>
                )}
              </span>
            </div>
            {firstPrompt && (
              <div className="text-[13px] text-zinc-200 line-clamp-2 leading-snug">
                {firstPrompt}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConvergenceNode({
  failed,
  running,
}: {
  failed: boolean;
  running: boolean;
}) {
  const label = running
    ? "Awaiting subagents"
    : failed
      ? "Returned with failures"
      : "Joined back to orchestrator";
  const colorClass = running
    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
    : failed
      ? "border-red-500/40 bg-red-500/15 text-red-300"
      : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  return (
    <div className="mx-auto flex flex-col items-center gap-2">
      <div
        className={classNames(
          "flex size-8 shrink-0 items-center justify-center rounded-full border",
          colorClass,
        )}
      >
        <ConvergeIcon />
      </div>
      <div className="text-[11px] text-zinc-400">{label}</div>
    </div>
  );
}

type Branch = {
  d: string;
  status: SubagentNode["status"];
};

function ForkJoinGroup({
  group,
  groupIndex,
}: {
  group: SubagentNode[];
  groupIndex: number;
}) {
  const isParallel = group.length > 1;
  const containerRef = useRef<HTMLDivElement>(null);
  const forkRef = useRef<HTMLDivElement>(null);
  const joinRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, group.length);
  }, [group.length]);

  useLayoutEffect(() => {
    if (!containerRef.current || !forkRef.current || !joinRef.current) return;

    const recompute = () => {
      const cont = containerRef.current!.getBoundingClientRect();
      const fork = forkRef.current!.getBoundingClientRect();
      const join = joinRef.current!.getBoundingClientRect();
      setSize({ w: cont.width, h: cont.height });
      const fx = fork.left + fork.width / 2 - cont.left;
      const fy = fork.bottom - cont.top;
      const jx = join.left + join.width / 2 - cont.left;
      const jy = join.top - cont.top;
      const next: Branch[] = [];
      for (let i = 0; i < group.length; i++) {
        const card = cardRefs.current[i];
        const node = group[i];
        if (!card || !node) continue;
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 - cont.left;
        const top = rect.top - cont.top;
        const bottom = rect.bottom - cont.top;
        const downMid = (fy + top) / 2;
        const upMid = (bottom + jy) / 2;
        next.push({
          d: `M ${fx} ${fy} C ${fx} ${downMid}, ${cx} ${downMid}, ${cx} ${top}`,
          status: node.status,
        });
        next.push({
          d: `M ${cx} ${bottom} C ${cx} ${upMid}, ${jx} ${upMid}, ${jx} ${jy}`,
          status: node.status,
        });
      }
      setBranches(next);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(containerRef.current);
    for (const el of cardRefs.current) if (el) ro.observe(el);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [group]);

  const cols = isParallel ? Math.min(group.length, 2) : 1;

  return (
    <div ref={containerRef} className="relative mx-auto max-w-5xl">
      {isParallel && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-2 z-20">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-px backdrop-blur-sm">
            <ParallelIcon />
            {group.length} parallel
          </span>
        </div>
      )}

      <div ref={forkRef} className="mx-auto flex justify-center pt-2">
        <ForkDot />
      </div>

      <svg
        className="absolute inset-0 pointer-events-none"
        width={size.w || "100%"}
        height={size.h || "100%"}
        viewBox={size.w && size.h ? `0 0 ${size.w} ${size.h}` : undefined}
      >
        {branches.map((b, i) => (
          <BranchPath key={i} d={b.d} status={b.status} />
        ))}
      </svg>

      <div
        className={classNames(
          "grid gap-x-4 gap-y-3 mt-6 mb-6 px-2",
          cols === 1 ? "grid-cols-1 max-w-xl mx-auto" : "grid-cols-2",
        )}
      >
        {group.map((node, i) => (
          <div
            key={node.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="animate-spawn-in"
            style={{
              animationDelay: `${groupIndex * 80 + i * 60}ms`,
            }}
          >
            <SubagentCard node={node} />
          </div>
        ))}
      </div>

      <div ref={joinRef} className="mx-auto flex justify-center">
        <JoinDot />
      </div>
    </div>
  );
}

function ForkDot() {
  return (
    <span className="size-3 rounded-full bg-blue-500 ring-4 ring-blue-500/10 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
  );
}

function JoinDot() {
  return (
    <span className="size-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
  );
}

function BranchPath({
  d,
  status,
}: {
  d: string;
  status: SubagentNode["status"];
}) {
  const stroke =
    status === "running"
      ? "rgba(96,165,250,0.85)"
      : status === "failed"
        ? "rgba(248,113,113,0.7)"
        : "rgba(82,82,91,0.7)";
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        className="animate-stroke-draw"
      />
      {status === "running" && (
        <path
          d={d}
          fill="none"
          stroke="rgba(147,197,253,0.9)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="6 12"
          className="animate-stroke-flow"
        />
      )}
    </>
  );
}

function SubagentCard({ node }: { node: SubagentNode }) {
  const [expanded, setExpanded] = useState(false);
  const palette = paletteFor(node.subagentType);

  return (
    <div className="relative">
      <span
        aria-hidden
        className={classNames(
          "absolute -left-1 -top-1 size-3 rounded-full ring-2 ring-zinc-950 z-10",
          palette.dotClass,
          node.status === "running" && "animate-pulse",
        )}
      />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={classNames(
          "w-full text-left rounded-lg border bg-zinc-900/60 backdrop-blur-[1px] px-3.5 py-2.5 transition-colors",
          "border-zinc-800 hover:border-zinc-700",
          node.status === "running" &&
            "border-blue-500/40 shadow-[0_0_25px_-10px_rgba(59,130,246,0.5)]",
          node.status === "failed" &&
            "border-red-900/60 ring-1 ring-red-900/40",
          node.status === "success" && "border-zinc-800",
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={classNames(
              "text-[10px] font-mono uppercase tracking-wide rounded px-1.5 py-px border",
              palette.pillClass,
            )}
          >
            {node.subagentType}
          </span>
          <StatusBadge status={node.status} />
          {node.durationMs != null && (
            <span className="text-[11px] font-mono text-zinc-500">
              {formatDuration(node.durationMs)}
            </span>
          )}
          <span className="text-[10px] font-mono text-zinc-600 ml-auto">
            {formatTime(node.startedAt)}
          </span>
        </div>
        {node.description && (
          <div className="mt-1.5 text-[13px] text-zinc-200">
            {node.description}
          </div>
        )}
        <div className="mt-1 text-[11px] text-zinc-500">
          {expanded ? "click to collapse" : "click to expand"}
        </div>
      </button>
      {expanded && (
        <div className="mt-1 ml-0 rounded-lg border border-zinc-800/70 bg-zinc-950/40 overflow-hidden">
          {node.prompt && (
            <Collapsible
              label="Prompt"
              count={`${node.prompt.split("\n").length} lines`}
              rightSlot={<CopyButton value={node.prompt} label="Copy" />}
            >
              <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap">
                {node.prompt}
              </pre>
            </Collapsible>
          )}
          {node.internalEvents.length > 0 && (
            <Collapsible
              label="Subagent's tool calls"
              defaultOpen
              count={node.internalEvents.length}
            >
              <div className="flex flex-col gap-2">
                {node.internalEvents.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </Collapsible>
          )}
          {node.internalEvents.length === 0 && node.status !== "running" && (
            <div className="px-3 py-2 text-[11px] text-zinc-500 italic border-t border-zinc-800/70">
              No internal tool calls captured (subagent replied directly).
            </div>
          )}
          {node.result && (
            <Collapsible
              label="Result"
              defaultOpen
              rightSlot={<CopyButton value={node.result} label="Copy" />}
            >
              <pre className="text-[12px] text-zinc-200 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap leading-relaxed">
                {node.result}
              </pre>
            </Collapsible>
          )}
          {!node.result && node.status === "running" && (
            <div className="px-3 py-3 text-[12px] text-blue-300 italic">
              Subagent is still working…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrchestratorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-300"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M5 5l2 2" />
      <path d="M17 17l2 2" />
      <path d="M5 19l2-2" />
      <path d="M17 7l2-2" />
    </svg>
  );
}

function ConvergeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 5l7 7-7 7" />
      <path d="M19 5l-7 7 7 7" />
    </svg>
  );
}

function ParallelIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      <path d="M8 4v16" />
      <path d="M16 4v16" />
    </svg>
  );
}
