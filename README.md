# AgentScope

A local web dashboard that visualizes Claude Code tool calls in real time using
Claude Code hooks. Turns raw tool execution events into structured cards, logs,
diffs, and session timelines.

> Status: V1 prototype. Local-first, observer-only.

## What you get

- Live timeline of every Claude Code session running on your machine
- Specialized cards for `Bash` (terminal), `Read`/`Write`/`Edit` (files with
  diff view), and a generic card for everything else
- Pre/Post tool matching with computed durations
- Orphan-tool finalization (handles cases where Claude Code skips PostToolUse)
- Append-only JSONL persistence under `.agentscope/sessions/`
- Always-available raw payload view for debugging unknown hook shapes

## Quick start

```bash
npm install
npm run dev
```

This starts:

- Fastify backend on `http://127.0.0.1:4936` (hooks + SSE + REST)
- Vite dev server on `http://localhost:4937` (UI, proxies `/api/*` to backend)

Open `http://localhost:4937`.

## Wire up Claude Code hooks

Add the hooks to whichever scope makes sense:

- `~/.claude/settings.json` — every Claude Code session you run
- `<repo>/.claude/settings.json` — only when running in that repo
- `<repo>/.claude/settings.local.json` — same, gitignored

The repo's own [.claude/settings.json](.claude/settings.json) shows the full
config; the minimum is:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:4936/api/hooks/claude -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:4936/api/hooks/claude -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}
```

Add `SessionStart`, `UserPromptSubmit`, `Stop`, `Notification`, `SubagentStop`,
and `PreCompact` for fuller coverage — see the example file.

## Wire up Codex hooks

For Codex, post to the Codex endpoint so sessions are grouped under the Codex
tab:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:4936/api/hooks/codex -H 'Content-Type: application/json' -d @- >/dev/null || true"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:4936/api/hooks/codex -H 'Content-Type: application/json' -d @- >/dev/null || true"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:4936/api/hooks/codex -H 'Content-Type: application/json' -d @- >/dev/null || true"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:4936/api/hooks/codex -H 'Content-Type: application/json' -d @- >/dev/null || true"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:4936/api/hooks/codex -H 'Content-Type: application/json' -d @- >/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

The `>/dev/null || true` suffix keeps the observer hook quiet and non-blocking
inside Codex while AgentScope is closed or restarting.

## Architecture

```
Claude Code / Codex hook
  └─> POST /api/hooks/claude or /api/hooks/codex
        └─> normalize (eventNormalizer.ts)
              └─> upsert in SessionStore
                    ├─> append .agentscope/sessions/<id>.events.jsonl
                    ├─> write   .agentscope/sessions/<id>.json
                    └─> emit on EventBus
                          └─> SSE → React UI
```

- `src/server/` — Fastify, EventBus, SessionStore, normalizer, routes
- `src/web/` — React + Vite + Tailwind UI
- `src/shared/` — types shared between backend and frontend
- `.agentscope/sessions/` — persisted sessions and events (JSONL)

## Production-ish build

```bash
npm run build
npm start
```

Backend serves both the API and the built UI on `http://127.0.0.1:4936`.

## Privacy & security

- Server binds to `127.0.0.1` only.
- All data stays local in `.agentscope/`.
- Hook payloads can include source code, command output, file paths, and
  potentially secrets — clear `.agentscope/sessions/` if needed.

## Scripts

| script              | what                                              |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | server + Vite (concurrently)                      |
| `npm run dev:server`| server only                                       |
| `npm run dev:web`   | Vite only                                         |
| `npm run spike`     | minimal raw-payload-capture server (debugging)    |
| `npm run typecheck` | `tsc --noEmit`                                    |
| `npm run build`     | bundle UI to `dist/web` + typecheck server        |
| `npm start`         | run built backend (also serves built UI)          |

## What the spike server is for

If Claude Code emits a hook event shape we don't yet handle, run
`npm run spike` instead of `npm run dev`. It writes every raw payload to
`.agentscope/raw/<timestamp>__<event>.json` so you can inspect the actual
fields and update `eventNormalizer.ts`.

## Out of scope for V1

Replacement coding agent, MCP gateway mode, multi-agent orchestration, auth,
team mode, cloud, GitHub App, prompt/model trace inspection, token analytics,
remote collaboration. See the PRD ([coding_agent_visual_gateway_v_1_prd.md](coding_agent_visual_gateway_v_1_prd.md))
for the full scope statement.
