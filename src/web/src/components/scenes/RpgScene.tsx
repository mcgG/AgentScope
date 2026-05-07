import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, AgentSession } from "@shared/events.ts";
import type { AgentActor } from "../PlaygroundView.tsx";
import { classNames } from "../../utils.ts";

type SessionUsage = {
  sessionId: string;
  cost: number;
  tokens: number;
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitRate: number;
};

function useSessionUsage(sessionId: string | undefined): SessionUsage | null {
  const [usage, setUsage] = useState<SessionUsage | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    const fetchOnce = async () => {
      try {
        // Hit a per-session totals endpoint via /api/usage?range=all + filter,
        // which already returns aggregated per-session cost/tokens. To get
        // input/output/cache breakdown for the specific session we ask the
        // server for the underlying stored usage.
        const [rollupRes, sessionRes] = await Promise.all([
          fetch("/api/usage?range=all"),
          fetch(`/api/usage/session?sessionId=${encodeURIComponent(sessionId)}`),
        ]);
        let cost = 0,
          tokens = 0,
          turns = 0;
        if (rollupRes.ok) {
          const data = (await rollupRes.json()) as {
            bySession?: Array<{ sessionId: string; cost: number; tokens: number; turns: number }>;
          };
          const me = data.bySession?.find((s) => s.sessionId === sessionId);
          if (me) {
            cost = me.cost;
            tokens = me.tokens;
            turns = me.turns;
          }
        }
        let input = 0,
          output = 0,
          cacheRead = 0,
          cacheWrite = 0;
        let cacheHitRate = 0;
        if (sessionRes.ok) {
          const su = (await sessionRes.json()) as {
            totals?: {
              input: number;
              output: number;
              cacheRead: number;
              cacheWrite: number;
              cost: number;
              turns: number;
              cacheHitRate?: number;
            };
          };
          if (su.totals) {
            input = su.totals.input;
            output = su.totals.output;
            cacheRead = su.totals.cacheRead;
            cacheWrite = su.totals.cacheWrite;
            // Prefer per-session totals when available — they're authoritative.
            cost = su.totals.cost;
            turns = su.totals.turns;
            tokens = input + output + cacheRead + cacheWrite;
            cacheHitRate = su.totals.cacheHitRate ?? 0;
          }
        }
        if (!stopped) {
          setUsage({
            sessionId,
            cost,
            tokens,
            turns,
            input,
            output,
            cacheRead,
            cacheWrite,
            cacheHitRate,
          });
        }
      } catch {
        // ignore
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 10_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId]);
  return usage;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatUsd(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

// ----------------------------------------------------------------------
// Class system
// ----------------------------------------------------------------------

type RpgClass = "Warrior" | "Mage" | "Archer" | "Cleric" | "Rogue" | "Tank";

type ClassDef = {
  key: RpgClass;
  // Cape / cloth color
  capeFill: string;
  capeStroke: string;
  // Weapon-area accent (used for tinting glyph etc.)
  accent: string;
  // Body tunic color
  tunicFill: string;
  tunicStroke: string;
  // Skin tone (kept neutral, varied a touch per class for visual variety)
  skin: string;
  // Hair color
  hair: string;
  // Headgear renderer
  headgear: "helmet" | "hat" | "hood" | "cap" | "circlet" | "horns";
  // Weapon renderer
  weapon: "sword" | "staff" | "bow" | "mace" | "dagger" | "shield";
};

const CLASS_DEFS: Record<RpgClass, ClassDef> = {
  Warrior: {
    key: "Warrior",
    capeFill: "#b91c1c",
    capeStroke: "#7f1d1d",
    accent: "#f87171",
    tunicFill: "#374151",
    tunicStroke: "#1f2937",
    skin: "#f5d0a9",
    hair: "#3f2a14",
    headgear: "helmet",
    weapon: "sword",
  },
  Mage: {
    key: "Mage",
    capeFill: "#6d28d9",
    capeStroke: "#4c1d95",
    accent: "#a78bfa",
    tunicFill: "#312e81",
    tunicStroke: "#1e1b4b",
    skin: "#f1c79a",
    hair: "#c0c0c0",
    headgear: "hat",
    weapon: "staff",
  },
  Archer: {
    key: "Archer",
    capeFill: "#15803d",
    capeStroke: "#14532d",
    accent: "#86efac",
    tunicFill: "#166534",
    tunicStroke: "#052e16",
    skin: "#e9b88c",
    hair: "#854d0e",
    headgear: "hood",
    weapon: "bow",
  },
  Cleric: {
    key: "Cleric",
    capeFill: "#fde68a",
    capeStroke: "#ca8a04",
    accent: "#fde047",
    tunicFill: "#fef3c7",
    tunicStroke: "#a16207",
    skin: "#f3d2ac",
    hair: "#e7d39b",
    headgear: "circlet",
    weapon: "mace",
  },
  Rogue: {
    key: "Rogue",
    capeFill: "#1f2937",
    capeStroke: "#0f172a",
    accent: "#94a3b8",
    tunicFill: "#0f172a",
    tunicStroke: "#020617",
    skin: "#e9b88c",
    hair: "#171717",
    headgear: "hood",
    weapon: "dagger",
  },
  Tank: {
    key: "Tank",
    capeFill: "#1e3a8a",
    capeStroke: "#172554",
    accent: "#60a5fa",
    tunicFill: "#475569",
    tunicStroke: "#1e293b",
    skin: "#f5d0a9",
    hair: "#1f2937",
    headgear: "horns",
    weapon: "shield",
  },
};

const CLASS_LIST: RpgClass[] = [
  "Warrior",
  "Mage",
  "Archer",
  "Cleric",
  "Rogue",
  "Tank",
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function classFor(actor: AgentActor): RpgClass {
  const seed = actor.agentId ?? actor.id;
  return CLASS_LIST[hash(seed) % CLASS_LIST.length] ?? "Warrior";
}

// ----------------------------------------------------------------------
// Tool glyph SVGs
// ----------------------------------------------------------------------

function ToolGlyph({ name, size = 14 }: { name?: string; size?: number }) {
  const n = name ?? "";
  // Inline SVG glyph for common tools; falls back to a generic gear.
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (n === "Bash") {
    // Sword
    return (
      <svg {...props}>
        <path d="M3 13l4-4" />
        <path d="M9 3l4 4-4 4-1-1 4-4-4-4z" fill="currentColor" />
        <path d="M3 13l1 1" />
      </svg>
    );
  }
  if (n === "Read") {
    // Scroll
    return (
      <svg {...props}>
        <rect x="3" y="4" width="10" height="8" rx="1" fill="currentColor" fillOpacity="0.2" />
        <path d="M5 6h6M5 8h6M5 10h4" />
      </svg>
    );
  }
  if (n === "Write" || n === "Edit" || n === "MultiEdit") {
    // Quill
    return (
      <svg {...props}>
        <path d="M3 13l8-8 2 2-8 8H3z" fill="currentColor" fillOpacity="0.25" />
        <path d="M11 3l2 2" />
      </svg>
    );
  }
  if (n === "Grep" || n === "Glob") {
    // Magnifying glass
    return (
      <svg {...props}>
        <circle cx="7" cy="7" r="3.5" />
        <path d="M10 10l3 3" />
      </svg>
    );
  }
  if (n === "TodoWrite") {
    // Checklist
    return (
      <svg {...props}>
        <rect x="3" y="3" width="10" height="10" rx="1" />
        <path d="M5.5 8l1.5 1.5 3-3.5" />
      </svg>
    );
  }
  if (n === "WebSearch" || n === "WebFetch") {
    // Globe
    return (
      <svg {...props}>
        <circle cx="8" cy="8" r="5" />
        <path d="M3 8h10M8 3c2 2.5 2 7.5 0 10M8 3c-2 2.5-2 7.5 0 10" />
      </svg>
    );
  }
  if (n === "Agent" || n === "Task" || n === "spawn_agent") {
    // Wand sparkle
    return (
      <svg {...props}>
        <path d="M3 13l8-8" />
        <path d="M11 3l2 2" />
        <path d="M5 5l1 1M11 11l1 1" />
      </svg>
    );
  }
  if (n === "wait_agent") {
    // Hourglass
    return (
      <svg {...props}>
        <path d="M5 3h6M5 13h6" />
        <path d="M5 3l3 5-3 5M11 3l-3 5 3 5" fill="currentColor" fillOpacity="0.2" />
      </svg>
    );
  }
  if (n === "ToolSearch") {
    // Toolbox
    return (
      <svg {...props}>
        <rect x="2.5" y="6" width="11" height="6" rx="1" fill="currentColor" fillOpacity="0.2" />
        <path d="M6 6V5a1 1 0 011-1h2a1 1 0 011 1v1" />
        <path d="M2.5 9h11" />
      </svg>
    );
  }
  if (n.startsWith("mcp__")) {
    // Plug
    return (
      <svg {...props}>
        <path d="M6 3v3M10 3v3" />
        <rect x="4.5" y="6" width="7" height="3" rx="0.5" fill="currentColor" fillOpacity="0.2" />
        <path d="M8 9v3" />
      </svg>
    );
  }
  // Fallback: gear
  return (
    <svg {...props}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" />
    </svg>
  );
}

function describeToolName(e: AgentEvent | undefined): string {
  if (!e?.toolName) return "tool";
  const t = e.toolName.replace(/^mcp__[^_]+__/, "");
  return t.length > 16 ? `${t.slice(0, 14)}…` : t;
}

// ----------------------------------------------------------------------
// Phase derivation (shared with OfficeScene logic)
// ----------------------------------------------------------------------

type Phase = "busy" | "thinking" | "idle" | "done" | "failed" | "abandoned";

function derivePhase(actor: AgentActor): Phase {
  const now = Date.now();
  const recent = actor.lastActivityAt && now - actor.lastActivityAt < 4000;
  if (actor.status === "failed") return "failed";
  if (actor.status === "done") return "done";
  if (actor.status === "abandoned") return "abandoned";
  if (actor.status === "working" && recent) return "busy";
  if (actor.status === "working") return "thinking";
  return "idle";
}

// ----------------------------------------------------------------------
// Bubbles & particles state
// ----------------------------------------------------------------------

type Pop = {
  id: number;
  tool: string;
  toolName?: string;
  x: number;
  y: number;
  isError: boolean;
};

type Particle = {
  id: number;
  shape: "tri" | "star" | "spark";
  color: string;
  dx: number;
  dy: number;
  delay: number;
};

function makeParticles(error: boolean, accent: string): Particle[] {
  const count = 5 + Math.floor(Math.random() * 4);
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 28 + Math.random() * 36;
    const shape: Particle["shape"] = error
      ? "spark"
      : Math.random() < 0.5
        ? "tri"
        : "star";
    out.push({
      id: i,
      shape,
      color: error ? "#ef4444" : accent,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 8,
      delay: i * 35,
    });
  }
  return out;
}

function randomBubblePos(): { x: number; y: number } {
  // Prefer upper hemisphere but allow some side variance
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
  const r = 36 + Math.random() * 30;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.85 };
}

// ----------------------------------------------------------------------
// Main scene
// ----------------------------------------------------------------------

export function RpgScene({
  actors,
  actionPulse,
  session,
}: {
  actors: AgentActor[];
  actionPulse: Record<string, number>;
  session?: AgentSession;
}) {
  const orchestrator = actors.find((a) => a.isOrchestrator);
  const subagents = actors.filter((a) => !a.isOrchestrator);
  const usage = useSessionUsage(session?.id);

  // Track recent action fires so we can animate "coins" flying to the HUD.
  const [coins, setCoins] = useState<
    Array<{ id: number; actorId: string }>
  >([]);
  const coinIdRef = useRef(0);
  const lastPulseRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const next: Array<{ id: number; actorId: string }> = [];
    for (const [actorId, ts] of Object.entries(actionPulse)) {
      if (lastPulseRef.current[actorId] !== ts) {
        lastPulseRef.current[actorId] = ts;
        next.push({ id: ++coinIdRef.current, actorId });
      }
    }
    if (next.length === 0) return;
    setCoins((prev) => [...prev, ...next]);
    const t = setTimeout(() => {
      setCoins((prev) =>
        prev.filter((c) => !next.some((n) => n.id === c.id)),
      );
    }, 1100);
    return () => clearTimeout(t);
  }, [actionPulse]);

  // Split subagents into two ranks for a V-formation: front rank (closer to
  // leader) and back rank (further). Even count splits evenly; odd puts one
  // extra in front.
  const { front, back } = useMemo(() => {
    if (subagents.length <= 3) return { front: subagents, back: [] };
    const half = Math.ceil(subagents.length / 2);
    return { front: subagents.slice(0, half), back: subagents.slice(half) };
  }, [subagents]);

  return (
    <div className="absolute inset-0 rpg-field overflow-auto">
      {/* Decorative pixel stars in the sky */}
      <PixelStars />

      {/* Top-right HUD with real session metrics */}
      <RpgHud usage={usage} actors={actors} />

      {/* Top-left Quest Log (orchestrator's todos) */}
      <QuestLog actors={actors} />

      {/* Coins flying to the HUD whenever a tool fires */}
      {coins.map((c) => (
        <CoinFly key={c.id} actorId={c.actorId} />
      ))}

      <div className="relative min-h-full px-6 py-8 flex flex-col items-center">
        {/* Title strip */}
        <div className="mb-3 inline-flex items-center gap-2 rounded-md border-2 border-amber-400/40 bg-zinc-900/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-amber-200 shadow-[0_0_0_2px_rgba(0,0,0,0.4)]">
          <span aria-hidden>★</span>
          <span>Adventuring Party</span>
          <span aria-hidden>★</span>
        </div>

        {/* Back rank */}
        {back.length > 0 && (
          <div className="flex flex-wrap justify-center items-end gap-x-6 gap-y-8 mb-2">
            {back.map((actor) => (
              <CharacterCard
                key={actor.id}
                actor={actor}
                pulseAt={actionPulse[actor.id]}
                tier="back"
              />
            ))}
          </div>
        )}

        {/* Front rank */}
        {front.length > 0 && (
          <div className="flex flex-wrap justify-center items-end gap-x-8 gap-y-8 mb-3">
            {front.map((actor) => (
              <CharacterCard
                key={actor.id}
                actor={actor}
                pulseAt={actionPulse[actor.id]}
                tier="front"
              />
            ))}
          </div>
        )}

        {/* Leader on a stone podium, sized larger */}
        {orchestrator && (
          <div className="mt-2 flex flex-col items-center">
            <CharacterCard
              actor={orchestrator}
              pulseAt={actionPulse[orchestrator.id]}
              tier="leader"
            />
            <Podium />
          </div>
        )}
      </div>
    </div>
  );
}

