import { randomUUID } from "node:crypto";
import {
  createRun,
  saveTurn1,
  savePlatformResult,
  markRunStatus,
  getRun,
  getLatestRun,
  getMissingPlatforms,
  type RunRecord,
  type HydratedRun,
  type ChatMessage,
  type PlatformStatus,
} from "../../db/runs-repository.js";
import type { GenerationPlatform } from "./generation-session.js";

/**
 * Thin facade over the repository so the generation pipeline and API routes
 * don't import Drizzle directly. Keeps persistence concerns in one place and
 * gives a stable surface the tests can mock via vi.mock on this module.
 */

export type { RunRecord, HydratedRun, ChatMessage, PlatformStatus };

export function newRunId(): string {
  return randomUUID();
}

export async function startRun(input: {
  filename: string;
  inputSource: "caption" | "video";
  videoDuration?: string;
}): Promise<RunRecord> {
  return createRun({ id: newRunId(), ...input });
}

export async function persistTurn1(
  runId: string,
  data: {
    rawTranscript: string;
    correctedTranscript: string;
    keywords: string[];
    chatHistory: ChatMessage[];
    model: string;
  }
): Promise<void> {
  return saveTurn1(runId, data);
}

export async function persistPlatformResult(
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
  return savePlatformResult(runId, platform, data);
}

export async function finishRun(
  runId: string,
  status: "done" | "partial" | "error",
  errorMessage?: string
): Promise<void> {
  return markRunStatus(runId, status, errorMessage);
}

export async function loadRun(runId: string): Promise<HydratedRun | null> {
  return getRun(runId);
}

export async function findLatestRun(): Promise<HydratedRun | null> {
  return getLatestRun();
}

export async function missingPlatforms(
  runId: string,
  allPlatforms: GenerationPlatform[]
): Promise<GenerationPlatform[]> {
  return getMissingPlatforms(runId, allPlatforms);
}
