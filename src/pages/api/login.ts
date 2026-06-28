import type { APIRoute } from "astro";

function getEnv(variable: string): string {
  const value = import.meta.env[variable];
  if (!value) throw new Error(`Environment variable ${variable} is not set`);
  return value;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json();
  const { username, password } = body;

  if (username !== getEnv("EDITOR_ADMIN") || password !== getEnv("EDITOR_PASSWORD")) {
    return new Response(JSON.stringify({ error: "Ungültige Anmeldedaten" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = Buffer.from(`${username}:${password}`).toString("base64");

  cookies.set("editor-auth", token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
