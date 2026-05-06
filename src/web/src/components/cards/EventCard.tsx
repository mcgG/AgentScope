import type { AgentEvent } from "@shared/events.ts";
import { TerminalCard } from "./TerminalCard.tsx";
import { FileOperationCard } from "./FileOperationCard.tsx";
import { GenericToolCard } from "./GenericToolCard.tsx";
import { UserPromptCard } from "./UserPromptCard.tsx";
import { SessionLifecycleCard } from "./SessionLifecycleCard.tsx";

export function EventCard({ event }: { event: AgentEvent }) {
  if (
    event.eventType === "session_started" ||
    event.eventType === "session_ended"
  ) {
    return <SessionLifecycleCard event={event} />;
  }
  if (event.eventType === "user_prompt") {
    return <UserPromptCard event={event} />;
  }
  const name = event.toolName?.toLowerCase() ?? "";
  if (name === "bash" || name.includes("bash")) {
    return <TerminalCard event={event} />;
  }
  if (
    name === "read" ||
    name === "write" ||
    name === "edit" ||
    name === "multiedit" ||
    name.includes("read") ||
    name.includes("write") ||
    name.includes("edit")
  ) {
    return <FileOperationCard event={event} />;
  }
  return <GenericToolCard event={event} />;
}
