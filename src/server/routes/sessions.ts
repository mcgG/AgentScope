import type { FastifyInstance } from "fastify";
import { sessionStore } from "../services/sessionStore.ts";

export async function sessionRoutes(app: FastifyInstance) {
  app.get("/api/sessions", async () => ({
    sessions: sessionStore.listSessions(),
  }));

  app.get<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId",
    async (req, reply) => {
      const session = sessionStore.getSession(req.params.sessionId);
      if (!session) {
        return reply.status(404).send({ ok: false, error: "Not found" });
      }
      return { session };
    },
  );

  app.get<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId/events",
    async (req, reply) => {
      const session = sessionStore.getSession(req.params.sessionId);
      if (!session) {
        return reply.status(404).send({ ok: false, error: "Not found" });
      }
      return { events: sessionStore.getEvents(req.params.sessionId) };
    },
  );
}
