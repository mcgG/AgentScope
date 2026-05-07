import type { AgentEvent } from "@shared/events.ts";
import { TerminalCard } from "./TerminalCard.tsx";
import { FileOperationCard } from "./FileOperationCard.tsx";
import { GenericToolCard } from "./GenericToolCard.tsx";
import { UserPromptCard } from "./UserPromptCard.tsx";
import { SessionLifecycleCard } from "./SessionLifecycleCard.tsx";
import { BrowserCard } from "./BrowserCard.tsx";
import { WebSearchCard } from "./WebSearchCard.tsx";
import { WebFetchCard } from "./WebFetchCard.tsx";
import { AgentCard } from "./AgentCard.tsx";
import { TodoWriteCard } from "./TodoWriteCard.tsx";
import { NotificationCard } from "./NotificationCard.tsx";

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
  if (event.eventType === "notification") {
    return <NotificationCard event={event} />;
  }
  const name = event.toolName ?? "";
  const lower = name.toLowerCase();

  if (name === "TodoWrite") {
    return <TodoWriteCard event={event} />;
  }
  if (name === "WebSearch") {
    return <WebSearchCard event={event} />;
  }
  if (name === "WebFetch") {
    return <WebFetchCard event={event} />;
  }
  if (
    name === "Task" ||
    name === "Agent" ||
    name === "spawn_agent" ||
    name === "wait_agent"
  ) {
    return <AgentCard event={event} />;
  }
  if (
    name.startsWith("mcp__Claude_in_Chrome__") ||
    name.startsWith("mcp__claude-in-chrome__") ||
    name.startsWith("mcp__playwright__") ||
    name.startsWith("mcp__Claude_Preview__")
  ) {
    return <BrowserCard event={event} />;
  }
  if (lower === "bash" || lower.includes("bash")) {
    return <TerminalCard event={event} />;
  }
  if (
    name === "Read" ||
    name === "Write" ||
    name === "Edit" ||
    name === "MultiEdit" ||
    lower.includes("read") ||
    lower.includes("write") ||
    lower.includes("edit")
  ) {
    return <FileOperationCard event={event} />;
  }
  return <GenericToolCard event={event} />;
}
