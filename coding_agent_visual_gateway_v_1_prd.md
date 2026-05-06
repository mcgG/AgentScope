# PRD: Coding Agent Visual Gateway V1

## 1. Product Summary

### Product Name
Working name: **AgentScope**

### One-liner
A local web dashboard that visualizes Claude Code tool calls in real time using Claude Code hooks, turning raw tool execution events into structured cards, logs, diffs, and session timelines.

### Problem
Coding agents such as Claude Code can perform complex engineering workflows: inspect code, run shell commands, edit files, run tests, create commits, create PRs, and react to CI failures. Today, most of this work is displayed as text in a terminal or chat-style interface. Engineers often cannot quickly answer:

- What is the agent doing right now?
- Which tool did it call?
- What command is currently running?
- What files did it modify?
- Which step failed?
- What was the exact input/output of a tool call?
- Can I replay or inspect the session later?

This makes autonomous coding workflows harder to trust, debug, supervise, and share.

### V1 Goal
Build a local-first visual observer for Claude Code sessions. The system listens to Claude Code hook events, stores them locally, and renders a real-time web UI with timeline cards for tool calls.

V1 should answer one validation question:

> Is watching Claude Code’s tool calls in a structured visual dashboard meaningfully better than reading raw terminal/chat logs?

---

## 2. Target User

### Primary User
A software engineer using Claude Code for coding tasks.

### Initial User
The initial user is the product creator/developer. V1 is self-dogfooding only.

### User Context
The user runs Claude Code locally in a repository and asks it to perform a coding task such as:

- Fix a bug
- Add a feature
- Refactor code
- Run tests
- Commit changes
- Create a PR
- Investigate a CI failure

The user opens a local web dashboard to watch what Claude Code is doing.

---

## 3. V1 Scope

### In Scope

V1 must support:

1. **Local server**
   - Runs on localhost.
   - Receives Claude Code hook events over HTTP.
   - Stores events locally in memory and optionally on disk.
   - Serves a web UI.
   - Streams real-time events to the UI using SSE or WebSocket.

2. **Claude Code hook integration**
   - Receives hook events such as:
     - Session start
     - Pre tool use
     - Post tool use
     - Tool failure, if available
     - Session stop/end, if available
   - Does not require replacing Claude Code’s built-in tools.
   - Works in observer mode first.

3. **Session timeline**
   - Groups events into a session/run.
   - Displays events in chronological order.
   - Shows current status: running, completed, failed, unknown.

4. **Generic tool call cards**
   - Shows tool name.
   - Shows status: pending/running/success/failed.
   - Shows input JSON.
   - Shows output JSON/text.
   - Shows error message if failed.
   - Shows timestamp and duration when available.

5. **Specialized Bash/terminal card**
   - For Bash tool calls, render a terminal-like card.
   - Show command, working directory if available, status, duration, exit code if available.
   - Show stdout/stderr/output in a readable monospace block.
   - Support expand/collapse.
   - Support copy command and copy output.

6. **Specialized file operation cards**
   - For file read/edit/write-related tools, render a file card.
   - Show file path if available.
   - Show operation type.
   - Show input and result.
   - V1 does not need perfect diff reconstruction unless data is available in hook payload.

7. **Basic session history**
   - Show a list of recent sessions/runs in the UI.
   - Allow opening a previous session.
   - Persistence can be file-based JSON/JSONL or SQLite.

8. **Raw event inspector**
   - Every card should allow viewing the raw hook event payload.
   - This is important for debugging unknown Claude Code hook shapes.

### Out of Scope

V1 should NOT include:

- Building a replacement coding agent.
- Replacing Claude Code’s built-in tools.
- Full MCP gateway execution mode.
- Multi-agent orchestration.
- Team/multi-user support.
- Cloud hosting.
- Authentication/RBAC.
- Enterprise policy engine.
- Full PR lifecycle automation.
- Full CI integration.
- GitHub App.
- Custom user-defined frontend plugins.
- LangSmith-style prompt/model trace inspection.
- Token/cost analytics.
- Remote collaboration.

---

## 4. Product Principles

