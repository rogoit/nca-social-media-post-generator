import { describe, it, expect } from "vitest";
import { getYoutubeResponseFormat } from "../../src/config/schemas.js";

describe("getYoutubeResponseFormat", () => {
  it("should NOT include a timestamps property when no videoDuration is given", () => {
    const format = getYoutubeResponseFormat();
    const schema = format.json_schema.schema as {
      properties: Record<string, object>;
      required: string[];
    };

    expect(schema.properties).toHaveProperty("title");
    expect(schema.properties).toHaveProperty("description");
    expect(schema.properties).not.toHaveProperty("timestamps");
    expect(schema.required).toEqual(["title", "description"]);
  });

  it("should include a required timestamps property when videoDuration is given", () => {
    const format = getYoutubeResponseFormat("7:16");
    const schema = format.json_schema.schema as {
      properties: Record<string, object>;
      required: string[];
    };

    expect(schema.properties).toHaveProperty("timestamps");
    expect(schema.required).toContain("timestamps");
    expect(schema.required).toEqual(["title", "description", "timestamps"]);
  });

  it("should be strict json_schema", () => {
    const format = getYoutubeResponseFormat();
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
  });
});
