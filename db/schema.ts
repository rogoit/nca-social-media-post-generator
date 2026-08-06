import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * A single generation run (one video or one caption paste). Keyed by a
 * server-generated UUID; `filename` is the human-readable label the user
 * asked for (the uploaded video name, or a synthetic name for the caption
 * flow). Only the latest run is kept — `createRun` wipes all prior rows.
 */
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  inputSource: text("input_source").notNull(),
  status: text("status").notNull(),
  rawTranscript: text("raw_transcript"),
  correctedTranscript: text("corrected_transcript"),
  keywords: text("keywords"),
  chatHistory: text("chat_history"),
  model: text("model"),
  videoDuration: text("video_duration"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Per-platform result for a run. One row per (runId, platform). A resumed
 * run only regenerates platforms whose status is not "ready".
 */
export const platformResults = sqliteTable(
  "platform_results",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    status: text("status").notNull(),
    content: text("content"),
    model: text("model"),
    humanizerWarnings: text("humanizer_warnings"),
    errorMessage: text("error_message"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.platform] })]
);

export type RunRow = typeof runs.$inferSelect;
export type PlatformResultRow = typeof platformResults.$inferSelect;
