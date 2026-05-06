import type { FastifyInstance } from "fastify";
import { sessionStore } from "../services/sessionStore.ts";

export async function hookRoutes(app: FastifyInstance) {
  app.post("/api/hooks/claude", async (req, reply) => {
    try {
      const { event, session } = await sessionStore.ingest(req.body);
      return reply.send({
        ok: true,
        eventId: event.id,
        sessionId: session.id,
      });
    } catch (err) {
      req.log.error({ err }, "hook ingest failed");
      return reply.status(400).send({
        ok: false,
        error: err instanceof Error ? err.message : "Invalid payload",
      });
    }
  });

  app.post("/api/hooks/codex", async (req, reply) => {
    try {
      const { event, session } = await sessionStore.ingest(req.body, "codex");
      return reply.send({
        ok: true,
        eventId: event.id,
        sessionId: session.id,
      });
    } catch (err) {
      req.log.error({ err }, "hook ingest failed");
      return reply.status(400).send({
        ok: false,
        error: err instanceof Error ? err.message : "Invalid payload",
      });
    }
  });
}
