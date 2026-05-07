import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent } from "@shared/events.ts";
import type { AgentActor } from "../PlaygroundView.tsx";
import { classNames } from "../../utils.ts";

// ---------- helpers ----------

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Deterministic 0..1 from seed + salt.
function rand(seed: string, salt: string): number {
  const h = hash(seed + ":" + salt);
  // Multiply with a large prime to scramble bits, fold to 0..1.
  return ((h * 9301 + 49297) % 233280) / 233280;
}

// Soft glowing palette — paired { core, glow } colors.
const PALETTE: Array<{ core: string; glow: string; tint: string }> = [
  { core: "#7dd3fc", glow: "rgba(125,211,252,0.55)", tint: "#bae6fd" }, // sky
  { core: "#a5f3fc", glow: "rgba(165,243,252,0.55)", tint: "#cffafe" }, // cyan
  { core: "#c4b5fd", glow: "rgba(196,181,253,0.55)", tint: "#ddd6fe" }, // violet
  { core: "#f0abfc", glow: "rgba(240,171,252,0.55)", tint: "#f5d0fe" }, // fuchsia
  { core: "#fda4af", glow: "rgba(253,164,175,0.55)", tint: "#fecdd3" }, // rose
  { core: "#fde68a", glow: "rgba(253,230,138,0.55)", tint: "#fef3c7" }, // amber
  { core: "#86efac", glow: "rgba(134,239,172,0.55)", tint: "#bbf7d0" }, // emerald
  { core: "#a7f3d0", glow: "rgba(167,243,208,0.55)", tint: "#d1fae5" }, // teal
];

function paletteFor(seed: string): { core: string; glow: string; tint: string } {
  return PALETTE[hash(seed) % PALETTE.length]!;
}

// Three "creature shapes" we can pick deterministically per subagent.
type CreatureKind = "fish" | "orb" | "jelly";
const KINDS: CreatureKind[] = ["fish", "orb", "jelly"];

function kindFor(seed: string): CreatureKind {
  return KINDS[hash(seed + "kind") % KINDS.length]!;
}

// ---------- types ----------

type Bubble = {
  id: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
};

type ToolPop = {
  id: number;
  label: string;
  side: "left" | "right";
};

// ---------- scene ----------

export function AquariumScene({
  actors,
  actionPulse,
}: {
  actors: AgentActor[];
  actionPulse: Record<string, number>;
}) {
  const orchestrator = actors.find((a) => a.isOrchestrator);
  const subagents = actors.filter((a) => !a.isOrchestrator);

  return (
    <div className="absolute inset-0 aq-tank overflow-hidden">
      {/* Godrays */}
      <div className="absolute inset-0 pointer-events-none aq-godrays" aria-hidden />
      {/* Drifting ambient bubbles */}
      <AmbientBubbles />

      {/* Connector lines from orchestrator center to each subagent. Drawn
          behind creatures, very faint. */}
      {orchestrator && subagents.length > 0 && (
        <ConnectorGlow subagents={subagents} />
      )}

      {/* Subagent creatures */}
      {subagents.map((actor, i) => (
        <Creature
          key={actor.id}
          actor={actor}
          pulseAt={actionPulse[actor.id]}
          index={i}
          total={subagents.length}
        />
      ))}

      {/* Orchestrator centerpiece (rendered on top) */}
      {orchestrator && (
        <OrchestratorJelly
          actor={orchestrator}
          pulseAt={actionPulse[orchestrator.id]}
        />
      )}
    </div>
  );
}

// ---------- ambient bubbles (background drift) ----------

