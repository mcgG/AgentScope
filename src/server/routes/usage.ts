import type { FastifyInstance } from "fastify";
import { usageStore, type UsageRange } from "../services/usageStore.ts";

const VALID: UsageRange[] = ["today", "7d", "30d", "90d", "year", "all"];

export async function usageRoutes(app: FastifyInstance) {
  app.get("/api/usage", async (req) => {
    const q = (req.query as { range?: string }) ?? {};
    const range = (VALID.includes(q.range as UsageRange) ? q.range : "today") as UsageRange;
    return usageStore.rollup(range);
  });

  app.get("/api/usage/session", async (req, reply) => {
    const q = (req.query as { sessionId?: string }) ?? {};
    if (!q.sessionId) {
      return reply.status(400).send({ ok: false, error: "missing sessionId" });
    }
    const usage = usageStore.getSessionUsage(q.sessionId);
    if (!usage) return { totals: null };
    const t = usage.totals;
    const denom = t.input + t.cacheRead + t.cacheWrite;
    const cacheHitRate =
      denom > 0 ? Math.min(1, Math.max(0, t.cacheRead / denom)) : 0;
    return {
      totals: { ...t, cacheHitRate },
      byModel: usage.byModel,
      byDate: usage.byDate,
    };
  });

  app.post("/api/usage/refresh", async (req) => {
    const q = (req.query as { sessionId?: string }) ?? {};
    if (q.sessionId) {
      await usageStore.refreshSession(q.sessionId);
    } else {
      await usageStore.refreshAll();
    }
    return { ok: true };
  });
}