function PixelStars() {
  // Static SVG pattern of small stars; positions are deterministic so they
  // don't reflow on rerenders.
  const stars = useMemo(() => {
    const out: Array<{ x: number; y: number; s: number }> = [];
    let h = 1337;
    for (let i = 0; i < 30; i++) {
      h = (h * 9301 + 49297) % 233280;
      out.push({
        x: (h / 233280) * 100,
        y: ((h * 7) % 4000) / 100,
        s: 1 + ((h * 3) % 3),
      });
    }
    return out;
  }, []);
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 top-0 h-40 w-full opacity-60"
      preserveAspectRatio="none"
      viewBox="0 0 100 40"
      aria-hidden
    >
      {stars.map((s, i) => (
        <rect
          key={i}
          x={s.x}
          y={s.y}
          width={s.s * 0.25}
          height={s.s * 0.25}
          fill="#fbbf24"
          opacity={0.6}
        />
      ))}
    </svg>
  );
}

function Podium() {
  return (
    <svg
      width={140}
      height={26}
      viewBox="0 0 140 26"
      className="-mt-1"
      aria-hidden
    >
      {/* Stone podium with chunky shading */}
      <rect x="10" y="6" width="120" height="14" fill="#52525b" stroke="#27272a" strokeWidth="2" />
      <rect x="10" y="6" width="120" height="3" fill="#71717a" />
      <rect x="10" y="17" width="120" height="3" fill="#3f3f46" />
      <rect x="0" y="20" width="140" height="6" fill="#27272a" />
      {/* Highlight squares for "pixel" feel */}
      <rect x="20" y="11" width="3" height="3" fill="#71717a" />
      <rect x="60" y="11" width="3" height="3" fill="#71717a" />
      <rect x="100" y="11" width="3" height="3" fill="#71717a" />
    </svg>
  );
}

