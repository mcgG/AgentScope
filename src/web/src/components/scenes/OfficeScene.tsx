import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@shared/events.ts";
import type { AgentActor } from "../PlaygroundView.tsx";
import { classNames } from "../../utils.ts";

const TOOL_EMOJI: Record<string, string> = {
  Bash: "⚡",
  Read: "📖",
  Write: "✍️",
  Edit: "✏️",
  MultiEdit: "🪡",
  Grep: "🔍",
  Glob: "🗂️",
  TodoWrite: "✅",
  WebSearch: "🌐",
  WebFetch: "📡",
  Agent: "🪄",
  Task: "🪄",
  spawn_agent: "🪄",
  wait_agent: "⏳",
  ToolSearch: "🧰",
};

function toolEmoji(name?: string): string {
  if (!name) return "🛠️";
  if (TOOL_EMOJI[name]) return TOOL_EMOJI[name]!;
  if (name.startsWith("mcp__Claude_in_Chrome")) return "🧭";
  if (name.startsWith("mcp__playwright")) return "🎭";
  if (name.startsWith("mcp__")) return "🔌";
  return "🛠️";
}

const QUIPS = [
  "Sipping coffee ☕",
  "Cracking knuckles",
  "Reading the docs 📚",
  "Pondering an orb 🔮",
  "Whistling 🎵",
  "Plotting next move ♟️",
  "Petting a cat 🐱",
  "Writing TODOs",
  "Eating a snack 🥨",
];

const THINKING_FRAMES = ["·", "··", "···"];

const PARTICLE_EMOJI = ["✨", "💫", "⭐", "💥", "✦"];
const FAIL_PARTICLE = ["💢", "🤬", "❌"];

type Pop = {
  id: number;
  emoji: string;
  tool: string;
  x: number;
  y: number;
  isError: boolean;
};

type Particle = {
  id: number;
  emoji: string;
  dx: number;
  dy: number;
  delay: number;
};