### 1. Observer first
The system should not change Claude Code behavior in V1. It observes and visualizes.

### 2. Artifact-first, raw-event-second
The UI should present human-friendly cards first, with raw payloads available behind details.

### 3. Local-first
The product should run locally and keep data local by default.

### 4. Low setup friction
The user should be able to start the server and configure Claude Code hooks with minimal steps.

### 5. Useful even with incomplete data
Claude Code hook payloads may vary. The UI should gracefully fall back to generic cards.

---

## 5. Example User Journey

### Journey: Fix a failing test with Claude Code

1. User starts the local server:

```bash
agentscope dev
```

2. User opens the dashboard:

```text
http://localhost:3000
```

3. User configures Claude Code hooks to POST events to:

```text
http://localhost:3000/api/hooks/claude
```

4. User starts Claude Code in a repo and prompts:

```text
Fix the failing Redis retry test, run tests, commit the fix, and create a PR.
```

5. Dashboard shows a new active session.

6. As Claude Code works, cards appear:

```text
Session started
Bash: git status
File read: src/redis_client.ts
Bash: npm test
Bash failed: npm test
File edit: tests/redis_client.test.ts
Bash: npm test
Bash succeeded: npm test
Bash: git diff
Bash: git commit -m "Fix Redis retry test"
```

7. User clicks the failed `npm test` card to inspect output.

8. User clicks raw payload to debug what Claude Code emitted.

9. User can revisit the session later from session history.

---

## 6. Functional Requirements

## 6.1 Local Server

### Requirement
Provide a local server that receives hook events and serves the UI.

### Acceptance Criteria

- Server starts with one command.
- Server prints the local UI URL.
- Server exposes a hook endpoint:

```text
POST /api/hooks/claude
```

- Server exposes health endpoint:

```text
GET /api/health
```

- Server exposes sessions API:

```text
GET /api/sessions
GET /api/sessions/:sessionId
GET /api/sessions/:sessionId/events
```

- Server exposes real-time event stream:

```text
GET /api/events/stream
```

SSE is preferred for V1 because it is simpler than WebSocket and sufficient for one-way server-to-browser updates.

---

## 6.2 Claude Hook Receiver

### Requirement
Receive Claude Code hook payloads and normalize them into internal events.

### Input
HTTP POST body from Claude Code hook.

### Behavior

- Accept any valid JSON payload.
- Store the raw event.
- Attempt to infer:
  - session ID
  - event type
  - tool name
  - tool input
  - tool output
  - error
  - timestamp
  - working directory
- If inference fails, still store and display the raw event.

### Acceptance Criteria

- Unknown payload shapes do not crash the server.
- Every received hook event appears in the UI.
- Raw payload is always inspectable.
- Events are grouped into a session when possible.
- If no session ID is available, server assigns one.

---

## 6.3 Session Model

### Requirement
Group related hook events into sessions/runs.

### Internal Type

```ts
type AgentSession = {
  id: string;
  title?: string;
  agent: "claude-code";
  status: "running" | "completed" | "failed" | "unknown";
  cwd?: string;
  startedAt: string;
  endedAt?: string;
  eventCount: number;
  toolCallCount: number;
};
```

### Acceptance Criteria

- UI shows active session.
- UI shows recent sessions.
- Session has event count and tool call count.
- Session can be reopened after page refresh if persistence is enabled.

---

## 6.4 Event Model

### Requirement
Normalize raw hook events into a generic internal event model.

### Internal Type

```ts
type AgentEvent = {
  id: string;
  sessionId: string;
  timestamp: string;
  source: "claude-code";
  eventType:
    | "session_started"
    | "session_ended"
    | "tool_started"
    | "tool_completed"
    | "tool_failed"
    | "notification"
    | "unknown";
  toolCallId?: string;
  toolName?: string;
  status?: "pending" | "running" | "success" | "failed" | "unknown";
  title: string;
  summary?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  cwd?: string;
  durationMs?: number;
  raw: unknown;
};
```

### Acceptance Criteria