function AmbientBubbles() {
  // Pre-generate a fixed set of slow-drifting bubbles. Cheap and decorative.
  const bubbles = useMemo(() => {
    const out: Array<{
      left: number;
      size: number;
      delay: number;
      dur: number;
      drift: number;
    }> = [];
    for (let i = 0; i < 18; i++) {
      out.push({
        left: rand("amb", String(i)) * 100,
        size: 3 + rand("amb-s", String(i)) * 6,
        delay: rand("amb-d", String(i)) * 14,
        dur: 14 + rand("amb-u", String(i)) * 16,
        drift: (rand("amb-x", String(i)) - 0.5) * 60,
      });
    }
    return out;
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {bubbles.map((b, i) => (
        <span
          key={i}
          className="absolute rounded-full aq-ambient-bubble"
          style={
            {
              left: `${b.left}%`,
              bottom: `-20px`,
              width: `${b.size}px`,
              height: `${b.size}px`,
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.delay}s`,
              ["--aq-drift" as never]: `${b.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ---------- soft connector lines ----------

function ConnectorGlow({ subagents }: { subagents: AgentActor[] }) {
  // Just a faint radial halo behind the orchestrator that grows when subagents
  // exist. We do not draw exact lines (they fight with random motion) — this
  // gives a gentle "they belong to it" feel without fighting the wandering.
  const intensity = Math.min(0.2 + subagents.length * 0.04, 0.5);
  return (
    <div
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        top: "12%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "60vmin",
        height: "60vmin",
        background: `radial-gradient(circle, rgba(125,211,252,${intensity}) 0%, transparent 65%)`,
        filter: "blur(20px)",
      }}
    />
  );
}

// ---------- orchestrator jellyfish ----------

function OrchestratorJelly({
  actor,
  pulseAt,
}: {
  actor: AgentActor;
  pulseAt: number | undefined;
}) {
  const phase = derivePhase(actor);
  const palette = { core: "#a5f3fc", glow: "rgba(165,243,252,0.7)", tint: "#cffafe" };

  const { bubbles, pops, glowing } = usePulseEffects(actor, pulseAt);

  return (
    <div
      className="absolute left-1/2 top-[14%] -translate-x-1/2 -translate-y-1/2 select-none aq-jelly-drift"
      style={{ width: 220, height: 220 }}
    >
      {/* Glow halo */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${palette.glow} 0%, transparent 60%)`,
          filter: glowing ? "brightness(1.6)" : "brightness(1)",
          transition: "filter 240ms ease-out",
        }}
      />

      {/* SVG creature */}
      <svg
        viewBox="0 0 200 220"
        className={classNames(
          "absolute inset-0 w-full h-full aq-bell-bob",
          phase === "failed" && "aq-tint-fail",
          phase === "abandoned" && "opacity-40",
          phase === "done" && "opacity-70",
        )}
        aria-hidden
      >
        <defs>
          <radialGradient id="orc-bell" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ecfeff" stopOpacity="0.95" />
            <stop offset="55%" stopColor={palette.core} stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity="0.6" />
          </radialGradient>
          <linearGradient id="orc-tent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.core} stopOpacity="0.7" />
            <stop offset="100%" stopColor={palette.core} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Tentacles — drawn before bell so they appear behind */}
        <g className="aq-tentacles">
          {Array.from({ length: 9 }).map((_, i) => {
            const x = 40 + i * 15;
            return (
              <path
                key={i}
                d={`M ${x} 95 Q ${x - 3} 130, ${x + 2} 160 T ${x - 1} 205`}
                stroke="url(#orc-tent)"
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                style={{
                  animation: `aq-tent-wave ${3 + (i % 3) * 0.5}s ease-in-out ${i * 0.12}s infinite`,
                  transformOrigin: `${x}px 95px`,
                }}
              />
            );
          })}
        </g>

        {/* Bell */}
        <ellipse cx="100" cy="80" rx="80" ry="55" fill="url(#orc-bell)" />
        {/* Bell highlight */}
        <ellipse
          cx="78"
          cy="55"
          rx="22"
          ry="9"
          fill="white"
          opacity="0.45"
        />
        {/* Inner bioluminescent dots */}
        <circle cx="100" cy="78" r="6" fill="#ecfeff" opacity="0.7">
          <animate
            attributeName="opacity"
            values="0.4;0.95;0.4"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="74" cy="84" r="3" fill="#ecfeff" opacity="0.5">
          <animate
            attributeName="opacity"
            values="0.3;0.8;0.3"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="128" cy="86" r="3.5" fill="#ecfeff" opacity="0.5">
          <animate
            attributeName="opacity"
            values="0.3;0.8;0.3"
            dur="2.8s"
            begin="0.6s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>

      {/* Pulse bubbles */}
      <BubbleBurst bubbles={bubbles} />

      {/* Tool name pops */}
      <ToolPops pops={pops} />

      {/* Crown badge + nickname */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 flex flex-col items-center pointer-events-none">
        <div className="rounded-full bg-blue-500/15 border border-blue-400/40 text-blue-100 px-2 py-px text-[9px] uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(125,211,252,0.4)]">
          Lead
        </div>
        <div className="mt-1 text-[11px] font-mono text-cyan-100/90">
          {actor.nickname}
        </div>
      </div>
    </div>
  );
}

// ---------- subagent creature ----------

function Creature({
  actor,
  pulseAt,
  index,
  total,
}: {
  actor: AgentActor;
  pulseAt: number | undefined;
  index: number;
  total: number;
}) {
  const phase = derivePhase(actor);
  const palette = paletteFor(actor.id);
  const kind = kindFor(actor.id);

  // Wandering path parameters — stable per actor, evenly distributed angle.
  const params = useMemo(() => {
    const baseAngle = (index / Math.max(total, 1)) * Math.PI * 2;
    const radius = 28 + rand(actor.id, "r") * 14; // % of viewport
    const cx = 50 + Math.cos(baseAngle) * radius * 0.9;
    const cy = 50 + Math.sin(baseAngle) * radius * 0.55 + 8; // pull below midline
    const driftX = 6 + rand(actor.id, "dx") * 10;
    const driftY = 4 + rand(actor.id, "dy") * 8;
    const dur = 18 + rand(actor.id, "du") * 16;
    const delay = -rand(actor.id, "de") * dur; // negative delay so they don't sync
    const flip = rand(actor.id, "fl") > 0.5 ? -1 : 1;
    return { cx, cy, driftX, driftY, dur, delay, flip };
  }, [actor.id, index, total]);

  const { bubbles, pops, glowing } = usePulseEffects(actor, pulseAt);

  // Abandoned creatures sink slowly. We use a CSS class instead of changing
  // top so transitions don't fight the keyframes; just drop the wrapper.
  const slow = phase === "done" || phase === "abandoned";

  return (
    <div
      className={classNames(
        "absolute pointer-events-none aq-spawn-in",
        phase === "abandoned" && "aq-sink",
      )}
      style={
        {
          left: `${params.cx}%`,
          top: `${params.cy}%`,
          transform: "translate(-50%, -50%)",
          ["--aq-dx" as never]: `${params.driftX}vmin`,
          ["--aq-dy" as never]: `${params.driftY}vmin`,
        } as React.CSSProperties
      }
    >
      {/* Wandering wrapper */}
      <div
        className={classNames(
          phase !== "abandoned" && "aq-wander",
          slow && "aq-wander-slow",
        )}
        style={{
          animationDuration: `${slow ? params.dur * 1.6 : params.dur}s`,
          animationDelay: `${params.delay}s`,
        }}
      >
        {/* Bobbing wrapper */}
        <div
          className="aq-bob"
          style={{
            animationDuration: `${3 + rand(actor.id, "bob") * 2}s`,
            transform: `scaleX(${params.flip})`,
          }}
        >
          <div
            className="relative"
            style={{
              filter: glowing
                ? `drop-shadow(0 0 12px ${palette.glow}) brightness(1.4)`
                : `drop-shadow(0 0 6px ${palette.glow})`,
              transition: "filter 240ms ease-out",
              opacity:
                phase === "done"
                  ? 0.55
                  : phase === "abandoned"
                    ? 0.3
                    : phase === "idle"
                      ? 0.85
                      : 1,
            }}
          >
            {kind === "fish" && <FishSvg palette={palette} />}
            {kind === "orb" && <OrbSvg palette={palette} />}
            {kind === "jelly" && <MiniJellySvg palette={palette} />}

            {/* Bubble burst on tool fire */}
            <BubbleBurst bubbles={bubbles} />
            {/* Floating tool icon labels */}
            <ToolPops pops={pops} />

            {/* Failure tint overlay */}
            {phase === "failed" && (
              <div className="absolute inset-0 aq-fail-flash pointer-events-none rounded-full" />
            )}
          </div>
        </div>

        {/* Name label — outside the scaleX so text isn't mirrored */}
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-1 text-[10px] font-mono whitespace-nowrap text-cyan-100/80"
          style={{ top: "100%" }}
        >
          {actor.nickname}
        </div>
      </div>
    </div>
  );
}

// ---------- creature SVGs ----------

function FishSvg({ palette }: { palette: { core: string; tint: string } }) {
  return (
    <svg
      viewBox="0 0 100 60"
      width={70}
      height={42}
      aria-hidden
      className="block"
    >
      <defs>
        <radialGradient id={`fish-body-${palette.core}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={palette.tint} stopOpacity="0.95" />
          <stop offset="100%" stopColor={palette.core} stopOpacity="0.6" />
        </radialGradient>
      </defs>
      {/* Tail */}
      <path
        d="M 10 30 L 0 12 L 0 48 Z"
        fill={palette.core}
        opacity="0.55"
        className="aq-fin"
      />
      {/* Body */}
      <ellipse
        cx="55"
        cy="30"
        rx="38"
        ry="18"
        fill={`url(#fish-body-${palette.core})`}
      />
      {/* Top fin */}
      <path
        d="M 50 14 Q 60 4, 70 14 Q 60 16, 50 14"
        fill={palette.core}
        opacity="0.6"
      />
      {/* Eye */}
      <circle cx="78" cy="28" r="3" fill="#0c0a09" />
      <circle cx="79" cy="27" r="1" fill="#fff" />
      {/* Glow dot on body */}
      <circle cx="55" cy="30" r="3" fill="#fff" opacity="0.5">
        <animate attributeName="opacity" values="0.2;0.7;0.2" dur="2.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function OrbSvg({ palette }: { palette: { core: string; tint: string } }) {
  return (
    <svg
      viewBox="0 0 80 80"
      width={56}
      height={56}
      aria-hidden
      className="block"
    >
      <defs>
        <radialGradient id={`orb-${palette.core}`} cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="40%" stopColor={palette.tint} stopOpacity="0.85" />
          <stop offset="100%" stopColor={palette.core} stopOpacity="0.4" />
        </radialGradient>
      </defs>
      <circle cx="40" cy="40" r="28" fill={`url(#orb-${palette.core})`} />
      <circle cx="32" cy="32" r="6" fill="#fff" opacity="0.6" />
      {/* Trailing wisps */}
      <path
        d="M 20 50 Q 10 60, 4 70"
        stroke={palette.core}
        strokeWidth="2"
        fill="none"
        opacity="0.5"
        strokeLinecap="round"
      />
      <path
        d="M 30 56 Q 26 66, 22 76"
        stroke={palette.core}
        strokeWidth="1.5"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MiniJellySvg({ palette }: { palette: { core: string; tint: string } }) {
  return (
    <svg
      viewBox="0 0 80 100"
      width={56}
      height={70}
      aria-hidden
      className="block"
    >
      <defs>
        <radialGradient id={`mj-${palette.core}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="60%" stopColor={palette.tint} stopOpacity="0.8" />
          <stop offset="100%" stopColor={palette.core} stopOpacity="0.4" />
        </radialGradient>
        <linearGradient id={`mj-tent-${palette.core}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.core} stopOpacity="0.7" />
          <stop offset="100%" stopColor={palette.core} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Tentacles */}
      {[18, 30, 42, 54, 66].map((x, i) => (
        <path
          key={x}
          d={`M ${x} 42 Q ${x - 2} 60, ${x + 1} 78 T ${x - 1} 96`}
          stroke={`url(#mj-tent-${palette.core})`}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          style={{
            animation: `aq-tent-wave ${2.2 + (i % 3) * 0.4}s ease-in-out ${i * 0.1}s infinite`,
            transformOrigin: `${x}px 42px`,
          }}
        />
      ))}
      {/* Bell */}
      <ellipse cx="40" cy="36" rx="32" ry="22" fill={`url(#mj-${palette.core})`} />
      {/* Highlight */}
      <ellipse cx="30" cy="26" rx="9" ry="4" fill="white" opacity="0.5" />
    </svg>
  );
}

// ---------- bubble burst ----------

function BubbleBurst({ bubbles }: { bubbles: Bubble[] }) {
  return (
    <>
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="absolute left-1/2 top-1/2 rounded-full pointer-events-none aq-burst"
          style={
            {
              width: b.size,
              height: b.size,
              background:
                "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), rgba(165,243,252,0.4) 60%, transparent 75%)",
              border: "1px solid rgba(255,255,255,0.4)",
              animationDelay: `${b.delay}ms`,
              ["--aq-bx" as never]: `${b.dx}px`,
              ["--aq-by" as never]: `${b.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

// ---------- tool pop labels ----------

function ToolPops({ pops }: { pops: ToolPop[] }) {
  return (
    <>
      {pops.map((p) => (
        <div
          key={p.id}
          className={classNames(
            "absolute top-1/2 -translate-y-1/2 pointer-events-none aq-tool-pop",
            "flex items-center gap-1 rounded-full bg-cyan-950/80 border border-cyan-400/40",
            "px-1.5 py-0.5 text-[10px] font-mono text-cyan-100 whitespace-nowrap",
            p.side === "left" ? "right-full mr-2" : "left-full ml-2",
          )}
        >
          <ToolIcon name={p.label} />
          <span>{shortToolName(p.label)}</span>
        </div>
      ))}
    </>
  );
}

function shortToolName(name: string): string {
  const t = name.replace(/^mcp__[^_]+__/, "");
  return t.length > 16 ? `${t.slice(0, 14)}…` : t;
}

// Tiny inline-SVG icon set (preferred over emoji per requirements).
function ToolIcon({ name }: { name: string }) {
  const stroke = "currentColor";
  const sw = 1.5;
  const common = {
    width: 10,
    height: 10,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "Bash") {
    return (
      <svg {...common} aria-hidden>
        <polyline points="3,5 7,8 3,11" />
        <line x1="9" y1="11" x2="13" y2="11" />
      </svg>
    );
  }
  if (name === "Read") {
    return (
      <svg {...common} aria-hidden>
        <path d="M2 4h5a2 2 0 0 1 2 2v8" />
        <path d="M14 4h-5a2 2 0 0 0-2 2v8" />
      </svg>
    );
  }
  if (name === "Write" || name === "Edit" || name === "MultiEdit") {
    return (
      <svg {...common} aria-hidden>
        <path d="M3 13l8-8 2 2-8 8H3z" />
        <line x1="11" y1="5" x2="13" y2="7" />
      </svg>
    );
  }
  if (name === "Grep" || name === "Glob") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="7" cy="7" r="4" />
        <line x1="10" y1="10" x2="13" y2="13" />
      </svg>
    );
  }
  if (name === "WebSearch" || name === "WebFetch") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="8" cy="8" r="5" />
        <ellipse cx="8" cy="8" rx="2" ry="5" />
        <line x1="3" y1="8" x2="13" y2="8" />
      </svg>
    );
  }
  if (name === "TodoWrite") {
    return (
      <svg {...common} aria-hidden>
        <polyline points="3,8 6,11 13,4" />
      </svg>
    );
  }
  if (
    name === "Agent" ||
    name === "Task" ||
    name === "spawn_agent" ||
    name === "wait_agent"
  ) {
    return (
      <svg {...common} aria-hidden>
        <path d="M8 2l1.8 3.6L13.5 6l-2.7 2.6.6 3.7L8 10.6 4.6 12.3l.6-3.7L2.5 6l3.7-.4z" />
      </svg>
    );
  }
  // Default: a wrench-y shape.
  return (
    <svg {...common} aria-hidden>
      <path d="M11 2a3 3 0 0 0-2.8 4L3 11.2V13h1.8L10 7.8A3 3 0 1 0 11 2z" />
    </svg>
  );
}

// ---------- pulse effects hook ----------

function usePulseEffects(
  actor: AgentActor,
  pulseAt: number | undefined,
): { bubbles: Bubble[]; pops: ToolPop[]; glowing: boolean } {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [pops, setPops] = useState<ToolPop[]>([]);
  const [glowing, setGlowing] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    if (!pulseAt) return;
    const ev: AgentEvent | undefined = actor.lastActivity;
    const isError =
      ev?.eventType === "tool_failed" || ev?.status === "failed";

    // Bubble burst — 5..9 bubbles around the creature.
    const count = 5 + Math.floor(Math.random() * 5);
    const newBubbles: Bubble[] = [];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI; // mostly upward
      const dist = 24 + Math.random() * 30;
      newBubbles.push({
        id: ++idRef.current,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        size: 5 + Math.random() * 7,
        delay: i * 40,
      });
    }
    setBubbles((prev) => [...prev.slice(-12), ...newBubbles]);

    // Tool pop label.
    const popId = ++idRef.current;
    const side: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
    const toolName = ev?.toolName ?? "tool";
    if (!isError) {
      setPops((prev) => [...prev.slice(-2), { id: popId, label: toolName, side }]);
    }

    // Glow pulse.
    setGlowing(true);
    const glowTimer = setTimeout(() => setGlowing(false), 700);

    // Cleanup the bubbles + pops after their animations.
    const bubbleTimer = setTimeout(() => {
      setBubbles((prev) =>
        prev.filter((b) => !newBubbles.some((nb) => nb.id === b.id)),
      );
    }, 1600);
    const popTimer = setTimeout(() => {
      setPops((prev) => prev.filter((p) => p.id !== popId));
    }, 1800);

    return () => {
      clearTimeout(glowTimer);
      clearTimeout(bubbleTimer);
      clearTimeout(popTimer);
    };
  }, [pulseAt, actor.lastActivity]);

  return { bubbles, pops, glowing };
}

// ---------- phase ----------

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
