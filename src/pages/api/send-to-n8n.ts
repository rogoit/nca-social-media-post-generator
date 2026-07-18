import type { APIRoute } from "astro";
import { jsonResponse } from "../../utils/api-helpers.js";

export const POST: APIRoute = async ({ request }) => {
  const N8N_WEBHOOK_URL = import.meta.env.N8N_WEBHOOK_URL;

  if (!N8N_WEBHOOK_URL) {
    return jsonResponse({ error: "N8N_WEBHOOK_URL ist nicht konfiguriert." }, 503);
  }

  try {
    const body = await request.json();
    const { platforms, video, transcript, keywords } = body;

    if (!platforms || Object.keys(platforms).length === 0) {
      return jsonResponse({ error: "Keine Plattformen zum Senden ausgewählt." }, 400);
    }

    // Forward the approved platforms + video to n8n
    const payload = {
      video, // base64 encoded video
      transcript,
      keywords,
      platforms,
    };

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text().catch(() => "Unknown error");
      return jsonResponse({ error: "n8n-Webhook fehlgeschlagen.", details: errorText }, 502);
    }

    const n8nData = await n8nResponse.json().catch(() => ({}));
    return jsonResponse({ success: true, n8nResponse: n8nData });
  } catch (error: any) {
    console.error("n8n send error:", error);
    return jsonResponse({ error: "Fehler beim Senden an n8n.", details: error.message }, 500);
  }
};
