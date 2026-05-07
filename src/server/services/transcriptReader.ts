import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { open } from "node:fs/promises";
import { resolve, join } from "node:path";
import { costOf } from "./modelPricing.ts";

export type TurnUsage = {
  ts: string; // ISO timestamp
  date: string; // YYYY-MM-DD
  hour: string; // YYYY-MM-DDTHH
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  agentId?: string;
};

export type SessionUsage = {
  sessionId: string;
  transcriptPath: string;
  byteOffset: number;
  fileSize: number;
  mtimeMs: number;
  totals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
  };
  byModel: Record<
    string,
    {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      cost: number;
      turns: number;
    }
  >;
  // Bucketed by date. Hour-level resolution kept too — useful for "today".
  byDate: Record<
    string,
    { input: number; output: number; cost: number; turns: number }
  >;
  byHour: Record<
    string,
    { input: number; output: number; cost: number; turns: number }
  >;
  firstTs?: string;
  lastTs?: string;
};

const USAGE_DIR = resolve(process.cwd(), ".agentscope/usage");

function emptyAgg() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
}
function emptyBucket() {
  return { input: 0, output: 0, cost: 0, turns: 0 };
}

export function newSessionUsage(
  sessionId: string,
  transcriptPath: string,
): SessionUsage {
  return {
    sessionId,
    transcriptPath,
    byteOffset: 0,
    fileSize: 0,
    mtimeMs: 0,
    totals: emptyAgg(),
    byModel: {},
    byDate: {},
    byHour: {},
  };
}

export async function loadUsage(
  sessionId: string,
): Promise<SessionUsage | undefined> {
  try {
    const file = join(USAGE_DIR, `${sessionId}.json`);
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as SessionUsage;
  } catch {
    return undefined;
  }
}

export async function saveUsage(usage: SessionUsage): Promise<void> {
  await mkdir(USAGE_DIR, { recursive: true });
  const file = join(USAGE_DIR, `${usage.sessionId}.json`);
  await writeFile(file, JSON.stringify(usage), "utf8");
}

/**
 * Incrementally parse a Claude Code transcript JSONL. Reads only bytes after
 * the previously-recorded offset. Updates the SessionUsage in place and
 * returns it. Skips entirely if the file hasn't grown since last read.
 */
export async function refreshSessionUsage(
  usage: SessionUsage,
): Promise<{ changed: boolean; turns: TurnUsage[] }> {
  let st;
  try {
    st = await stat(usage.transcriptPath);
  } catch {
    return { changed: false, turns: [] };
  }
  if (st.size === usage.fileSize && st.mtimeMs === usage.mtimeMs) {
    return { changed: false, turns: [] };
  }

  // If the file shrank or was rotated, reset and re-parse from scratch.
  if (st.size < usage.byteOffset) {
    usage.byteOffset = 0;
    usage.totals = emptyAgg();
    usage.byModel = {};
    usage.byDate = {};
    usage.byHour = {};
    usage.firstTs = undefined;
    usage.lastTs = undefined;
  }

  const fh = await open(usage.transcriptPath, "r");
  let buf: Buffer;
  try {
    const len = st.size - usage.byteOffset;
    if (len <= 0) {
      usage.fileSize = st.size;
      usage.mtimeMs = st.mtimeMs;
      return { changed: false, turns: [] };
    }
    buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, usage.byteOffset);
  } finally {
    await fh.close();
  }

  const text = buf.toString("utf8");
  // Find the last full line so we don't half-parse mid-line on the next read.
  const lastNl = text.lastIndexOf("\n");
  const consumed = lastNl >= 0 ? lastNl + 1 : 0;
  const lines = text.slice(0, consumed).split("\n");

  const turns: TurnUsage[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const turn = extractUsage(obj);
    if (!turn) continue;
    applyTurn(usage, turn);
    turns.push(turn);
  }

  usage.byteOffset += consumed;
  usage.fileSize = st.size;
  usage.mtimeMs = st.mtimeMs;

  return { changed: turns.length > 0, turns };
}

function extractUsage(obj: unknown): TurnUsage | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const message = o.message as Record<string, unknown> | undefined;
  if (!message || typeof message !== "object") return null;
  const usage = message.usage as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") return null;

  const input = num(usage.input_tokens);
  const output = num(usage.output_tokens);
  const cacheRead = num(usage.cache_read_input_tokens);
  const cacheWrite = num(usage.cache_creation_input_tokens);
  if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) {
    return null;
  }

  const ts =
    (typeof o.timestamp === "string" && o.timestamp) ||
    (typeof message.created_at === "string" && message.created_at) ||
    new Date().toISOString();
  const model =
    (typeof message.model === "string" && message.model) || "unknown";
  const agentId = typeof o.agent_id === "string" ? o.agent_id : undefined;

  const date = ts.slice(0, 10);
  const hour = ts.slice(0, 13);

  const cost = costOf(
    {
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    },
    model,
  );

  return {
    ts,
    date,
    hour,
    model,
    input,
    output,
    cacheRead,
    cacheWrite,
    cost,
    agentId,
  };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function applyTurn(usage: SessionUsage, turn: TurnUsage): void {
  usage.totals.input += turn.input;
  usage.totals.output += turn.output;
  usage.totals.cacheRead += turn.cacheRead;
  usage.totals.cacheWrite += turn.cacheWrite;
  usage.totals.cost += turn.cost;
  usage.totals.turns += 1;

  if (!usage.byModel[turn.model]) usage.byModel[turn.model] = emptyAgg();
  const m = usage.byModel[turn.model]!;
  m.input += turn.input;
  m.output += turn.output;
  m.cacheRead += turn.cacheRead;
  m.cacheWrite += turn.cacheWrite;
  m.cost += turn.cost;
  m.turns += 1;

  if (!usage.byDate[turn.date]) usage.byDate[turn.date] = emptyBucket();
  const d = usage.byDate[turn.date]!;
  d.input += turn.input + turn.cacheRead + turn.cacheWrite;
  d.output += turn.output;
  d.cost += turn.cost;
  d.turns += 1;

  if (!usage.byHour[turn.hour]) usage.byHour[turn.hour] = emptyBucket();
  const h = usage.byHour[turn.hour]!;
  h.input += turn.input + turn.cacheRead + turn.cacheWrite;
  h.output += turn.output;
  h.cost += turn.cost;
  h.turns += 1;

  if (!usage.firstTs || turn.ts < usage.firstTs) usage.firstTs = turn.ts;
  if (!usage.lastTs || turn.ts > usage.lastTs) usage.lastTs = turn.ts;
}