- Pre-tool hook creates or updates a `tool_started` event.
- Post-tool hook creates or updates a `tool_completed` event.
- Tool failure creates or updates a `tool_failed` event if hook data is available.
- If start and completion events can be matched, duration is calculated.
- If matching is not possible, display them as separate events.

---

## 6.5 Card Rendering

### Requirement
Render normalized events as visual cards.

### Card Type Selection

```text
If toolName is Bash or bash-like:
  render TerminalCard
Else if toolName indicates file read/edit/write:
  render FileOperationCard
Else:
  render GenericToolCard
```

### GenericToolCard

Must show:

- Tool name or event type.
- Status.
- Timestamp.
- Duration if available.
- Input section.
- Output section.
- Error section if failed.
- Raw event section.

### TerminalCard

Must show:

- Command.
- Working directory if available.
- Status.
- Duration.
- Exit code if available.
- Output/log block.
- Copy command button.
- Copy output button.
- Expand/collapse logs.

### FileOperationCard

Must show:

- Operation type.
- File path if available.
- Status.
- Input/output.
- Raw payload.

### Acceptance Criteria

- Cards render without crashing for unknown data.
- Long output is collapsed by default.
- User can expand long output.
- User can copy command/output/input/raw payload.
- Failed cards are visually distinguishable from successful cards.

---

## 6.6 Real-time Updates

### Requirement
New events should appear in the UI without refreshing.

### Acceptance Criteria

- Browser connects to event stream.
- When hook endpoint receives a new event, UI updates within one second.
- If browser disconnects/reconnects, it can reload session events from REST API.

---

## 6.7 Persistence

### Requirement
Persist session and event history locally.

### V1 Option
Use one of:

1. SQLite database
2. JSONL files per session
3. Simple JSON files

SQLite is recommended if the implementation cost is acceptable.

### Acceptance Criteria

- Refreshing the browser does not lose current session data.
- Restarting the server can load previous sessions.
- There is a basic retention option or manual clear option.

### Suggested Storage Structure if File-based

```text
.agentscope/
  sessions/
    <session-id>.json
    <session-id>.events.jsonl
```

---

## 7. UI Requirements

## 7.1 Main Layout

V1 UI should use a simple two-column or three-column layout.

Recommended layout:

```text
+----------------------+---------------------------------------------+
| Sessions             | Timeline                                    |
|----------------------|---------------------------------------------|
| Active session       | Session header                              |
| Recent sessions      | Event cards                                 |
|                      |                                             |
+----------------------+---------------------------------------------+
```

Optional inspector can be inside expanded cards instead of a separate right panel.

### Session Sidebar

Shows:

- Active session indicator.
- Recent sessions.
- Session status.
- Start time.
- Tool call count.

### Timeline Header

Shows:

- Session title or ID.
- Agent: Claude Code.
- Status.
- Started time.
- Working directory if available.
- Event count.

### Timeline

Shows:

- Chronological event cards.
- Auto-scroll option.
- Filter by status or tool type, optional.

---

## 7.2 Visual Style

V1 should feel like a developer tool:

- Clean layout.
- Monospace for commands/logs.
- Clear status labels.
- Compact cards.
- Expandable details.
- Good readability for long logs.

Suggested statuses:

```text
running: blue or active indicator
success: green/check
failed: red/error
unknown: gray
```

Do not over-invest in polish before core functionality works.

---

## 8. API Design

## 8.1 Hook Endpoint

```http
POST /api/hooks/claude
Content-Type: application/json
```

### Response

```json
{
  "ok": true,
  "eventId": "evt_123",
  "sessionId": "sess_123"
}
```

### Failure Response

```json
{
  "ok": false,
  "error": "Invalid JSON payload"
}
```

---

## 8.2 Sessions API

```http
GET /api/sessions
```

Response:

```json
{
  "sessions": [
    {
      "id": "sess_123",
      "agent": "claude-code",
      "status": "running",
      "startedAt": "2026-05-04T12:00:00Z",
      "eventCount": 12,
      "toolCallCount": 7
    }
  ]
}
```

---

## 8.3 Session Events API

```http
GET /api/sessions/:sessionId/events
```

Response:

```json
{
  "events": []
}
```

---

## 8.4 Event Stream

