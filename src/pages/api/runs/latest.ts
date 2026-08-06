import type { APIRoute } from "astro";
import { jsonResponse } from "../../../utils/api-helpers.js";
import { findLatestRun } from "../../../utils/persistence.js";

/**
 * Returns the most recent run of any status with its platform results. The
 * frontend calls this on page load (after checking localStorage) to rehydrate
 * the store after a refresh or SSE drop — completed runs included, so
 * finished work reappears immediately. 404 when no run exists.
 */
export const GET: APIRoute = async () => {
  const run = await findLatestRun();
  if (!run) {
    return jsonResponse({ error: "Kein Run vorhanden." }, 404);
  }
  return jsonResponse(run);
};
