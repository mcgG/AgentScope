import type { FastifyInstance } from "fastify";
import { sessionStore } from "../services/sessionStore.ts";
import type { AgentKind } from "../../shared/events.ts";

export async function hookRoutes(app: FastifyInstance) {
  const register = (path: string, agent: AgentKind) => {
    app.post(path, async (req, reply) => {
      try {
        const { event, session } = await sessionStore.ingest(req.body, agent);
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
  };

  register("/api/hooks/claude", "claude-code");
  register("/api/hooks/codex", "codex");
}
