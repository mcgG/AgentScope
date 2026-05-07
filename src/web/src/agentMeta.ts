import type { AgentSession } from "@shared/events.ts";

export type AgentKind = AgentSession["agent"] | "codex";
export type AgentFilter = "all" | AgentKind;

type AgentMeta = {
  label: string;
  short: string;
  letter: string;
  dotClass: string;
  textClass: string;
  bgSoftClass: string;
  ringClass: string;
};

const META: Record<AgentKind, AgentMeta> = {
  "claude-code": {
    label: "Claude Code",
    short: "Claude",
    letter: "C",
    dotClass: "bg-amber-500",
    textClass: "text-amber-400",
    bgSoftClass: "bg-amber-500/15",
    ringClass: "ring-amber-500/30",
  },
  codex: {
    label: "Codex",
    short: "Codex",
    letter: "X",
    dotClass: "bg-emerald-400",
    textClass: "text-emerald-400",
    bgSoftClass: "bg-emerald-400/15",
    ringClass: "ring-emerald-400/30",
  },
};

export function agentMeta(kind: AgentKind): AgentMeta {
  return META[kind] ?? META["claude-code"];
}
