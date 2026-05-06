import Fastify from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PORT = 4936;
const RAW_DIR = resolve(process.cwd(), ".agentscope/raw");

await mkdir(RAW_DIR, { recursive: true });

const app = Fastify({
  logger: { transport: { target: "pino-pretty" } },
  bodyLimit: 10 * 1024 * 1024,
});

app.get("/api/health", async () => ({ ok: true, mode: "spike" }));

app.post("/api/hooks/claude", async (req, reply) => {
  const raw = req.body as Record<string, unknown> | unknown;
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const hookEvent =
    typeof obj.hook_event_name === "string" ? obj.hook_event_name : "unknown";
  const toolName = typeof obj.tool_name === "string" ? obj.tool_name : "";
  const sessionId =
    typeof obj.session_id === "string" ? obj.session_id.slice(0, 8) : "nosess";

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = [hookEvent, toolName, sessionId].filter(Boolean).join("_");
  const filename = `${ts}__${slug}.json`;
  const filepath = resolve(RAW_DIR, filename);

  await writeFile(filepath, JSON.stringify(raw, null, 2), "utf8");

  req.log.info({ hookEvent, toolName, sessionId, filename }, "captured hook");
  return reply.send({ ok: true, captured: filename });
});

app.listen({ port: PORT, host: "127.0.0.1" }).then(() => {
  console.log(`\n🛰  spike listening on http://127.0.0.1:${PORT}`);
  console.log(`   POST /api/hooks/claude  →  writes to ${RAW_DIR}\n`);
});
