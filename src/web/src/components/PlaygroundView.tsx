import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, AgentSession } from "@shared/events.ts";
import { classNames } from "../utils.ts";
import { OfficeScene } from "./scenes/OfficeScene.tsx";
import { RpgScene } from "./scenes/RpgScene.tsx";
import { AquariumScene } from "./scenes/AquariumScene.tsx";

type Scenario = "office" | "rpg" | "aquarium";

const SCENARIOS: Array<{
  key: Scenario;
  label: string;
  emoji: string;
  status: "ready" | "coming-soon";
}> = [
  { key: "office", label: "The Office", emoji: "🏢", status: "ready" },
  { key: "rpg", label: "RPG Party", emoji: "⚔️", status: "ready" },
  { key: "aquarium", label: "Aquarium", emoji: "🐠", status: "ready" },
];

export type TodoItem = {
  status: "completed" | "in_progress" | "pending" | string;
  label: string;
};

export type TodoProgress = {
  total: number;
  completed: number;
  inProgress: number;
  active?: string;
  items?: TodoItem[];
};

export type AgentActor = {
  id: string;
  isOrchestrator: boolean;
  agentId?: string;
  subagentType?: string;
  description?: string;
  hat: string;
  nickname: string;
  color: string;
  status: "idle" | "working" | "done" | "failed" | "abandoned";
  spawnedAt: number;
  lastActivity?: AgentEvent;
  lastActivityAt?: number;
  toolCount: number;
  todos?: TodoProgress;
};

const HATS = [
  "🎩",
  "🤠",
  "👒",
  "🧢",
  "👑",
  "🪖",
  "🎓",
  "⛑️",
  "🎀",
  "🌟",
];
const NICKNAMES = [
  "Athena",
  "Bolt",
  "Cipher",
  "Dash",
  "Echo",
  "Flux",
  "Glitch",
  "Halo",
  "Iris",
  "Jet",
  "Kilo",
  "Lyra",
  "Mango",
  "Nova",
  "Orbit",
  "Pixel",
  "Quill",
  "Rune",
  "Sable",
  "Tango",
  "Umbra",
  "Vega",
  "Wisp",
  "Xeno",
  "Yarn",
  "Zest",
];
const COLORS = [
  "from-rose-500/40 to-rose-600/20 border-rose-400/40",
  "from-amber-500/40 to-amber-600/20 border-amber-400/40",
  "from-emerald-500/40 to-emerald-600/20 border-emerald-400/40",
  "from-cyan-500/40 to-cyan-600/20 border-cyan-400/40",
  "from-violet-500/40 to-violet-600/20 border-violet-400/40",
  "from-fuchsia-500/40 to-fuchsia-600/20 border-fuchsia-400/40",
  "from-lime-500/40 to-lime-600/20 border-lime-400/40",
  "from-sky-500/40 to-sky-600/20 border-sky-400/40",
];

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % arr.length;
  return arr[idx]!;
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

function getAgentType(e: AgentEvent): string | undefined {
  if (e.agentType) return e.agentType;
  const raw = asObj(e.raw);
  return asStr(raw.agent_type) || asStr(raw.agentType) || undefined;
}

function parseTodoProgress(e: AgentEvent): TodoProgress | undefined {
  const input = asObj(e.input);
  const todos = Array.isArray(input.todos) ? (input.todos as unknown[]) : [];
  if (todos.length === 0) return undefined;
  let completed = 0;
  let inProgress = 0;
  let active: string | undefined;
  const items: TodoItem[] = [];
  for (const t of todos) {
    const o = asObj(t);
    const status = asStr(o.status) || "pending";
    const content = asStr(o.content);
    const activeForm = asStr(o.activeForm);
    const label = status === "in_progress" && activeForm ? activeForm : content;
    if (label) items.push({ status, label });
    if (status === "completed") completed++;
    else if (status === "in_progress") {
      inProgress++;
      if (!active) active = activeForm || content;
    }
  }
  return { total: todos.length, completed, inProgress, active, items };
}

const AGENT_DISPATCH = new Set(["Agent", "Task", "spawn_agent", "wait_agent"]);

