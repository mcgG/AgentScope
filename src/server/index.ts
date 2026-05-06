import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { hookRoutes } from "./routes/hooks.ts";
import { sessionRoutes } from "./routes/sessions.ts";
import { streamRoutes } from "./routes/stream.ts";
import { healthRoutes } from "./routes/health.ts";
import { sessionStore } from "./services/sessionStore.ts";

const PORT = Number(process.env.AGENTSCOPE_PORT ?? 4936);
const HOST = process.env.AGENTSCOPE_HOST ?? "127.0.0.1";

const app = Fastify({
  logger: {
    transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } },
  },
  bodyLimit: 10 * 1024 * 1024,
});

await sessionStore.init();
await app.register(healthRoutes);
await app.register(hookRoutes);
await app.register(sessionRoutes);
await app.register(streamRoutes);

const distDir = resolve(process.cwd(), "dist/web");
if (existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir, prefix: "/" });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) {
      return reply.status(404).send({ ok: false, error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

app.listen({ port: PORT, host: HOST }).then(() => {
  console.log(`\n🛰  AgentScope on http://${HOST}:${PORT}`);
  console.log(`    hook endpoint:  POST /api/hooks/claude`);
  console.log(`    hook endpoint:  POST /api/hooks/codex`);
  console.log(`    sessions API:   GET  /api/sessions`);
  console.log(`    event stream:   GET  /api/events/stream`);
  if (existsSync(distDir)) {
    console.log(`    web UI:         GET  /\n`);
  } else {
    console.log(`    (run \`npm run dev:web\` for the UI)\n`);
  }
});