export function OfficeScene({
  actors,
  actionPulse,
}: {
  actors: AgentActor[];
  actionPulse: Record<string, number>;
}) {
  const orchestrator = actors.find((a) => a.isOrchestrator);
  const subagents = actors.filter((a) => !a.isOrchestrator);

  return (
    <div className="absolute inset-0 office-floor overflow-auto">
      <div className="relative min-h-full px-6 py-10">
        {/* Lead row — single, centered, with a "Lead" badge */}
        <div className="flex flex-col items-center">
          {orchestrator && (
            <DeskCell
              actor={orchestrator}
              pulseAt={actionPulse[orchestrator.id]}
              isLead
            />
          )}
        </div>

        {subagents.length > 0 && (
          <>
            <ConnectorRow count={subagents.length} />
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-12 justify-center items-end">
              {subagents.map((actor) => (
                <DeskCell
                  key={actor.id}
                  actor={actor}
                  pulseAt={actionPulse[actor.id]}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConnectorRow({ count }: { count: number }) {
  // Simple, scales-to-any-count hierarchy hint: vertical drop from the lead,
  // a long dashed horizontal bar, and a "TEAM (N)" pill in the middle.
  return (
    <div className="relative mx-auto flex flex-col items-center pointer-events-none my-2 select-none">
      <div className="h-5 w-px bg-zinc-700/70" />
      <div className="relative w-full max-w-[1400px]">
        <div className="border-t border-dashed border-zinc-700/70" />
        <div className="absolute left-1/2 -translate-x-1/2 -top-2.5 px-2 bg-[#0c0a09] text-[9px] uppercase tracking-widest text-zinc-500">
          Team · {count}
        </div>
      </div>
      <div className="h-3 w-px bg-zinc-700/70" />
    </div>
  );
}

function describeToolName(e: AgentEvent | undefined): string {
  if (!e?.toolName) return "tool";
  const t = e.toolName.replace(/^mcp__[^_]+__/, "");
  return t.length > 18 ? `${t.slice(0, 16)}…` : t;
}

function randomPosition(): { x: number; y: number } {
  // Place at random angle around the character at 40-80px radius.
  const angle = Math.random() * Math.PI * 2;
  const r = 40 + Math.random() * 35;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.7 };
}

function randomParticles(error: boolean): Particle[] {
  const pool = error ? FAIL_PARTICLE : PARTICLE_EMOJI;
  const count = 4 + Math.floor(Math.random() * 4);
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 30;
    out.push({
      id: i,
      emoji: pool[Math.floor(Math.random() * pool.length)] ?? "✨",
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 6,
      delay: i * 30,
    });
  }
  return out;
}

function DeskCell({
  actor,
  pulseAt,
  isLead,
}: {
  actor: AgentActor;
  pulseAt: number | undefined;
  isLead?: boolean;
}) {
  const [pops, setPops] = useState<Pop[]>([]);
  const [particles, setParticles] = useState<{ id: number; arr: Particle[] }[]>(
    [],
  );
  const popIdRef = useRef(0);
  const particleIdRef = useRef(0);

  // On every new pulse: spawn a bubble at a random position + a particle burst.
  useEffect(() => {
    if (!pulseAt) return;
    const ev = actor.lastActivity;
    const isError =
      ev?.eventType === "tool_failed" || ev?.status === "failed";
    const id = ++popIdRef.current;
    const { x, y } = randomPosition();
    const pop: Pop = {
      id,
      emoji: toolEmoji(ev?.toolName),
      tool: describeToolName(ev),
      x,
      y,
      isError,
    };
    setPops((prev) => [...prev.slice(-3), pop]);
    const popTimer = setTimeout(() => {
      setPops((prev) => prev.filter((p) => p.id !== id));
    }, 2400);

    const pid = ++particleIdRef.current;
    setParticles((prev) => [...prev.slice(-2), { id: pid, arr: randomParticles(isError) }]);
    const partTimer = setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== pid));
    }, 1100);

    return () => {
      clearTimeout(popTimer);
      clearTimeout(partTimer);
    };
  }, [pulseAt, actor.lastActivity]);

  // Idle quip when not actively doing anything for a while.
  const [quip, setQuip] = useState<string | null>(null);
  useEffect(() => {
    if (actor.status !== "idle" && actor.status !== "done") return;
    const tick = () => {
      if (Math.random() < 0.4) {
        const choice = QUIPS[Math.floor(Math.random() * QUIPS.length)];
        setQuip(choice ?? null);
        setTimeout(() => setQuip(null), 4000);
      }
    };
    const id = setInterval(tick, 7000 + Math.random() * 6000);
    return () => clearInterval(id);
  }, [actor.status]);

  // Determine "now state" — did a tool just fire?
  const now = Date.now();
  const recent =
    actor.lastActivityAt && now - actor.lastActivityAt < 4000;
  const phase: "busy" | "thinking" | "idle" | "done" | "failed" | "abandoned" =
    actor.status === "failed"
      ? "failed"
      : actor.status === "done"
        ? "done"
        : actor.status === "abandoned"
          ? "abandoned"
          : actor.status === "working" && recent
            ? "busy"
            : actor.status === "working"
              ? "thinking"
              : "idle";

  const isInactive =
    phase === "done" ||
    phase === "failed" ||
    phase === "idle" ||
    phase === "abandoned";
  const dimClass = isInactive && !isLead
    ? phase === "abandoned"
      ? "opacity-40 grayscale-[0.7]"
      : "opacity-60 grayscale-[0.4]"
    : "";

  return (
    <div
      className={classNames(
        "group relative flex flex-col items-center gap-1 select-none animate-spawn-in transition-opacity",
        dimClass,
        isLead && "scale-110",
      )}
    >
      <HoverInfo actor={actor} phase={phase} isLead={!!isLead} />
      {/* Role / status badge */}
      <div
        className={classNames(
          "mb-1 inline-flex items-center gap-1 rounded-full px-2 py-px text-[9px] uppercase tracking-widest font-bold border",
          isLead
            ? "bg-blue-500/15 border-blue-500/50 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
            : phase === "done"
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
              : phase === "failed"
                ? "bg-red-500/10 border-red-500/40 text-red-300"
                : phase === "busy"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                  : phase === "thinking"
                    ? "bg-zinc-700/40 border-zinc-600 text-zinc-300"
                    : "bg-zinc-800/40 border-zinc-700 text-zinc-500",
        )}
      >
        {isLead ? (
          <>
            <span>👑</span>
            <span>Lead</span>
          </>
        ) : phase === "done" ? (
          <>
            <span>✓</span>
            <span>Done</span>
          </>
        ) : phase === "failed" ? (
          <>
            <span>✗</span>
            <span>Failed</span>
          </>
        ) : phase === "abandoned" ? (
          <>
            <span>💤</span>
            <span>Off-duty</span>
          </>
        ) : phase === "busy" ? (
          <>
            <span>⚡</span>
            <span>Busy</span>
          </>
        ) : phase === "thinking" ? (
          <>
            <span>💭</span>
            <span>Thinking</span>
          </>
        ) : (
          <span>idle</span>
        )}
      </div>
      <div className={classNames("relative w-32 flex items-end justify-center", isLead ? "h-40" : "h-36")}>
        {/* Floating tool bubbles at random positions */}
        {pops.map((p) => (
          <div
            key={p.id}
            className={classNames(
              "absolute left-1/2 top-1/2 pointer-events-none animate-pop-bubble z-20",
              "rounded-full border px-2 py-0.5 text-[11px] font-mono whitespace-nowrap",
              p.isError
                ? "bg-red-900/80 border-red-500/40 text-red-100"
                : "bg-zinc-900/90 border-zinc-700 text-zinc-100",
            )}
            style={{
              transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px))`,
            }}
          >
            <span className="mr-1">{p.emoji}</span>
            {p.tool}
          </div>
        ))}

        {/* Particle bursts — small emojis flying outward */}
        {particles.map((batch) =>
          batch.arr.map((pt) => (
            <span
              key={`${batch.id}-${pt.id}`}
              className="absolute left-1/2 top-1/2 pointer-events-none text-base z-10"
              style={
                {
                  transform: "translate(-50%, -50%)",
                  animation: `particle-fly 900ms ease-out ${pt.delay}ms forwards`,
                  ["--dx" as never]: `${pt.dx}px`,
                  ["--dy" as never]: `${pt.dy}px`,
                } as React.CSSProperties
              }
            >
              {pt.emoji}
            </span>
          )),
        )}

        {/* Thinking bubble (only when phase=thinking) */}
        {phase === "thinking" && <ThinkingBubble />}
        {/* Idle quip */}
        {phase === "idle" && quip && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900/80 border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 whitespace-nowrap">
            {quip}
          </div>
        )}

        {/* Hat */}
        <div
          className={classNames(
            "absolute left-1/2 -translate-x-1/2 text-2xl z-10",
            phase === "busy"
              ? "animate-hat-fly"
              : phase === "thinking"
                ? "animate-hat-tilt"
                : "top-2",
          )}
          aria-hidden
        >
          {actor.hat}
        </div>

        {/* Character */}
        <div
          className={classNames(
            "relative text-5xl leading-none transition-transform",
            phase === "busy"
              ? "animate-character-busy"
              : phase === "thinking"
                ? "animate-character-thinking"
                : phase === "failed"
                  ? "animate-character-sad"
                  : phase === "abandoned"
                    ? ""
                    : "animate-character-breathe",
          )}
          aria-hidden
        >
          {actor.isOrchestrator ? "🧙" : actorEmoji(actor.id)}
        </div>

        {/* Persistent status sparkles for done */}
        {phase === "done" && <SuccessSparkles />}
        {phase === "failed" && <FailureCloud />}
      </div>

      {/* Desk */}
      <div
        className={classNames(
          "relative h-2.5 w-32 rounded-sm bg-gradient-to-r border",
          actor.color,
          phase === "busy" && "animate-desk-shake",
        )}
      >
        <span
          className={classNames(
            "absolute -top-1.5 left-1/2 -translate-x-1/2 size-1.5 rounded-full",
            phase === "busy"
              ? "bg-emerald-400 animate-pulse"
              : phase === "thinking"
                ? "bg-amber-400 animate-pulse"
                : phase === "failed"
                  ? "bg-red-400"
                  : phase === "done"
                    ? "bg-emerald-500"
                    : "bg-zinc-500",
          )}
        />
      </div>

      <div className="mt-1 text-[11px] font-mono text-zinc-200 truncate max-w-[10rem]">
        {actor.nickname}
        {actor.subagentType ? (
          <span className="text-zinc-500"> · {actor.subagentType}</span>
        ) : actor.isOrchestrator ? (
          <span className="text-blue-300/80"> · orchestrator</span>
        ) : null}
      </div>
      <div className="text-[10px] text-zinc-500">
        {actor.toolCount} tool{actor.toolCount === 1 ? "" : "s"}
      </div>
      {actor.todos && actor.todos.total > 0 && (
        <TodoBar
          completed={actor.todos.completed}
          total={actor.todos.total}
          active={actor.todos.active}
          isWorking={phase === "busy" || phase === "thinking"}
        />
      )}
    </div>
  );
}

function HoverInfo({
  actor,
  phase,
  isLead,
}: {
  actor: AgentActor;
  phase: string;
  isLead: boolean;
}) {
  const last = actor.lastActivity;
  const spawnedSec = Math.max(
    0,
    Math.floor((Date.now() - actor.spawnedAt) / 1000),
  );
  const elapsed =
    spawnedSec < 60
      ? `${spawnedSec}s`
      : spawnedSec < 3600
        ? `${Math.floor(spawnedSec / 60)}m`
        : `${Math.floor(spawnedSec / 3600)}h`;
  const phaseColor =
    phase === "busy"
      ? "text-amber-300"
      : phase === "thinking"
        ? "text-blue-300"
        : phase === "done"
          ? "text-emerald-300"
          : phase === "failed"
            ? "text-red-300"
            : phase === "abandoned"
              ? "text-zinc-500"
              : "text-zinc-400";
  return (
    <div
      role="tooltip"
      className={classNames(
        "absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full",
        "z-50 w-60 pointer-events-none",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75",
        "rounded-md border border-zinc-700 bg-zinc-950/95 shadow-xl shadow-black/60 backdrop-blur-sm",
        "px-3 py-2 text-[11px] text-zinc-200",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-semibold text-zinc-100 truncate">
          {actor.nickname}
        </span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-400 truncate">
          {isLead ? "orchestrator" : actor.subagentType ?? "subagent"}
        </span>
        <span
          className={classNames(
            "ml-auto text-[9px] uppercase tracking-wider font-bold",
            phaseColor,
          )}
        >
          {phase}
        </span>
      </div>
      {actor.description && (
        <div className="mb-1.5">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5">
            Assigned
          </div>
          <div className="text-zinc-200 leading-snug line-clamp-3">
            {actor.description}
          </div>
        </div>
      )}
      {last && (
        <div className="mb-1.5">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5">
            Now
          </div>
          <div className="font-mono text-zinc-200 truncate">
            {last.toolName ?? last.title}
          </div>
        </div>
      )}
      {actor.todos && actor.todos.total > 0 && (
        <div className="mb-1.5">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5">
            Todos
          </div>
          <div className="text-zinc-300">
            {actor.todos.completed}/{actor.todos.total} done
            {actor.todos.active && (
              <span className="text-zinc-500"> · {actor.todos.active}</span>
            )}
          </div>
        </div>
      )}
      <div className="mt-1.5 pt-1.5 border-t border-zinc-800 flex items-center justify-between font-mono text-zinc-500 text-[10px]">
        <span>{actor.toolCount} tools</span>
        <span>spawned {elapsed} ago</span>
      </div>
    </div>
  );
}

function TodoBar({
  completed,
  total,
  active,
  isWorking,
}: {
  completed: number;
  total: number;
  active?: string;
  isWorking: boolean;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="mt-1 w-32 select-none">
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={classNames(
            "h-full rounded-full transition-all duration-500",
            pct === 100
              ? "bg-emerald-400"
              : isWorking
                ? "bg-blue-400"
                : "bg-zinc-500",
          )}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[9px] font-mono text-zinc-500">
        <span>
          {completed}/{total}
        </span>
        {pct === 100 ? (
          <span className="text-emerald-400">all done</span>
        ) : (
          <span className="truncate max-w-[80px]" title={active}>
            {active ?? "todo"}
          </span>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % THINKING_FRAMES.length), 350);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-2xl bg-zinc-100/95 border border-zinc-300 px-2.5 py-0.5 text-[11px] text-zinc-700 z-30 shadow-md">
      <span className="font-bold">{THINKING_FRAMES[frame]}</span>
    </div>
  );
}

const FACES = [
  "🧑‍💻",
  "👩‍💻",
  "👨‍💻",
  "🧑‍🚀",
  "🧑‍🔬",
  "🧑‍🎨",
  "🧑‍🏫",
  "🧑‍🍳",
  "🧑‍🔧",
  "🧑‍✈️",
];

function actorEmoji(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return FACES[Math.abs(h) % FACES.length] ?? "🧑‍💻";
}

function SuccessSparkles() {
  return (
    <>
      <div className="absolute -top-3 -right-2 text-yellow-300 animate-sparkle">
        ✨
      </div>
      <div
        className="absolute -top-1 -left-3 text-yellow-200 animate-sparkle"
        style={{ animationDelay: "300ms" }}
      >
        ✦
      </div>
    </>
  );
}

function FailureCloud() {
  return (
    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl animate-cloud-drift">
      ☁️
    </div>
  );
}
