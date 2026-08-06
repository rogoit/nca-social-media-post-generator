import type { APIRoute } from "astro";
import { jsonResponse } from "../../../utils/api-helpers.js";
import { loadRun } from "../../../utils/persistence.js";

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) {
    return jsonResponse({ error: "Run-ID fehlt." }, 400);
  }

  const run = await loadRun(id);
  if (!run) {
    return jsonResponse({ error: "Run nicht gefunden." }, 404);
  }

  return jsonResponse(run);
};