// ----------------------------------------------------------------------
// Character card: name plate, sprite, ribbons, particles, etc.
// ----------------------------------------------------------------------

function CharacterCard({
  actor,
  pulseAt,
  tier,
}: {
  actor: AgentActor;
  pulseAt: number | undefined;
  tier: "leader" | "front" | "back";
}) {
  const cls: RpgClass = actor.isOrchestrator ? "Warrior" : classFor(actor);
  // The Party Leader visual: always overrides class to a "leader" look — we
  // still pick a base class for body silhouette but draw a crown + banner.
  const def = CLASS_DEFS[cls];

  const phase = derivePhase(actor);
  const isLeader = tier === "leader";

  const [pops, setPops] = useState<Pop[]>([]);
  const [particles, setParticles] = useState<{ id: number; arr: Particle[] }[]>([]);
  const popIdRef = useRef(0);
  const particleIdRef = useRef(0);
  const [poofKey, setPoofKey] = useState(0);

  // Trigger spawn poof once on mount.
  useEffect(() => {
    setPoofKey((n) => n + 1);
  }, []);

  // On a new tool pulse: spawn a tool ribbon at a random position + particle burst.
  useEffect(() => {
    if (!pulseAt) return;
    const ev = actor.lastActivity;
    const isError = ev?.eventType === "tool_failed" || ev?.status === "failed";
    const id = ++popIdRef.current;
    const { x, y } = randomBubblePos();
    const pop: Pop = {
      id,
      tool: describeToolName(ev),
      toolName: ev?.toolName,
      x,
      y,
      isError,
    };
    setPops((prev) => [...prev.slice(-2), pop]);
    const popTimer = setTimeout(() => {
      setPops((prev) => prev.filter((p) => p.id !== id));
    }, 2100);

    const pid = ++particleIdRef.current;
    setParticles((prev) => [
      ...prev.slice(-2),
      { id: pid, arr: makeParticles(isError, def.accent) },
    ]);
    const partTimer = setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== pid));
    }, 1100);

    return () => {
      clearTimeout(popTimer);
      clearTimeout(partTimer);
    };
  }, [pulseAt, actor.lastActivity, def.accent]);

  // Idle visuals: nothing periodic for RPG (kept simple) — characters just bob.

  // Tints / desaturation per phase
  const tintFilter =
    phase === "done"
      ? "hue-rotate(50deg) saturate(0.9) brightness(0.95)"
      : phase === "failed"
        ? "hue-rotate(-20deg) saturate(1.4) brightness(0.85)"
        : phase === "abandoned"
          ? "grayscale(0.85) brightness(0.7)"
          : "";

  const dimClass =
    phase === "done"
      ? "opacity-70"
      : phase === "abandoned"
        ? "opacity-50"
        : phase === "failed"
          ? "opacity-85"
          : phase === "idle" && !isLeader
            ? "opacity-90"
            : "";

  const scale = isLeader ? "scale-[1.18]" : tier === "back" ? "scale-95" : "";
  const bodyAnim =
    phase === "busy"
      ? "rpg-anim-busy"
      : phase === "thinking"
        ? "rpg-anim-thinking"
        : phase === "failed"
          ? "rpg-anim-failed"
          : phase === "abandoned"
            ? ""
            : "rpg-anim-idle";

  // HP is bound to TodoWrite progress (real data). When the agent has no todos,
  // we hide the HP bar entirely.
  const hasTodos = !!(actor.todos && actor.todos.total > 0);
  const hp = hasTodos ? actor.todos!.completed : 0;
  const hpMax = hasTodos ? actor.todos!.total : 0;

  return (
    <div
      data-rpg-actor={actor.id}
      className={classNames(
        "group relative flex flex-col items-center select-none rpg-spawn-in",
        dimClass,
        scale,
      )}
      style={{ transformOrigin: "center bottom" }}
    >
      <RpgHoverCard actor={actor} cls={cls} phase={phase} isLeader={isLeader} />
      {/* Sprite container (relative for absolute overlays) */}
      <div
        className={classNames(
          "relative flex items-end justify-center",
          isLeader ? "w-32 h-36" : "w-24 h-28",
        )}
      >
        {/* Spawn-in poof rings */}
        <SpawnPoof key={poofKey} accent={def.accent} />

        {/* Banner above leader */}
        {isLeader && <LeaderBanner />}

        {/* Crown if leader */}
        {isLeader && <Crown />}

        {/* Thinking bubble */}
        {phase === "thinking" && <ThinkingBubble />}

        {/* Zzz for abandoned */}
        {phase === "abandoned" && <Zzz />}

        {/* Victory sparkle for done */}
        {phase === "done" && <VictoryStar />}

        {/* KO X for failed */}
        {phase === "failed" && <KoIndicator />}

        {/* Particle bursts (SVG triangles/stars) */}
        {particles.map((batch) => (
          <SvgParticleBurst key={batch.id} arr={batch.arr} />
        ))}

        {/* Tool-action ribbons at random positions */}
        {pops.map((p) => (
          <ToolRibbon key={p.id} pop={p} />
        ))}

        {/* The character sprite */}
        <div
          className={classNames("absolute inset-0 flex items-end justify-center", bodyAnim)}
          style={tintFilter ? ({ filter: tintFilter } as React.CSSProperties) : undefined}
        >
          <CharacterSprite def={def} phase={phase} isLeader={isLeader} />
        </div>

        {/* Shadow */}
        <div
          className="absolute bottom-0 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-black/60 blur-[1px]"
          aria-hidden
        />
      </div>

      {/* Name plate */}
      <NamePlate
        actor={actor}
        cls={cls}
        isLeader={isLeader}
        hp={hp}
        hpMax={hpMax}
        phase={phase}
        hasTodos={hasTodos}
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// Character sprite — base body, parameterized by class
// ----------------------------------------------------------------------

function CharacterSprite({
  def,
  phase,
  isLeader,
}: {
  def: ClassDef;
  phase: Phase;
  isLeader: boolean;
}) {
  const w = isLeader ? 88 : 72;
  const h = isLeader ? 110 : 92;
  // ViewBox uses a fixed grid so the sprite renders crisply at any size.
  // Origin top-left, body baseline at y=58.
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 56 70"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* Cape (drawn behind) */}
      <Cape def={def} />

      {/* Legs */}
      <rect x="22" y="50" width="5" height="9" fill={def.tunicStroke} />
      <rect x="29" y="50" width="5" height="9" fill={def.tunicStroke} />
      {/* Boots */}
      <rect x="21" y="58" width="7" height="3" fill="#1c1917" />
      <rect x="28" y="58" width="7" height="3" fill="#1c1917" />

      {/* Torso (tunic) */}
      <rect x="20" y="34" width="16" height="17" fill={def.tunicFill} stroke={def.tunicStroke} strokeWidth="1" />
      {/* Belt */}
      <rect x="20" y="46" width="16" height="2" fill={def.tunicStroke} />
      {/* Tunic chest accent */}
      <rect x="27" y="36" width="2" height="9" fill={def.accent} opacity="0.7" />

      {/* Arms */}
      <rect x="16" y="35" width="4" height="11" fill={def.tunicFill} stroke={def.tunicStroke} strokeWidth="1" />
      <rect x="36" y="35" width="4" height="11" fill={def.tunicFill} stroke={def.tunicStroke} strokeWidth="1" />
      {/* Hands */}
      <rect x="16" y="45" width="4" height="3" fill={def.skin} />
      <rect x="36" y="45" width="4" height="3" fill={def.skin} />

      {/* Head */}
      <rect x="22" y="20" width="12" height="14" fill={def.skin} stroke="#92400e" strokeWidth="0.5" />
      {/* Hair fringe */}
      <rect x="22" y="20" width="12" height="3" fill={def.hair} />
      {/* Eyes */}
      {phase === "failed" ? (
        <>
          <path d="M24 26 L26 28 M26 26 L24 28" stroke="#1c1917" strokeWidth="0.8" />
          <path d="M30 26 L32 28 M32 26 L30 28" stroke="#1c1917" strokeWidth="0.8" />
        </>
      ) : phase === "abandoned" ? (
        <>
          <rect x="24" y="27" width="3" height="0.7" fill="#1c1917" />
          <rect x="29" y="27" width="3" height="0.7" fill="#1c1917" />
        </>
      ) : phase === "done" ? (
        <>
          <path d="M24 27 Q25.5 28.5 27 27" stroke="#1c1917" strokeWidth="0.8" fill="none" />
          <path d="M29 27 Q30.5 28.5 32 27" stroke="#1c1917" strokeWidth="0.8" fill="none" />
        </>
      ) : (
        <>
          <rect x="25" y="26" width="1.5" height="2" fill="#1c1917" />
          <rect x="29.5" y="26" width="1.5" height="2" fill="#1c1917" />
        </>
      )}
      {/* Mouth */}
      {phase === "failed" ? (
        <path d="M26 31 Q28 30 30 31" stroke="#1c1917" strokeWidth="0.7" fill="none" />
      ) : phase === "done" ? (
        <path d="M26 30 Q28 32 30 30" stroke="#1c1917" strokeWidth="0.7" fill="none" />
      ) : (
        <rect x="26.5" y="30" width="3" height="0.7" fill="#7c2d12" />
      )}

      {/* Headgear */}
      <Headgear def={def} />

      {/* Weapon (in right hand) */}
      <Weapon def={def} phase={phase} />

      {/* Shield in left hand for Tank */}
      {def.weapon === "shield" && (
        <g>
          <path d="M12 38 L20 36 L20 48 L12 50 Z" fill={def.accent} stroke={def.tunicStroke} strokeWidth="0.8" />
          <path d="M14 40 L18 39 L18 47 L14 48 Z" fill={def.tunicFill} />
        </g>
      )}
    </svg>
  );
}

