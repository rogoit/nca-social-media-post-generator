import { describe, it, expect } from "vitest";
import { validateTranscript, validateVideoFile } from "../../src/utils/validation.js";

describe("validation", () => {
  it("accepts a valid transcript and rejects an empty one", () => {
    expect(validateTranscript("This is a valid transcript.")).toBe(null);
    expect(validateTranscript("")).toBe("Bitte gib ein gültiges Transkript ein.");
    expect(validateTranscript("   \n\t   ")).toBe("Bitte gib ein gültiges Transkript ein.");
  });

  it("accepts arbitrarily large video files (no size cap)", () => {
    expect(validateVideoFile({ name: "huge.mp4", size: 5_000_000_000, type: "video/mp4" })).toBe(
      null
    );
  });

  it("rejects a non-video mime type", () => {
    expect(validateVideoFile({ name: "doc.pdf", size: 1000, type: "application/pdf" })).toContain(
      "MP4, MOV, WebM"
    );
  });
});
