import type { AgentKind } from "@shared/events.ts";

export const AGENT_META: Record<
  AgentKind,
  { label: string; dotClass: string; activeClass: string }
> = {
  "claude-code": {
    label: "Claude Code",
    dotClass: "bg-amber-500",
    activeClass: "text-amber-300 border-amber-500/60 bg-amber-500/10",
  },
  codex: {
    label: "Codex",
    dotClass: "bg-emerald-400",
    activeClass: "text-emerald-300 border-emerald-500/60 bg-emerald-500/10",
  },
};