```http
GET /api/events/stream
```

SSE message:

```text
event: agent_event
data: {"id":"evt_123","sessionId":"sess_123","eventType":"tool_started"}
```

---

## 9. Claude Code Hook Configuration

V1 should provide documentation and possibly a generated hook config snippet.

Expected concept:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/hooks/claude -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/hooks/claude -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}
```

Important: Actual Claude Code hook config format should be verified during implementation. The product should include a `agentscope init-claude-hooks` command later, but this can be manual for V1.

---

## 10. Technical Architecture

## 10.1 Recommended Stack

### Option A: TypeScript Full Stack

Recommended for fast V1:

- Node.js
- Express or Fastify
- React + Vite
- SSE for event streaming
- SQLite or JSONL persistence
- Tailwind or simple CSS

### Why TypeScript

- Easy to build local dev server.
- Easy to share types between backend and frontend.
- Good fit for web UI.
- Easy for Claude Code to implement.

---

## 10.2 Suggested Project Structure

```text
agentscope/
  package.json
  README.md
  src/
    server/
      index.ts
      routes/
        hooks.ts
        sessions.ts
        stream.ts
      services/
        eventNormalizer.ts
        sessionStore.ts
        eventBus.ts
      types/
        events.ts
    web/
      index.html
      src/
        App.tsx
        api.ts
        components/
          SessionSidebar.tsx
          Timeline.tsx
          cards/
            GenericToolCard.tsx
            TerminalCard.tsx
            FileOperationCard.tsx
            RawEventViewer.tsx
        types.ts
  data/
    .gitkeep
```

---

## 10.3 Event Flow

```text
Claude Code hook
  ↓
POST /api/hooks/claude
  ↓
Store raw payload
  ↓
Normalize to AgentEvent
  ↓
Persist event
  ↓
Publish to EventBus
  ↓
SSE stream
  ↓