function Cape({ def }: { def: ClassDef }) {
  return (
    <g>
      <path
        d="M16 33 L40 33 L42 56 L36 53 L32 56 L28 53 L24 56 L20 53 L14 56 Z"
        fill={def.capeFill}
        stroke={def.capeStroke}
        strokeWidth="1"
      />
      {/* highlight stripe */}
      <path d="M27 33 L29 33 L29 54 L27 54 Z" fill={def.accent} opacity="0.35" />
    </g>
  );
}

function Headgear({ def }: { def: ClassDef }) {
  switch (def.headgear) {
    case "helmet":
      return (
        <g>
          <rect x="20" y="14" width="16" height="9" fill="#9ca3af" stroke="#374151" strokeWidth="1" />
          <rect x="22" y="22" width="12" height="2" fill={def.accent} />
          <rect x="27" y="11" width="2" height="4" fill={def.capeFill} />
          {/* Visor slit */}
          <rect x="22" y="18" width="12" height="1.5" fill="#1c1917" />
        </g>
      );
    case "hat":
      // Wizard's pointy hat
      return (
        <g>
          <path d="M18 20 L28 6 L38 20 Z" fill={def.capeFill} stroke={def.capeStroke} strokeWidth="1" />
          <rect x="18" y="19" width="20" height="3" fill={def.tunicFill} stroke={def.tunicStroke} strokeWidth="0.8" />
          {/* Star on hat */}
          <path d="M28 12 L29 14 L31 14 L29.5 15 L30 17 L28 16 L26 17 L26.5 15 L25 14 L27 14 Z" fill={def.accent} />
        </g>
      );
    case "hood":
      return (
        <g>
          <path d="M18 22 L20 14 L36 14 L38 22 L34 18 L22 18 Z" fill={def.capeFill} stroke={def.capeStroke} strokeWidth="1" />
          <rect x="22" y="20" width="12" height="3" fill={def.capeStroke} opacity="0.55" />
        </g>
      );
    case "cap":
      return (
        <g>
          <rect x="20" y="16" width="16" height="5" fill={def.capeFill} stroke={def.capeStroke} strokeWidth="1" />
          <rect x="35" y="19" width="4" height="2" fill={def.capeFill} stroke={def.capeStroke} strokeWidth="1" />
        </g>
      );
    case "circlet":
      return (
        <g>
          <rect x="22" y="18" width="12" height="2" fill="#facc15" stroke="#a16207" strokeWidth="0.6" />
          <rect x="27" y="15" width="2" height="3" fill="#facc15" />
          <rect x="23" y="16" width="1.5" height="2" fill="#facc15" />
          <rect x="31.5" y="16" width="1.5" height="2" fill="#facc15" />
        </g>
      );
    case "horns":
      return (
        <g>
          <rect x="20" y="14" width="16" height="7" fill="#52525b" stroke="#27272a" strokeWidth="1" />
          <path d="M20 15 L17 10 L20 12 Z" fill="#e7e5e4" />
          <path d="M36 15 L39 10 L36 12 Z" fill="#e7e5e4" />
          <rect x="22" y="19" width="12" height="1.5" fill={def.accent} />
        </g>
      );
  }
}

