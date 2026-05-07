import { nanoid } from "nanoid";
import type {
  AgentEvent,
  AgentEventType,
  AgentKind,
  AgentToolStatus,
} from "../../shared/events.ts";

export type NormalizedHookEvent = Omit<AgentEvent, "id">;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

const HOOK_TO_TYPE: Record<string, AgentEventType> = {
  SessionStart: "session_started",
  Stop: "session_ended",
  SubagentStop: "session_ended",
  UserPromptSubmit: "user_prompt",
  PreToolUse: "tool_started",
  PostToolUse: "tool_completed",
  Notification: "notification",
  PermissionRequest: "notification",
  PreCompact: "notification",
};

function inferAgentKind(raw: unknown): AgentKind {
  if (!isObj(raw)) return "claude-code";
  const explicit = str(raw.agent) ?? str(raw.source_agent);
  if (explicit === "codex" || explicit === "claude-code") return explicit;
  const transcriptPath = str(raw.transcript_path) ?? str(raw.transcriptPath);
  if (transcriptPath?.includes("/.codex/")) return "codex";
  return "claude-code";
}

export function normalizeHookPayload(
  raw: unknown,
  agent: AgentKind = inferAgentKind(raw),
): NormalizedHookEvent {
  const obj = isObj(raw) ? raw : {};
  const hookEventName =
    str(obj.hook_event_name) || str(obj.hookEventName) || "Unknown";
  const sessionId =
    str(obj.session_id) || str(obj.sessionId) || `nosess_${nanoid(8)}`;
  const cwd = str(obj.cwd);
  const toolUseId =
    str(obj.tool_use_id) ||
    str(obj.toolUseId) ||
    str(obj.tool_call_id) ||
    str(obj.toolCallId);
  const toolName = str(obj.tool_name) || str(obj.toolName);
  const input = obj.tool_input ?? obj.toolInput ?? obj.input;
  const output = obj.tool_response ?? obj.toolResponse ?? obj.output;
  const prompt = str(obj.prompt);
  const agentId = str(obj.agent_id) || str(obj.agentId);
  const agentType = str(obj.agent_type) || str(obj.agentType);

  let eventType: AgentEventType = HOOK_TO_TYPE[hookEventName] ?? "unknown";
  let status: AgentToolStatus | undefined;
  let title = hookEventName;
  let summary: string | undefined;
  let error: string | undefined;

  switch (hookEventName) {
    case "SessionStart": {
      const source = str(obj.source);
      title = source ? `Session ${source}` : "Session started";
      summary = source;
      break;
    }
    case "UserPromptSubmit": {
      title = "User prompt";
      summary = prompt?.slice(0, 240);
      break;
    }
    case "PreToolUse": {
      status = "running";
      title = `${toolName ?? "Tool"} started`;
      summary = describeInput(toolName, input);
      break;
    }
    case "PostToolUse": {
      const r = isObj(output) ? output : {};
      const interrupted = r.interrupted === true;
      const isError =
        r.is_error === true ||
        r.isError === true ||
        (typeof r.error === "string" && r.error.length > 0);

      if (interrupted || isError) {
        status = "failed";
        eventType = "tool_failed";
        title = `${toolName ?? "Tool"} failed`;
        if (typeof r.error === "string") error = r.error;
        else if (interrupted) error = "Interrupted";
      } else {
        status = "success";
        title = `${toolName ?? "Tool"} completed`;
      }
      summary = describeInput(toolName, input);
      break;
    }
    case "Stop":
    case "SubagentStop": {
      const last =
        str(obj.last_assistant_message) ?? str(obj.lastAssistantMessage);
      title = hookEventName === "Stop" ? "Session ended" : "Subagent ended";
      summary = last?.slice(0, 240);
      break;
    }
    case "Notification": {
      title = "Notification";
      summary = str(obj.message) ?? str(obj.title);
      break;
    }
    case "PermissionRequest": {
      title = "Permission request";
      summary =
        str(obj.message) ??
        str(obj.title) ??
        (toolName ? `Permission for ${toolName}` : undefined);
      break;
    }
    case "PreCompact": {
      title = "Pre-compact";
      summary = str(obj.trigger);
      break;
    }
  }

  return {
    sessionId,
    timestamp: new Date().toISOString(),
    source: agent,
    hookEventName,
    eventType,
    toolUseId,
    toolName,
    status,
    title,
    summary,
    input,
    output,
    error,
    cwd,
    prompt,
    agentId,
    agentType,
    raw,
  };
}

function describeInput(
  toolName: string | undefined,
  input: unknown,
): string | undefined {
  if (!isObj(input)) return undefined;
  switch (toolName) {
    case "Bash":
      return str(input.command);
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
      return str(input.file_path);
    case "Grep":
      return [str(input.pattern), str(input.path)].filter(Boolean).join(" in ");
    case "Glob":
      return str(input.pattern);
    case "WebFetch":
    case "WebSearch":
      return str(input.url) ?? str(input.query);
    case "TodoWrite":
      return "todos updated";
    case "Task": {
      const desc = str(input.description);
      const subagent = str(input.subagent_type);
      return [subagent, desc].filter(Boolean).join(": ");
    }
    default:
      return undefined;
  }
}
