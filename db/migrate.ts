import type { Client } from "@libsql/client";

/**
 * Idempotent schema bootstrap. Runs `CREATE TABLE IF NOT EXISTS` for both
 * tables so a fresh SQLite file is ready on first boot without drizzle-kit.
 * Safe to call on every startup.
 */
export async function migrate(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS \`runs\` (
      \`id\` TEXT PRIMARY KEY NOT NULL,
      \`filename\` TEXT NOT NULL,
      \`input_source\` TEXT NOT NULL,
      \`status\` TEXT NOT NULL,
      \`raw_transcript\` TEXT,
      \`corrected_transcript\` TEXT,
      \`keywords\` TEXT,
      \`chat_history\` TEXT,
      \`model\` TEXT,
      \`video_duration\` TEXT,
      \`error_message\` TEXT,
      \`created_at\` INTEGER NOT NULL,
      \`updated_at\` INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS \`platform_results\` (
      \`run_id\` TEXT NOT NULL,
      \`platform\` TEXT NOT NULL,
      \`status\` TEXT NOT NULL,
      \`content\` TEXT,
      \`model\` TEXT,
      \`humanizer_warnings\` TEXT,
      \`error_message\` TEXT,
      \`updated_at\` INTEGER NOT NULL,
      PRIMARY KEY (\`run_id\`, \`platform\`),
      FOREIGN KEY (\`run_id\`) REFERENCES \`runs\`(\`id\`) ON DELETE CASCADE
    );
  `);
}
