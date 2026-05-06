import type { FastifyInstance } from "fastify";
import { eventBus } from "../services/eventBus.ts";
import type { AgentEvent, AgentSession } from "../../shared/events.ts";

export async function streamRoutes(app: FastifyInstance) {
  app.get("/api/events/stream", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (eventName: string, data: unknown) => {
      reply.raw.write(`event: ${eventName}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send("hello", { serverStartedAt: new Date().toISOString() });

    const onEvent = (event: AgentEvent) => send("event_upserted", event);
    const onSession = (session: AgentSession) =>
      send("session_upserted", session);

    eventBus.on("event_upserted", onEvent);
    eventBus.on("session_upserted", onSession);

    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 15_000);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      eventBus.off("event_upserted", onEvent);
      eventBus.off("session_upserted", onSession);
    });
  });
}