function Weapon({ def, phase }: { def: ClassDef; phase: Phase }) {
  const swing = phase === "busy" && (def.weapon === "sword" || def.weapon === "mace" || def.weapon === "dagger");
  const cast = phase === "busy" && def.weapon === "staff";
  const draw = phase === "busy" && def.weapon === "bow";
  switch (def.weapon) {
    case "sword":
      return (
        <g className={swing ? "rpg-weapon-swing" : undefined}>
          <rect x="40" y="32" width="2" height="14" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />
          <rect x="38" y="44" width="6" height="2" fill="#854d0e" />
          <rect x="40.5" y="46" width="1" height="3" fill="#854d0e" />
        </g>
      );
    case "staff":
      return (
        <g>
          <rect x="40" y="30" width="1.6" height="20" fill="#854d0e" />
          <g className={cast ? "rpg-spell-pulse" : undefined}>
            <circle cx="40.8" cy="29" r="2.5" fill={def.accent} opacity="0.85" />
            <circle cx="40.8" cy="29" r="1" fill="#ffffff" opacity="0.9" />
          </g>
        </g>
      );
    case "bow":
      return (
        <g className={draw ? "rpg-bow-draw" : undefined}>
          <path d="M42 32 Q46 41 42 50" stroke="#854d0e" strokeWidth="1.5" fill="none" />
          <path d="M42 32 L42 50" stroke="#e7e5e4" strokeWidth="0.6" />
          {phase === "busy" && (
            <rect x="36" y="40" width="6" height="0.7" fill="#cbd5e1" />
          )}
        </g>
      );
    case "mace":
      return (
        <g className={swing ? "rpg-weapon-swing" : undefined}>
          <rect x="40.5" y="38" width="1.5" height="10" fill="#854d0e" />
          <circle cx="41" cy="36" r="2.5" fill="#9ca3af" stroke="#475569" strokeWidth="0.5" />
          <rect x="38.5" y="33.5" width="1.2" height="1.2" fill="#9ca3af" />
          <rect x="42.5" y="33.5" width="1.2" height="1.2" fill="#9ca3af" />
          <rect x="38.5" y="37.5" width="1.2" height="1.2" fill="#9ca3af" />
          <rect x="42.5" y="37.5" width="1.2" height="1.2" fill="#9ca3af" />
        </g>
      );
    case "dagger":
      return (
        <g className={swing ? "rpg-weapon-swing" : undefined}>
          <rect x="40.5" y="40" width="1.5" height="6" fill="#cbd5e1" stroke="#475569" strokeWidth="0.4" />
          <rect x="39.5" y="46" width="3.5" height="1.4" fill="#854d0e" />
        </g>
      );
    case "shield":
      // Tank's main weapon is the shield; nothing extra in right hand.
      return null;
  }
}

// ----------------------------------------------------------------------
// Overlays
// ----------------------------------------------------------------------

function Crown() {
  return (
    <svg
      className="absolute left-1/2 -top-3 -translate-x-1/2 rpg-crown z-20"
      width="34"
      height="18"
      viewBox="0 0 34 18"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <path
        d="M2 14 L2 8 L8 12 L13 4 L17 10 L21 4 L26 12 L32 8 L32 14 Z"
        fill="#facc15"
        stroke="#a16207"
        strokeWidth="1"
      />
      <rect x="2" y="13" width="30" height="2" fill="#a16207" />
      <circle cx="13" cy="6" r="1.2" fill="#dc2626" />
      <circle cx="17" cy="9" r="1.2" fill="#2563eb" />
      <circle cx="21" cy="6" r="1.2" fill="#16a34a" />
    </svg>
  );
}

function LeaderBanner() {
  return (
    <div
      className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 rpg-banner pointer-events-none"
      aria-hidden
    >
      <svg width="62" height="22" viewBox="0 0 62 22" shapeRendering="crispEdges">
        {/* Pole */}
        <rect x="30" y="0" width="2" height="22" fill="#52525b" />
        {/* Banner */}
        <path d="M8 2 L32 2 L32 16 L8 16 L12 9 Z" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="1" />
        <path d="M14 6 L18 9 L14 12 Z" fill="#fde047" />
      </svg>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div
      className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
      aria-hidden
    >
      <div className="relative">
        <svg width="40" height="22" viewBox="0 0 40 22" shapeRendering="crispEdges">
          <rect x="2" y="2" width="36" height="14" fill="#fafafa" stroke="#71717a" strokeWidth="1.5" />
          <rect x="14" y="16" width="3" height="2" fill="#fafafa" stroke="#71717a" strokeWidth="1" />
          <rect x="11" y="18" width="3" height="2" fill="#fafafa" stroke="#71717a" strokeWidth="1" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center gap-0.5 -mt-2 text-[10px] font-bold text-zinc-700 leading-none">
          <span className="rpg-think-dot-1">•</span>
          <span className="rpg-think-dot-2">•</span>
          <span className="rpg-think-dot-3">•</span>
        </div>
      </div>
    </div>
  );
}