function buildActors(
  events: AgentEvent[],
  sessionEnded: boolean,
): AgentActor[] {
  const sorted = [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  const actors: AgentActor[] = [];

  // Orchestrator actor — always present.
  const orchestrator: AgentActor = {
    id: "__orchestrator__",
    isOrchestrator: true,
    hat: "🎩",
    nickname: "Lead",
    color: "from-blue-500/40 to-blue-600/20 border-blue-400/40",
    status: "idle",
    spawnedAt: sorted[0]
      ? new Date(sorted[0].timestamp).getTime()
      : Date.now(),
    toolCount: 0,
  };
  actors.push(orchestrator);

  const subagentByAid = new Map<string, AgentActor>();
  // Pair Agent dispatches with SubagentStops to learn each agent_id's parent
  // tool_use_id and (importantly) the description/subagent_type from the
  // parent Agent's tool_input.
  const agentDispatches: AgentEvent[] = [];
  const subagentStops: AgentEvent[] = [];

  for (const e of sorted) {
    if (
      e.toolName &&
      AGENT_DISPATCH.has(e.toolName) &&
      e.eventType === "tool_started"
    ) {
      agentDispatches.push(e);
    }
    if (
      e.toolName &&
      AGENT_DISPATCH.has(e.toolName) &&
      (e.eventType === "tool_completed" || e.eventType === "tool_failed")
    ) {
      // started → completed merging means the dispatch event may already be
      // here as tool_completed. include it too.
      const exists = agentDispatches.find((x) => x.toolUseId === e.toolUseId);
      if (!exists) agentDispatches.push(e);
    }
    if (e.hookEventName === "SubagentStop") subagentStops.push(e);
  }

  // For each event with an agentId, ensure an actor exists.
  for (const e of sorted) {
    const aid = getAgentId(e);
    if (!aid) continue;
    let actor = subagentByAid.get(aid);
    if (!actor) {
      actor = {
        id: aid,
        isOrchestrator: false,
        agentId: aid,
        subagentType: getAgentType(e),
        hat: pick(HATS, aid),
        nickname: pick(NICKNAMES, aid),
        color: pick(COLORS, aid),
        status: "working",
        spawnedAt: new Date(e.timestamp).getTime(),
        toolCount: 0,
      };
      subagentByAid.set(aid, actor);
      actors.push(actor);
    }
    if (
      e.eventType === "tool_completed" ||
      e.eventType === "tool_failed" ||
      e.eventType === "tool_started"
    ) {
      actor.toolCount += 1;
      actor.lastActivity = e;
      actor.lastActivityAt = new Date(e.timestamp).getTime();
    }
  }

  // Attach descriptions from parent Agent dispatches by index pairing with
  // SubagentStop events (chronological end order).
  const stopOrder = [...subagentStops].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const dispatchesByEnd = agentDispatches
    .map((d) => ({
      d,
      endMs:
        new Date(d.timestamp).getTime() +
        (typeof d.durationMs === "number" ? d.durationMs : 0),
    }))
    .sort((a, b) => a.endMs - b.endMs);

  for (let i = 0; i < stopOrder.length && i < dispatchesByEnd.length; i++) {
    const stop = stopOrder[i];
    const dispatch = dispatchesByEnd[i]?.d;
    if (!stop || !dispatch) continue;
    const aid = getAgentId(stop);
    if (!aid) continue;
    const actor = subagentByAid.get(aid);
    if (!actor) continue;
    const input = asObj(dispatch.input);
    actor.subagentType =
      asStr(input.subagent_type) ||
      asStr(input.agent_type) ||
      actor.subagentType ||
      "general-purpose";
    actor.description =
      asStr(input.description) ||
      asStr(input.message).split("\n").find(Boolean)?.slice(0, 80) ||
      asStr(input.prompt).split("\n").find(Boolean)?.slice(0, 80);
  }

  // Compute latest TodoWrite progress per actor (orchestrator vs subagent).
  for (const actor of actors) {
    const isOrc = actor.isOrchestrator;
    const targetAid = actor.agentId;
    let latestTodo: AgentEvent | undefined;
    for (const e of sorted) {
      if (e.toolName !== "TodoWrite") continue;
      const aid = getAgentId(e);
      if (isOrc && aid) continue;
      if (!isOrc && aid !== targetAid) continue;
      latestTodo = e;
    }
    if (latestTodo) {
      actor.todos = parseTodoProgress(latestTodo);
    }
  }

  // Mark statuses.
  const stoppedAgentIds = new Set(
    stopOrder.map((s) => getAgentId(s)).filter(Boolean) as string[],
  );
  for (const actor of actors) {
    if (actor.isOrchestrator) {
      actor.status = sessionEnded
        ? "idle"
        : stoppedAgentIds.size > 0
          ? "idle"
          : "working";
      actor.toolCount = sorted.filter(
        (e) =>
          !getAgentId(e) &&
          (e.eventType === "tool_completed" || e.eventType === "tool_failed"),
      ).length;
      const lastOrc = [...sorted].reverse().find(
        (e) =>
          !getAgentId(e) &&
          (e.eventType === "tool_completed" ||
            e.eventType === "tool_failed" ||
            e.eventType === "tool_started"),
      );
      actor.lastActivity = lastOrc;
      actor.lastActivityAt = lastOrc
        ? new Date(lastOrc.timestamp).getTime()
        : actor.spawnedAt;
    } else if (actor.agentId && stoppedAgentIds.has(actor.agentId)) {
      const last = actor.lastActivity;
      actor.status =
        last?.eventType === "tool_failed" || last?.status === "failed"
          ? "failed"
          : "done";
    } else {
      // No SubagentStop captured. Trust recent activity over the parent
      // session.status flag — a "completed" session can still receive new
      // subagent events from a fresh run that reuses the same session id.
      const recent =
        actor.lastActivityAt && Date.now() - actor.lastActivityAt < 60_000;
      if (recent) {
        actor.status = "working";
      } else if (sessionEnded) {
        actor.status = "abandoned";
      } else {
        actor.status = "working";
      }
    }
  }

  return actors;
}

export function PlaygroundView({
  events,
  session,
}: {
  events: AgentEvent[];
  session?: AgentSession;
}) {
  const [scenario, setScenario] = useState<Scenario>("office");
  const sessionEnded =
    session?.status === "completed" || session?.status === "failed";
  const actors = useMemo(
    () => buildActors(events, sessionEnded),
    [events, sessionEnded],
  );

  // Keep a per-actor "recent action" snapshot so we can flash on new events.
  const [actionPulse, setActionPulse] = useState<Record<string, number>>({});
  const lastSeenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newPulses: Record<string, number> = {};
    for (const a of actors) {
      const evId = a.lastActivity?.id;
      if (!evId) continue;
      const key = a.id + ":" + evId;
      if (!lastSeenIds.current.has(key)) {
        lastSeenIds.current.add(key);
        newPulses[a.id] = Date.now();
      }
    }
    if (Object.keys(newPulses).length > 0) {
      setActionPulse((p) => ({ ...p, ...newPulses }));
    }
  }, [actors]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800/60 px-4 py-2 text-[11px] text-zinc-500">
        <span className="uppercase tracking-widest text-zinc-400 font-semibold">
          Scenario
        </span>
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={s.status === "coming-soon"}
            onClick={() => setScenario(s.key)}
            className={classNames(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-[11px] transition-colors",
              s.status === "coming-soon"
                ? "border-zinc-800 text-zinc-600 cursor-not-allowed"
                : scenario === s.key
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                  : "border-zinc-700 hover:border-zinc-500 text-zinc-300",
            )}
          >
            <span>{s.emoji}</span>
            <span>{s.label}</span>
            {s.status === "coming-soon" && (
              <span className="ml-1 text-[9px] uppercase tracking-wider text-zinc-600">
                soon
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto font-mono text-zinc-600">
          {actors.length} character{actors.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {scenario === "office" && (
          <OfficeScene actors={actors} actionPulse={actionPulse} />
        )}
        {scenario === "rpg" && (
          <RpgScene
            actors={actors}
            actionPulse={actionPulse}
            session={session}
          />
        )}
        {scenario === "aquarium" && (
          <AquariumScene actors={actors} actionPulse={actionPulse} />
        )}
      </div>
    </div>
  );
}

function ComingSoon({ scenario }: { scenario: Scenario }) {
  const def = SCENARIOS.find((s) => s.key === scenario);
  return (
    <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
      <div className="text-center space-y-2">
        <div className="text-5xl">{def?.emoji}</div>
        <div className="text-zinc-300">{def?.label}</div>
        <div className="text-[12px] text-zinc-500">Coming soon — pick the Office for now.</div>
      </div>
    </div>
  );
}