React UI updates timeline
```

---

## 11. Event Normalization Strategy

Because hook payloads may vary, implement defensive normalization.

### Normalization Steps

1. Read raw JSON.
2. Infer hook event name from known fields.
3. Infer session ID from known fields.
4. Infer tool name from known fields.
5. Infer input/output/error.
6. Generate fallback title.
7. Store raw payload regardless of inference success.

### Pseudocode

```ts
function normalizeClaudeHookPayload(raw: unknown): AgentEvent {
  const obj = isObject(raw) ? raw : {};

  const sessionId =
    readString(obj, ["session_id"]) ||
    readString(obj, ["sessionId"]) ||
    readString(obj, ["transcript_path"]) ||
    getCurrentFallbackSessionId();

  const hookEventName =
    readString(obj, ["hook_event_name"]) ||
    readString(obj, ["event"]) ||
    "unknown";

  const toolName =
    readString(obj, ["tool_name"]) ||
    readString(obj, ["toolName"]);

  const input =
    readValue(obj, ["tool_input"]) ||
    readValue(obj, ["input"]);

  const output =
    readValue(obj, ["tool_response"]) ||
    readValue(obj, ["output"]);

  const eventType = mapHookEventToEventType(hookEventName, raw);

  return {
    id: createId("evt"),
    sessionId,
    timestamp: new Date().toISOString(),
    source: "claude-code",
    eventType,
    toolName,
    status: inferStatus(eventType, raw),
    title: buildTitle(eventType, toolName, input),
    input,
    output,
    error: inferError(raw),
    raw
  };
}
```

---

## 12. Card Mapping Strategy

### Function

```ts
function getCardKind(event: AgentEvent): CardKind {
  const name = event.toolName?.toLowerCase() || "";

  if (name.includes("bash")) return "terminal";
  if (name.includes("read") || name.includes("write") || name.includes("edit")) return "file";
  return "generic";
}
```

### Bash Command Extraction

Try to find command from:

```text
input.command
input.cmd
input.description
raw.tool_input.command
raw.tool_input.cmd
```

If not found, show input JSON.

---

## 13. MVP Acceptance Criteria

V1 is complete when:

1. User can start a local server.
2. User can open a local web dashboard.
3. Claude Code hook events can be POSTed to the server.
4. The dashboard updates in real time when events arrive.
5. Events are grouped into sessions.
6. Generic tool cards show input/output/raw payload.
7. Bash tool calls render as terminal-like cards.
8. File-related tool calls render as file operation cards.
9. User can inspect a previous session after page refresh.
10. Unknown event shapes are still captured and rendered.
11. Basic README explains setup and usage.

---

## 14. Non-Functional Requirements

### Performance

- V1 should handle at least 1,000 events in a session without crashing.
- Long logs should not freeze the browser.
- Use collapsed log rendering for large output.

### Reliability

- Bad hook payload should return a clear error and not crash server.
- Unknown payload should become an unknown/generic event.
- SSE disconnect should not break server.

### Security

- Server binds to localhost by default.
- Do not expose server on public network by default.
- Do not send data to external services.
- Avoid executing arbitrary hook payloads.
- Treat hook payload as untrusted input.

### Privacy

- Data stays local by default.
- README should warn that hook payloads may include code, file paths, command output, secrets, or logs.
- Provide a way to clear local history.

---

## 15. Future Versions

### V2: Better Engineering Artifact Cards

- Git diff card.
- Commit card.
- PR card.
- CI status card.
- Test result parsing.
- Failure summary.

### V3: MCP Gateway Mode

- Provide MCP tools directly.
- Claude Code can call gateway-provided tools.
- Gateway controls execution and emits richer UI events.

### V4: Human-in-the-loop Controls

- Approve/deny risky actions.
- Pause/resume session.
- Copy follow-up prompt.
- Ask agent to fix failed step.

### V5: Team/Cloud Mode

- Shared session links.
- Multi-user dashboard.
- Auth/RBAC.
- GitHub App integration.
- CI provider integrations.

---

## 16. Risks and Open Questions

### Risk 1: Claude Code hook payload shape may not contain enough detail
Mitigation: Always show raw payload. Start with generic cards. Improve mapping after observing real payloads.

### Risk 2: Hook events may not provide streaming stdout/stderr
Mitigation: V1 can show completed command output. True live terminal streaming may require gateway mode later.

### Risk 3: Events may be hard to match between PreToolUse and PostToolUse
Mitigation: Use best-effort matching by session ID, tool name, timestamp, and input hash. If matching fails, show separate cards.

### Risk 4: UI may become too close to a trace viewer
Mitigation: Keep V1 focused on engineering cards: command, file, diff, commit, PR, CI.

### Risk 5: Setup friction
Mitigation: Provide clear README and eventually a CLI init command.

---

## 17. Build Instructions for Claude Code

### Implementation Goal
Build the V1 local observer described in this PRD.

### Suggested First Milestone
Implement the backend and a minimal UI that displays raw hook events in real time.

Tasks:

1. Create TypeScript project.
2. Create Express/Fastify server.
3. Add `POST /api/hooks/claude`.
4. Add in-memory event/session store.
5. Add SSE stream.
6. Create React UI with session sidebar and timeline.
7. Render generic event cards.
8. Add raw JSON viewer.

### Suggested Second Milestone
Add specialized cards.

Tasks:

1. Implement event normalization.
2. Implement TerminalCard for Bash.
3. Implement FileOperationCard.
4. Add expand/collapse and copy buttons.
5. Add basic persistence.

### Suggested Third Milestone
Dogfood with real Claude Code.

Tasks:

1. Add README setup steps.
2. Add example Claude hook config.
3. Run Claude Code on a real repo.
4. Capture actual hook payloads.
5. Update normalizer based on real payloads.
6. Add screenshots/gifs later.

---

## 18. Definition of Done

The V1 prototype is done when the developer can:

1. Run the server locally.
2. Configure Claude Code hooks to send events to the server.
3. Start a Claude Code coding session.
4. Open the web UI and see tool calls appear as cards.
5. Click a Bash card and inspect command/output.
6. Click a file operation card and inspect file path/input/output.
7. Click raw payload for any event.
8. Refresh the browser and still see session history.
9. Use the dashboard during a real coding task and understand what Claude Code is doing better than from terminal output alone.