function Zzz() {
  return (
    <div
      className="absolute -top-1 right-2 z-20 pointer-events-none font-mono text-[10px] font-bold text-zinc-300 rpg-zzz"
      aria-hidden
    >
      Zzz
    </div>
  );
}

function VictoryStar() {
  return (
    <div className="absolute inset-0 pointer-events-none z-20" aria-hidden>
      <svg
        className="absolute -top-3 left-1/2 -translate-x-1/2 rpg-victory text-yellow-300"
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="currentColor"
      >
        <path d="M11 1 L13.5 8 L21 8 L15 12.5 L17.5 20 L11 15.5 L4.5 20 L7 12.5 L1 8 L8.5 8 Z" />
      </svg>
      <svg
        className="absolute top-2 right-1 rpg-victory text-yellow-200"
        style={{ animationDelay: "300ms" }}
        width="14"
        height="14"
        viewBox="0 0 22 22"
        fill="currentColor"
      >
        <path d="M11 1 L13.5 8 L21 8 L15 12.5 L17.5 20 L11 15.5 L4.5 20 L7 12.5 L1 8 L8.5 8 Z" />
      </svg>
    </div>
  );
}

function KoIndicator() {
  return (
    <div
      className="absolute left-1/2 top-4 -translate-x-1/2 rpg-ko z-30 pointer-events-none"
      aria-hidden
    >
      <svg width="28" height="28" viewBox="0 0 28 28">
        <path
          d="M5 5 L23 23 M23 5 L5 23"
          stroke="#dc2626"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function SpawnPoof({ accent }: { accent: string }) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <circle cx="50" cy="70" r="12" fill={accent} opacity="0.6" className="rpg-poof-ring" />
      <circle
        cx="35"
        cy="65"
        r="6"
        fill={accent}
        opacity="0.5"
        className="rpg-poof-ring"
        style={{ animationDelay: "60ms" }}
      />
      <circle
        cx="65"
        cy="65"
        r="6"
        fill={accent}
        opacity="0.5"
        className="rpg-poof-ring"
        style={{ animationDelay: "120ms" }}
      />
    </svg>
  );
}

function SvgParticleBurst({ arr }: { arr: Particle[] }) {
  return (
    <>
      {arr.map((p) => (
        <div
          key={p.id}
          className="absolute left-1/2 top-1/2 pointer-events-none rpg-particle z-10"
          style={
            {
              transform: "translate(-50%, -50%)",
              ["--dx" as never]: `${p.dx}px`,
              ["--dy" as never]: `${p.dy}px`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        >
          <ParticleShape shape={p.shape} color={p.color} />
        </div>
      ))}
    </>
  );
}

function ParticleShape({
  shape,
  color,
}: {
  shape: Particle["shape"];
  color: string;
}) {
  if (shape === "tri") {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8">
        <path d="M4 0 L8 8 L0 8 Z" fill={color} />
      </svg>
    );
  }
  if (shape === "star") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill={color} />
      </svg>
    );
  }
  // spark — small jagged
  return (
    <svg width="9" height="9" viewBox="0 0 9 9">
      <path
        d="M4.5 0 L5.5 3.5 L9 4.5 L5.5 5.5 L4.5 9 L3.5 5.5 L0 4.5 L3.5 3.5 Z"
        fill={color}
      />
    </svg>
  );
}

