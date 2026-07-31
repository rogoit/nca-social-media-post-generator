// JSON Schemas for Mistral structured output (response_format: json_schema mode).
// Each schema guarantees the model returns valid JSON matching these fields,
// eliminating markdown / section-header leaks across all generated content.

export type MistralResponseFormat = {
  type: "json_schema";
  json_schema: {
    schema: object;
    name: string;
    strict: true;
  };
};

function wrap(schema: object, name: string): MistralResponseFormat {
  return { type: "json_schema", json_schema: { schema, name, strict: true } };
}

export const TRANSCRIPT_RESPONSE_FORMAT = wrap(
  {
    type: "object",
    properties: {
      transcript: { type: "string" },
      keywords: { type: "array", items: { type: "string" }, maxItems: 3 },
    },
    required: ["transcript", "keywords"],
    additionalProperties: false,
  },
  "transcript_keywords"
);

// YouTube schema is dynamic: the "timestamps" property is only declared when a
// videoDuration is provided. With additionalProperties:false + strict:true this
// guarantees the model cannot return timestamps when they were not requested.
export function getYoutubeResponseFormat(videoDuration?: string): MistralResponseFormat {
  const properties: Record<string, object> = {
    title: { type: "string" },
    description: { type: "string" },
  };
  const required: string[] = ["title", "description"];

  if (videoDuration) {
    properties.timestamps = { type: "array", items: { type: "string" } };
    required.push("timestamps");
  }

  return wrap(
    {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
    "youtube_content"
  );
}

export const LINKEDIN_RESPONSE_FORMAT = wrap(
  {
    type: "object",
    properties: {
      linkedinPost: { type: "string" },
    },
    required: ["linkedinPost"],
    additionalProperties: false,
  },
  "linkedin_post"
);

export const INSTAGRAM_RESPONSE_FORMAT = wrap(
  {
    type: "object",
    properties: {
      instagramPost: { type: "string" },
    },
    required: ["instagramPost"],
    additionalProperties: false,
  },
  "instagram_post"
);

export const TIKTOK_RESPONSE_FORMAT = wrap(
  {
    type: "object",
    properties: {
      tiktokPost: { type: "string" },
    },
    required: ["tiktokPost"],
    additionalProperties: false,
  },
  "tiktok_post"
);
