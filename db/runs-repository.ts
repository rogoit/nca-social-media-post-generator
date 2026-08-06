import { eq } from "drizzle-orm";
import { getDb } from "./client.js";
import { runs, platformResults, type RunRow, type PlatformResultRow } from "./schema.js";
import type { GenerationPlatform } from "../src/utils/generation-session.js";

export type RunStatus = "running" | "partial" | "done" | "error";
export type PlatformStatus = "pending" | "ready" | "error";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface RunRecord {
  id: string;
  filename: string;
  inputSource: "caption" | "video";
  status: RunStatus;
  rawTranscript: string | null;
  correctedTranscript: string | null;
  keywords: string[] | null;
  chatHistory: ChatMessage[] | null;
  model: string | null;
  videoDuration: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PlatformResultRecord {
  runId: string;
  platform: GenerationPlatform;
  status: PlatformStatus;
  content: Record<string, unknown> | null;
  model: string | null;
  humanizerWarnings: string[] | null;
  errorMessage: string | null;
  updatedAt: number;
}

export interface HydratedRun extends RunRecord {
  platformResults: PlatformResultRecord[];
}

function toRunRecord(row: RunRow): RunRecord {
  return {
    id: row.id,
    filename: row.filename,
    inputSource: row.inputSource as "caption" | "video",
    status: row.status as RunStatus,
    rawTranscript: row.rawTranscript,
    correctedTranscript: row.correctedTranscript,
    keywords: row.keywords ? (JSON.parse(row.keywords) as string[]) : null,
    chatHistory: row.chatHistory ? (JSON.parse(row.chatHistory) as ChatMessage[]) : null,
    model: row.model,
    videoDuration: row.videoDuration,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPlatformRecord(row: PlatformResultRow): PlatformResultRecord {
  return {
    runId: row.runId,
    platform: row.platform as GenerationPlatform,
    status: row.status as PlatformStatus,
    content: row.content ? (JSON.parse(row.content) as Record<string, unknown>) : null,
    model: row.model,
    humanizerWarnings: row.humanizerWarnings
      ? (JSON.parse(row.humanizerWarnings) as string[])
      : null,
    errorMessage: row.errorMessage,
    updatedAt: row.updatedAt,
  };
}

function nowMs(): number {
  return Date.now();
}

/**
 * Single-user policy: wipe all prior runs + their platform results, then
 * insert the new run. This keeps only the latest run — no history table,
 * no runs-list UI. The cascade on platform_results handles the children.
 */
export async function createRun(input: {
  id: string;
  filename: string;
  inputSource: "caption" | "video";
  videoDuration?: string;
}): Promise<RunRecord> {
  const db = await getDb();
  const now = nowMs();

  await db.delete(runs);
  await db.insert(runs).values({
    id: input.id,
    filename: input.filename,
    inputSource: input.inputSource,
    status: "running",
    videoDuration: input.videoDuration ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const row = await db.query.runs.findFirst({ where: eq(runs.id, input.id) });
  if (!row) throw new Error("createRun: inserted run not found");
  return toRunRecord(row);
}

export async function saveTurn1(
  runId: string,
  data: {
    rawTranscript: string;
    correctedTranscript: string;
    keywords: string[];
    chatHistory: ChatMessage[];
    model: string;
  }
): Promise<void> {
  const db = await getDb();
  await db
    .update(runs)
    .set({
      rawTranscript: data.rawTranscript,
      correctedTranscript: data.correctedTranscript,
      keywords: JSON.stringify(data.keywords),
      chatHistory: JSON.stringify(data.chatHistory),
      model: data.model,
      updatedAt: nowMs(),
    })
    .where(eq(runs.id, runId));
}

export async function savePlatformResult(
  runId: string,
  platform: GenerationPlatform,
  data: {
    status: PlatformStatus;
    content?: Record<string, unknown>;
    model?: string;
    humanizerWarnings?: string[];
    errorMessage?: string;
  }
): Promise<void> {
  const db = await getDb();
  const now = nowMs();
  await db
    .insert(platformResults)
    .values({
      runId,
      platform,
      status: data.status,
      content: data.content ? JSON.stringify(data.content) : null,
      model: data.model ?? null,
      humanizerWarnings: data.humanizerWarnings ? JSON.stringify(data.humanizerWarnings) : null,
      errorMessage: data.errorMessage ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [platformResults.runId, platformResults.platform],
      set: {
        status: data.status,
        content: data.content ? JSON.stringify(data.content) : null,
        model: data.model ?? null,
        humanizerWarnings: data.humanizerWarnings ? JSON.stringify(data.humanizerWarnings) : null,
        errorMessage: data.errorMessage ?? null,
        updatedAt: now,
      },
    });
}

export async function markRunStatus(
  runId: string,
  status: RunStatus,
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  await db
    .update(runs)
    .set({ status, errorMessage: errorMessage ?? null, updatedAt: nowMs() })
    .where(eq(runs.id, runId));
}

export async function getRun(runId: string): Promise<HydratedRun | null> {
  const db = await getDb();
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
  if (!run) return null;
  const platforms = await db.query.platformResults.findMany({
    where: eq(platformResults.runId, runId),
  });
  return {
    ...toRunRecord(run),
    platformResults: platforms.map(toPlatformRecord),
  };
}

/** Most recent run of any status (for hydration on reload). Null when none. */
export async function getLatestRun(): Promise<HydratedRun | null> {
  const db = await getDb();
  const latest = await db.query.runs.findFirst({
    orderBy: (runs, { desc }) => [desc(runs.createdAt)],
  });
  if (!latest) return null;
  const platforms = await db.query.platformResults.findMany({
    where: eq(platformResults.runId, latest.id),
  });
  return { ...toRunRecord(latest), platformResults: platforms.map(toPlatformRecord) };
}

/** Platforms that still need generation for a run (status not "ready"). */
export async function getMissingPlatforms(
  runId: string,
  allPlatforms: GenerationPlatform[]
): Promise<GenerationPlatform[]> {
  const db = await getDb();
  const rows = await db.query.platformResults.findMany({
    where: eq(platformResults.runId, runId),
  });
  const done = new Set(
    rows.filter((r) => r.status === "ready").map((r) => r.platform as GenerationPlatform)
  );
  return allPlatforms.filter((p) => !done.has(p));
}
