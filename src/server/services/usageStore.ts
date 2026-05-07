import {
  type SessionUsage,
  loadUsage,
  newSessionUsage,
  refreshSessionUsage,
  saveUsage,
} from "./transcriptReader.ts";
import { sessionStore } from "./sessionStore.ts";
import { eventBus } from "./eventBus.ts";

const REFRESH_MS = 15_000;

export type UsageRange = "today" | "7d" | "30d" | "90d" | "year" | "all";

export type UsageBucket = {
  key: string; // YYYY-MM-DD or YYYY-MM-DDTHH or YYYY-MM
  input: number;
  output: number;
  cost: number;
  turns: number;
};

export type UsageRollup = {
  range: UsageRange;
  bucketSize: "hour" | "day" | "month";
  totals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
    cacheHitRate: number; // 0..1
  };
  byModel: Array<{ model: string; tokens: number; cost: number; turns: number }>;
  bySession: Array<{
    sessionId: string;
    title?: string;
    agent?: string;
    cost: number;
    tokens: number;
    turns: number;
  }>;
  series: UsageBucket[];
  generatedAt: string;
};

class UsageStore {
  private cache = new Map<string, SessionUsage>();
  private timer: NodeJS.Timeout | undefined;

  async init(): Promise<void> {
    const sessions = sessionStore.listSessions();
    await Promise.all(
      sessions.map(async (s) => {
        if (!s.transcriptPath) return;
        const existing = (await loadUsage(s.id)) ?? newSessionUsage(s.id, s.transcriptPath);
        // If the on-disk path changed (e.g. branch rename) reset and re-read.
        if (existing.transcriptPath !== s.transcriptPath) {
          existing.transcriptPath = s.transcriptPath;
          existing.byteOffset = 0;
        }
        this.cache.set(s.id, existing);
      }),
    );
    await this.refreshAll();
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.refreshAll().catch(() => {});
      }, REFRESH_MS);
      // unref so the interval doesn't keep node alive on shutdown.
      (this.timer as { unref?: () => void }).unref?.();
    }
  }

  async refreshSession(sessionId: string): Promise<void> {
    const session = sessionStore.getSession(sessionId);
    if (!session?.transcriptPath) return;
    let usage = this.cache.get(sessionId);
    if (!usage) {
      usage = (await loadUsage(sessionId)) ?? newSessionUsage(sessionId, session.transcriptPath);
      this.cache.set(sessionId, usage);
    }
    if (usage.transcriptPath !== session.transcriptPath) {
      usage.transcriptPath = session.transcriptPath;
      usage.byteOffset = 0;
    }
    const { changed } = await refreshSessionUsage(usage);
    if (changed) {
      await saveUsage(usage);
      eventBus.emit("usage_upserted", {
        sessionId,
        totals: usage.totals,
        lastTs: usage.lastTs,
      });
    }
  }

  async refreshAll(): Promise<void> {
    const sessions = sessionStore.listSessions();
    await Promise.all(
      sessions
        .filter((s) => s.transcriptPath)
        .map((s) => this.refreshSession(s.id).catch(() => {})),
    );
  }

  getSessionUsage(sessionId: string): SessionUsage | undefined {
    return this.cache.get(sessionId);
  }

  rollup(range: UsageRange): UsageRollup {
    const now = new Date();
    const cutoff = startOfRange(range, now);
    const bucketSize: "hour" | "day" | "month" =
      range === "today" ? "hour" : range === "year" || range === "all" ? "month" : "day";

    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let cost = 0;
    let turns = 0;
    const byModel = new Map<string, { tokens: number; cost: number; turns: number }>();
    const bySessionRaw = new Map<
      string,
      { cost: number; tokens: number; turns: number }
    >();
    const series = new Map<string, UsageBucket>();

    for (const u of this.cache.values()) {
      // Skip the whole session if its last activity is before cutoff.
      if (cutoff && u.lastTs && u.lastTs < cutoff.toISOString()) continue;

      // Walk per-bucket data; we only have per-date and per-hour aggregates.
      const dataset: Array<[string, { input: number; output: number; cost: number; turns: number }]> =
        bucketSize === "hour"
          ? Object.entries(u.byHour)
          : Object.entries(u.byDate);

      let sessionCost = 0;
      let sessionTokens = 0;
      let sessionTurns = 0;

      for (const [bucketKey, b] of dataset) {
        // bucket key is YYYY-MM-DDTHH or YYYY-MM-DD
        if (cutoff && bucketKey < cutoffKey(cutoff, bucketSize)) continue;
        const seriesKey = bucketSize === "month" ? bucketKey.slice(0, 7) : bucketKey;
        let entry = series.get(seriesKey);
        if (!entry) {
          entry = { key: seriesKey, input: 0, output: 0, cost: 0, turns: 0 };
          series.set(seriesKey, entry);
        }
        entry.input += b.input;
        entry.output += b.output;
        entry.cost += b.cost;
        entry.turns += b.turns;
      }

      // For totals + per-model + per-session attribution, we need fine-grained
      // data. Approximate using the byModel block and the byDate buckets to
      // determine the ratio that falls inside the range.
      const sessionAllCost = u.totals.cost;
      const sessionAllTokens =
        u.totals.input + u.totals.output + u.totals.cacheRead + u.totals.cacheWrite;
      const inRangeCost = Object.entries(u.byDate)
        .filter(([d]) => !cutoff || d >= cutoff.toISOString().slice(0, 10))
        .reduce((s, [, b]) => s + b.cost, 0);
      const inRangeTokens = Object.entries(u.byDate)
        .filter(([d]) => !cutoff || d >= cutoff.toISOString().slice(0, 10))
        .reduce((s, [, b]) => s + b.input + b.output, 0);
      const inRangeTurns = Object.entries(u.byDate)
        .filter(([d]) => !cutoff || d >= cutoff.toISOString().slice(0, 10))
        .reduce((s, [, b]) => s + b.turns, 0);

      const ratio = sessionAllCost > 0 ? inRangeCost / sessionAllCost : 0;

      input += u.totals.input * ratio;
      output += u.totals.output * ratio;
      cacheRead += u.totals.cacheRead * ratio;
      cacheWrite += u.totals.cacheWrite * ratio;
      cost += inRangeCost;
      turns += inRangeTurns;

      for (const [model, m] of Object.entries(u.byModel)) {
        const cur = byModel.get(model) ?? { tokens: 0, cost: 0, turns: 0 };
        cur.cost += m.cost * ratio;
        cur.tokens += (m.input + m.output + m.cacheRead + m.cacheWrite) * ratio;
        cur.turns += m.turns * ratio;
        byModel.set(model, cur);
      }

      sessionCost = inRangeCost;
      sessionTokens = inRangeTokens;
      sessionTurns = inRangeTurns;
      if (sessionCost > 0 || sessionTurns > 0) {
        bySessionRaw.set(u.sessionId, {
          cost: sessionCost,
          tokens: sessionTokens,
          turns: sessionTurns,
        });
      }
    }

    const cacheHitRate =
      input + cacheRead > 0 ? cacheRead / (input + cacheRead + cacheWrite) : 0;

    const sessionsList = sessionStore.listSessions();
    const sessionsById = new Map(sessionsList.map((s) => [s.id, s]));
    const bySession = Array.from(bySessionRaw.entries())
      .map(([sessionId, agg]) => {
        const s = sessionsById.get(sessionId);
        return {
          sessionId,
          title: s?.title,
          agent: s?.agent,
          cost: agg.cost,
          tokens: agg.tokens,
          turns: agg.turns,
        };
      })
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 12);

    const seriesArr = Array.from(series.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );

    return {
      range,
      bucketSize,
      totals: {
        input: Math.round(input),
        output: Math.round(output),
        cacheRead: Math.round(cacheRead),
        cacheWrite: Math.round(cacheWrite),
        cost,
        turns: Math.round(turns),
        cacheHitRate,
      },
      byModel: Array.from(byModel.entries())
        .map(([model, m]) => ({
          model,
          tokens: Math.round(m.tokens),
          cost: m.cost,
          turns: Math.round(m.turns),
        }))
        .sort((a, b) => b.cost - a.cost),
      bySession,
      series: seriesArr,
      generatedAt: new Date().toISOString(),
    };
  }
}

function startOfRange(range: UsageRange, now: Date): Date | undefined {
  const d = new Date(now);
  if (range === "today") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === "7d") {
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === "30d") {
    d.setDate(d.getDate() - 30);
    return d;
  }
  if (range === "90d") {
    d.setDate(d.getDate() - 90);
    return d;
  }
  if (range === "year") {
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  return undefined;
}

function cutoffKey(cutoff: Date, bucket: "hour" | "day" | "month"): string {
  const iso = cutoff.toISOString();
  if (bucket === "hour") return iso.slice(0, 13);
  if (bucket === "month") return iso.slice(0, 7);
  return iso.slice(0, 10);
}

export const usageStore = new UsageStore();