function ToolRibbon({ pop }: { pop: Pop }) {
  return (
    <div
      className={classNames(
        "absolute left-1/2 top-1/2 z-30 pointer-events-none whitespace-nowrap rpg-ribbon",
      )}
      style={
        {
          ["--tx" as never]: `calc(-50% + ${pop.x}px)`,
          ["--ty" as never]: `calc(-50% + ${pop.y}px)`,
          transform: `translate(calc(-50% + ${pop.x}px), calc(-50% + ${pop.y}px))`,
        } as React.CSSProperties
      }
    >
      <div
        className={classNames(
          "inline-flex items-center gap-1 rounded-sm border-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider shadow-[2px_2px_0_rgba(0,0,0,0.5)]",
          pop.isError
            ? "bg-red-900 border-red-300 text-red-100"
            : "bg-zinc-900 border-amber-300 text-amber-100",
        )}
      >
        <span className={pop.isError ? "text-red-200" : "text-amber-200"}>
          <ToolGlyph name={pop.toolName} size={12} />
        </span>
        <span>{pop.tool}</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Name plate
// ----------------------------------------------------------------------

function NamePlate({
  actor,
  cls,
  isLeader,
  hp,
  hpMax,
  phase,
  hasTodos,
}: {
  actor: AgentActor;
  cls: RpgClass;
  isLeader: boolean;
  hp: number;
  hpMax: number;
  phase: Phase;
  hasTodos: boolean;
}) {
  const def = CLASS_DEFS[cls];
  const hpPct =
    hpMax > 0 ? Math.max(0, Math.min(1, hp / hpMax)) : 0;
  const hpColor =
    phase === "failed"
      ? "bg-red-500"
      : phase === "done"
        ? "bg-emerald-500"
        : hpPct > 0.5
          ? "bg-emerald-500"
          : hpPct > 0.25
            ? "bg-amber-400"
            : "bg-red-500";

  const status = rpgStatusLabel(cls, phase, isLeader);
  return (
    <div
      className={classNames(
        "mt-1 flex flex-col items-center gap-0.5 rounded-sm border-2 px-2 py-1 bg-zinc-900/90 shadow-[2px_2px_0_rgba(0,0,0,0.5)]",
        isLeader ? "border-amber-300" : "border-zinc-600",
      )}
      style={isLeader ? { minWidth: 130 } : { minWidth: 110 }}
    >
      <div className="flex items-center justify-between gap-1.5 w-full">
        {isLeader ? (
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-300">
            Party Leader
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-300">
            <ClassIcon cls={cls} color={def.accent} />
            <span>{cls}</span>
          </div>
        )}
        <div
          className={classNames(
            "text-[8px] font-bold uppercase tracking-[0.18em]",
            status.color,
          )}
        >
          {status.label}
        </div>
      </div>

      <div className="flex items-center gap-1 max-w-full">
        <span className="font-mono text-[11px] text-zinc-100 truncate max-w-[8rem]">
          {actor.nickname}
        </span>
        {actor.subagentType && !isLeader && (
          <span className="font-mono text-[9px] text-zinc-500 truncate max-w-[6rem]">
            · {actor.subagentType}
          </span>
        )}
      </div>

      {/* TODO progress bar (real data, only shown when agent has todos) */}
      {hasTodos && (
        <div className="flex items-center gap-1 w-full">
          <span className="text-[8px] font-bold text-zinc-400">TODO</span>
          <div className="relative flex-1 h-1.5 bg-zinc-800 border border-zinc-700">
            <div
              className={classNames("absolute left-0 top-0 bottom-0 transition-all", hpColor)}
              style={{ width: `${hpPct * 100}%` }}
            />
          </div>
          <span className="font-mono text-[8px] text-zinc-400 tabular-nums">
            {hp}/{hpMax}
          </span>
        </div>
      )}
      {!hasTodos && (
        <span className="font-mono text-[8px] text-zinc-600">
          {actor.toolCount} tool{actor.toolCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function ClassIcon({ cls, color }: { cls: RpgClass; color: string }) {
  // Tiny SVG class glyph
  switch (cls) {
    case "Warrior":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 8 L8 2 M5 1 L9 1 L9 5" stroke={color} strokeWidth="1.4" fill="none" />
        </svg>
      );
    case "Mage":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M5 1 L6 4 L9 4 L6.5 6 L7.5 9 L5 7 L2.5 9 L3.5 6 L1 4 L4 4 Z" fill={color} />
        </svg>
      );
    case "Archer":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 1 Q9 5 2 9" stroke={color} strokeWidth="1.2" fill="none" />
          <path d="M2 1 L2 9" stroke={color} strokeWidth="0.6" />
        </svg>
      );
    case "Cleric":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="4" y="1" width="2" height="8" fill={color} />
          <rect x="1" y="4" width="8" height="2" fill={color} />
        </svg>
      );
    case "Rogue":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 8 L7 3 L8 4 L3 9 Z" fill={color} />
          <rect x="6" y="2" width="2.5" height="1.4" fill={color} />
        </svg>
      );
    case "Tank":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M5 1 L9 2 L9 6 Q5 9 1 6 L1 2 Z" fill={color} />
        </svg>
      );
  }
}

// ----------------------------------------------------------------------
// HUD + coin animations
// ----------------------------------------------------------------------

function RpgHud({
  usage,
  actors,
}: {
  usage: SessionUsage | null;
  actors: AgentActor[];
}) {
  const tokens = usage?.tokens ?? 0;
  const cost = usage?.cost ?? 0;
  const turns = usage?.turns ?? 0;
  const input = usage?.input ?? 0;
  const output = usage?.output ?? 0;
  const cacheRead = usage?.cacheRead ?? 0;
  const cacheWrite = usage?.cacheWrite ?? 0;
  const cacheHit = usage?.cacheHitRate ?? 0;
  const partySize = actors.length;

  return (
    <div
      id="rpg-hud-anchor"
      className="absolute top-3 right-3 z-30 flex items-start gap-2 select-none pointer-events-none"
    >
      <div className="flex flex-col items-end gap-1.5">
        {/* Big coin total + cost */}
        <div className="rounded-md border-2 border-amber-400/60 bg-zinc-950/95 px-3 py-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.5)] min-w-[160px]">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-[8px] uppercase tracking-[0.25em] text-amber-300/80">
                Coins
              </div>
              <div className="flex items-baseline gap-1.5 font-mono mt-0.5">
                <span className="text-amber-300 text-lg leading-none">🪙</span>
                <span className="text-amber-100 font-bold text-lg leading-none tabular-nums">
                  {formatTokens(tokens)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[8px] uppercase tracking-[0.25em] text-emerald-300/80">
                Cost
              </div>
              <div className="flex items-baseline gap-1 font-mono mt-0.5 justify-end">
                <span className="text-emerald-300 text-base leading-none">
                  💰
                </span>
                <span className="text-emerald-100 font-bold text-base leading-none tabular-nums">
                  {formatUsd(cost)}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono">
            <div className="flex items-center justify-between text-blue-300">
              <span className="text-zinc-500 uppercase tracking-wider">in</span>
              <span className="tabular-nums">{formatTokens(input)}</span>
            </div>
            <div className="flex items-center justify-between text-violet-300">
              <span className="text-zinc-500 uppercase tracking-wider">out</span>
              <span className="tabular-nums">{formatTokens(output)}</span>
            </div>
            <div className="flex items-center justify-between text-amber-200">
              <span className="text-zinc-500 uppercase tracking-wider">$cache</span>
              <span className="tabular-nums">{formatTokens(cacheRead)}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-zinc-500 uppercase tracking-wider">$write</span>
              <span className="tabular-nums">{formatTokens(cacheWrite)}</span>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-zinc-500">
            <span>cache hit {Math.round(cacheHit * 100)}%</span>
            <span>{turns} turns</span>
          </div>
        </div>

        {/* Party size mini-plate */}
        <div className="rounded-md border-2 border-zinc-600 bg-zinc-950/95 px-2.5 py-1 shadow-[2px_2px_0_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] uppercase tracking-[0.25em] text-zinc-400">
              Party
            </span>
            <span className="font-mono text-zinc-100 font-bold text-sm leading-none tabular-nums">
              {partySize}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestLog({ actors }: { actors: AgentActor[] }) {
  const lead = actors.find((a) => a.isOrchestrator);
  // Prefer lead's todos; fall back to any subagent that has todos if the lead doesn't.
  const owner =
    lead?.todos && lead.todos.total > 0
      ? lead
      : actors.find((a) => a.todos && a.todos.total > 0);
  const todos = owner?.todos;
  if (!todos || todos.total === 0) return null;

  const display =
    todos.items && todos.items.length > 0 ? todos.items : null;
  const pct = Math.round((todos.completed / todos.total) * 100);

  return (
    <div className="absolute top-3 left-3 z-30 w-72 max-w-[40vw] select-none pointer-events-auto">
      <div className="rounded-md border-2 border-amber-400/40 bg-zinc-950/95 shadow-[2px_2px_0_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-2.5 py-1 border-b-2 border-amber-400/20">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.25em] text-amber-300">
            <span aria-hidden>📜</span>
            <span>Quest Log</span>
          </div>
          <div className="font-mono text-[10px] text-zinc-300 tabular-nums">
            {todos.completed}/{todos.total} · {pct}%
          </div>
        </div>
        <div className="px-2 py-1">
          <div className="h-1.5 rounded-sm bg-zinc-800 border border-zinc-700 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        </div>
        {display && (
          <ul className="px-2 pb-1.5 max-h-56 overflow-auto">
            {display.map((t, i) => (
              <li key={i} className="flex items-start gap-1.5 py-0.5">
                <span
                  aria-hidden
                  className={classNames(
                    "mt-0.5 size-3 rounded-sm border-2 shrink-0 inline-flex items-center justify-center text-[8px] font-bold",
                    t.status === "completed"
                      ? "bg-emerald-500/30 border-emerald-400 text-emerald-200"
                      : t.status === "in_progress"
                        ? "bg-amber-500/30 border-amber-400 text-amber-100 animate-pulse"
                        : "bg-zinc-800 border-zinc-600 text-transparent",
                  )}
                >
                  {t.status === "completed" ? "✓" : t.status === "in_progress" ? "▶" : ""}
                </span>
                <span
                  className={classNames(
                    "text-[11px] leading-snug",
                    t.status === "completed"
                      ? "text-zinc-500 line-through"
                      : t.status === "in_progress"
                        ? "text-amber-100"
                        : "text-zinc-300",
                  )}
                >
                  {t.label}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!display && (
          <div className="px-2.5 pb-2 text-[10px] text-zinc-500 italic">
            {todos.active ?? "in progress"}
          </div>
        )}
      </div>
    </div>
  );
}

function CoinFly({ actorId }: { actorId: string }) {
  // The coin starts at the character's last known DOM position and animates
  // toward the HUD anchor in the top-right. We measure once on mount.
  const [coords, setCoords] = useState<
    { x: number; y: number; ex: number; ey: number } | null
  >(null);
  useEffect(() => {
    const charEl = document.querySelector(
      `[data-rpg-actor="${actorId}"]`,
    ) as HTMLElement | null;
    const hudEl = document.getElementById("rpg-hud-anchor");
    if (!charEl || !hudEl) return;
    const cb = charEl.getBoundingClientRect();
    const hb = hudEl.getBoundingClientRect();
    setCoords({
      x: cb.left + cb.width / 2,
      y: cb.top + cb.height / 2,
      ex: hb.left + 20,
      ey: hb.top + 30,
    });
  }, [actorId]);

  if (!coords) return null;
  const dx = coords.ex - coords.x;
  const dy = coords.ey - coords.y;
  return (
    <div
      className="fixed z-40 pointer-events-none text-2xl"
      style={
        {
          left: coords.x,
          top: coords.y,
          animation: "rpg-coin-fly 1s cubic-bezier(0.5, 0, 0.75, 1) forwards",
          ["--coin-dx" as never]: `${dx}px`,
          ["--coin-dy" as never]: `${dy}px`,
        } as React.CSSProperties
      }
    >
      🪙
    </div>
  );
}

// ----------------------------------------------------------------------
// RPG status flavor
// ----------------------------------------------------------------------

function RpgHoverCard({
  actor,
  cls,
  phase,
  isLeader,
}: {
  actor: AgentActor;
  cls: RpgClass;
  phase: Phase;
  isLeader: boolean;
}) {
  const status = rpgStatusLabel(cls, phase, isLeader);
  const last = actor.lastActivity;
  const [side, setSide] = useState<"top" | "bottom" | "left" | "right">(
    "top",
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  // Pick the side with the most empty space relative to the viewport edges.
  // Re-measure on mount and on window resize.
  useEffect(() => {
    const compute = () => {
      const el = wrapRef.current?.parentElement;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = r.top;
      const bottom = window.innerHeight - r.bottom;
      const left = r.left;
      const right = window.innerWidth - r.right;
      const max = Math.max(top, bottom, left, right);
      if (max === top) setSide("top");
      else if (max === bottom) setSide("bottom");
      else if (max === left) setSide("left");
      else setSide("right");
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, []);

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

  const sidePos =
    side === "top"
      ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
      : side === "bottom"
        ? "top-full mt-2 left-1/2 -translate-x-1/2"
        : side === "left"
          ? "right-full mr-2 top-1/2 -translate-y-1/2"
          : "left-full ml-2 top-1/2 -translate-y-1/2";

  return (
    <div
      ref={wrapRef}
      role="tooltip"
      className={classNames(
        "absolute z-50 w-56 pointer-events-none",
        sidePos,
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-100",
      )}
    >
      <div className="rounded-md border-2 border-amber-400/60 bg-zinc-950 shadow-[3px_3px_0_rgba(0,0,0,0.7)] px-3 py-2 text-[11px]">
        <div className="flex items-center justify-between gap-1.5 mb-1.5 pb-1.5 border-b-2 border-amber-400/20">
          <div className="flex items-center gap-1.5">
            <span className="font-bold uppercase tracking-[0.18em] text-amber-300 text-[10px]">
              {isLeader ? "Party Leader" : cls}
            </span>
          </div>
          <span
            className={classNames(
              "text-[9px] font-bold uppercase tracking-[0.18em]",
              status.color,
            )}
          >
            {status.label}
          </span>
        </div>
        <div className="font-mono text-zinc-100 text-[12px] mb-1.5">
          {actor.nickname}
          {actor.subagentType && !isLeader && (
            <span className="text-zinc-500"> · {actor.subagentType}</span>
          )}
        </div>
        {actor.description && (
          <div className="mb-1.5">
            <div className="text-[9px] uppercase tracking-wider text-amber-200/70 mb-0.5">
              ❖ Quest
            </div>
            <div className="text-zinc-200 leading-snug line-clamp-3">
              {actor.description}
            </div>
          </div>
        )}
        {last && (
          <div className="mb-1.5">
            <div className="text-[9px] uppercase tracking-wider text-amber-200/70 mb-0.5">
              ⚔ Last move
            </div>
            <div className="font-mono text-zinc-200 truncate">
              {last.toolName ?? last.title}
            </div>
          </div>
        )}
        {actor.todos && actor.todos.total > 0 && (
          <div className="mb-1.5">
            <div className="text-[9px] uppercase tracking-wider text-amber-200/70 mb-0.5">
              📜 Quest log
            </div>
            <div className="text-zinc-300">
              {actor.todos.completed}/{actor.todos.total} done
              {actor.todos.active && (
                <span className="text-zinc-500"> · {actor.todos.active}</span>
              )}
            </div>
          </div>
        )}
        <div className="mt-1.5 pt-1.5 border-t-2 border-amber-400/20 flex items-center justify-between font-mono text-zinc-500 text-[10px]">
          <span>{actor.toolCount} actions</span>
          <span>spawned {elapsed} ago</span>
        </div>
      </div>
    </div>
  );
}

export function rpgStatusLabel(
  cls: RpgClass,
  phase: Phase,
  isLeader: boolean,
): { label: string; color: string } {
  if (phase === "done") return { label: "Victory!", color: "text-emerald-300" };
  if (phase === "failed") return { label: "Fallen", color: "text-red-300" };
  if (phase === "abandoned")
    return { label: "Vanished", color: "text-zinc-500" };
  if (phase === "thinking")
    return {
      label: isLeader ? "Plotting" : "Scheming",
      color: "text-blue-300",
    };
  if (phase === "busy") {
    if (isLeader) return { label: "Commanding", color: "text-amber-300" };
    switch (cls) {
      case "Warrior":
        return { label: "Slashing", color: "text-amber-300" };
      case "Mage":
        return { label: "Casting", color: "text-violet-300" };
      case "Cleric":
        return { label: "Healing", color: "text-yellow-200" };
      case "Archer":
        return { label: "Loosing", color: "text-emerald-300" };
      case "Rogue":
        return { label: "Sneaking", color: "text-zinc-300" };
      case "Tank":
        return { label: "Bracing", color: "text-sky-300" };
    }
  }
  return { label: "Ready", color: "text-zinc-400" };
}
