import { describe, it, expect } from "vitest";
import { ResponseParser } from "../../src/utils/response-parser.js";

describe("ResponseParser", () => {
  it("parses a YouTube JSON response with timestamps", () => {
    const result = ResponseParser.parseResponse(
      "youtube",
      JSON.stringify({
        transcript: "Corrected transcript.",
        title: "JavaScript 2025: Die wichtigste Frage",
        description: "JavaScript bleibt auch 2025 wichtig.",
        timestamps: ["0:00 Überblick", "2:30 Features"],
      })
    );
    expect(result.title).toBe("JavaScript 2025: Die wichtigste Frage");
    expect(result.timestamps).toContain("0:00 Überblick");
  });

  it("strips en/em-dashes and hyphens from all string fields", () => {
    const result = ResponseParser.parseResponse(
      "youtube",
      JSON.stringify({
        transcript: "Text mit – Einschub – und Gedanken",
        title: "Cross-Platform-Titel",
        description: "Beschreibung — mit Em-Dash",
      })
    );
    expect(result.transcript).toBe("Text mit Einschub und Gedanken");
    expect(result.title).toBe("Cross Platform Titel");
    expect(result.description).toBe("Beschreibung mit Em Dash");
    expect(result.transcript).not.toContain("-");
  });

  it("lowercases hashtags in platform posts but not in the transcript field", () => {
    const post = ResponseParser.parseResponse(
      "linkedin",
      JSON.stringify({ linkedinPost: "Session! #VibeCoding #JavaScript" })
    );
    expect(post.linkedinPost).toContain("#vibecoding");
    expect(post.linkedinPost).not.toContain("#VibeCoding");

    const yt = ResponseParser.parseResponse(
      "youtube",
      JSON.stringify({ transcript: "Original #CamelCaseTag preserved" })
    );
    expect(yt.transcript).toContain("#CamelCaseTag");
  });
});
