import { describe, it, expect } from "vitest";
import { ResponseParser } from "../../src/utils/response-parser.js";

describe("ResponseParser", () => {
  describe("parseResponse", () => {
    it("should parse YouTube JSON response correctly", () => {
      const mockResponse = JSON.stringify({
        transcript: "This is the corrected transcript with proper punctuation.",
        title: "JavaScript 2025: Die wichtigste Frage",
        description:
          "JavaScript bleibt auch 2025 eine der wichtigsten Programmiersprachen.",
        timestamps: [
          "0:00 JavaScript 2025 Überblick",
          "2:30 Neue ES2024 Features",
          "5:00 Performance Verbesserungen",
        ],
      });

      const result = ResponseParser.parseResponse("youtube", mockResponse);

      expect(result.transcript).toBe(
        "This is the corrected transcript with proper punctuation."
      );
      expect(result.title).toBe("JavaScript 2025: Die wichtigste Frage");
      expect(result.description).toContain("JavaScript bleibt auch 2025");
      expect(result.timestamps).toContain("0:00 JavaScript 2025 Überblick");
    });

    it("should parse YouTube JSON response without timestamps", () => {
      const mockResponse = JSON.stringify({
        title: "Short Video Title",
        description: "This is a description without timestamps.",
      });

      const result = ResponseParser.parseResponse("youtube", mockResponse);

      expect(result.title).toBe("Short Video Title");
      expect(result.description).toBe("This is a description without timestamps.");
      expect(result.timestamps).toBeUndefined();
    });

    it("should parse LinkedIn JSON response correctly", () => {
      const mockResponse = JSON.stringify({
        linkedinPost:
          "Heute möchte ich über JavaScript sprechen. #javascript #webdev",
      });

      const result = ResponseParser.parseResponse("linkedin", mockResponse);

      expect(result.linkedinPost).toContain("JavaScript sprechen");
    });

    it("should parse Twitter JSON response correctly", () => {
      const mockResponse = JSON.stringify({
        twitterPost: "JavaScript 2025 bringt spannende neue Features! #javascript #webdev",
      });

      const result = ResponseParser.parseResponse("twitter", mockResponse);

      expect(result.twitterPost).toContain("JavaScript 2025 bringt");
    });

    it("should parse Instagram JSON response correctly", () => {
      const mockResponse = JSON.stringify({
        instagramPost:
          "JavaScript bleibt 2025 unverzichtbar. #nca #duisburg #ncatestify",
      });

      const result = ResponseParser.parseResponse("instagram", mockResponse);

      expect(result.instagramPost).toContain("JavaScript bleibt 2025");
    });

    it("should parse TikTok JSON response correctly", () => {
      const mockResponse = JSON.stringify({
        tiktokPost: "JavaScript Tipp für 2025: #programming #javascript",
      });

      const result = ResponseParser.parseResponse("tiktok", mockResponse);

      expect(result.tiktokPost).toContain("JavaScript Tipp");
    });

    it("should parse keywords JSON response correctly", () => {
      const mockResponse = JSON.stringify({
        transcript: "Some transcript.",
        keywords: ["JavaScript", "React", "TypeScript"],
      });

      const result = ResponseParser.parseResponse("keywords", mockResponse);

      expect(result.keywords).toEqual(["JavaScript", "React", "TypeScript"]);
    });

    it("should return empty object for malformed (non-JSON) responses", () => {
      const malformedResponse = "This is not JSON";

      const result = ResponseParser.parseResponse("youtube", malformedResponse);

      expect(result.transcript).toBeUndefined();
      expect(result.title).toBeUndefined();
      expect(result.description).toBeUndefined();
    });

    it("should handle empty responses", () => {
      const result = ResponseParser.parseResponse("youtube", "");
      expect(result).toEqual({});

      const keywordsResult = ResponseParser.parseResponse("keywords", "");
      expect(keywordsResult.keywords).toBeUndefined();
    });

    it("should normalize hashtags to lowercase in YouTube descriptions", () => {
      const mockResponse = JSON.stringify({
        transcript: "Heute zeige ich euch Vibe Coding mit Claude.",
        title: "Vibe Coding mit Claude: So funktioniert es",
        description: "Vibe Coding ist der neue Trend. #VibeCoding #JavaScript #WebDev",
      });

      const result = ResponseParser.parseResponse("youtube", mockResponse);

      expect(result.description).toContain("#vibecoding");
      expect(result.description).toContain("#javascript");
      expect(result.description).toContain("#webdev");
      expect(result.description).not.toContain("#VibeCoding");
      expect(result.description).not.toContain("#JavaScript");
    });

    it("should normalize hashtags to lowercase in LinkedIn posts", () => {
      const mockResponse = JSON.stringify({
        linkedinPost: "Check out this #VibeCoding session! #JavaScript #WebDev",
      });

      const result = ResponseParser.parseResponse("linkedin", mockResponse);

      expect(result.linkedinPost).toContain("#vibecoding");
      expect(result.linkedinPost).toContain("#javascript");
      expect(result.linkedinPost).not.toContain("#VibeCoding");
    });

    it("should normalize hashtags to lowercase in Twitter posts", () => {
      const mockResponse = JSON.stringify({
        twitterPost: "New tutorial on #ReactJS and #TypeScript! #CodingTips",
      });

      const result = ResponseParser.parseResponse("twitter", mockResponse);

      expect(result.twitterPost).toContain("#reactjs");
      expect(result.twitterPost).toContain("#typescript");
      expect(result.twitterPost).not.toContain("#ReactJS");
    });

    it("should normalize hashtags to lowercase in Instagram posts", () => {
      const mockResponse = JSON.stringify({
        instagramPost: "Amazing coding session! #NCA #Duisburg #JavaScript #WebDev",
      });

      const result = ResponseParser.parseResponse("instagram", mockResponse);

      expect(result.instagramPost).toContain("#nca");
      expect(result.instagramPost).toContain("#duisburg");
      expect(result.instagramPost).toContain("#javascript");
      expect(result.instagramPost).not.toContain("#NCA");
    });

    it("should normalize hashtags to lowercase in TikTok posts", () => {
      const mockResponse = JSON.stringify({
        tiktokPost: "Quick coding tip! #TechTok #LearnOnTikTok #CodingLife",
      });

      const result = ResponseParser.parseResponse("tiktok", mockResponse);

      expect(result.tiktokPost).toContain("#techtok");
      expect(result.tiktokPost).toContain("#learnontiktok");
      expect(result.tiktokPost).not.toContain("#TechTok");
    });

    it("should NOT normalize hashtags in transcript field", () => {
      const mockResponse = JSON.stringify({
        transcript: "Original text with #CamelCaseTag should be preserved",
      });

      const result = ResponseParser.parseResponse("youtube", mockResponse);

      expect(result.transcript).toContain("#CamelCaseTag");
    });

    it("should strip en-dash (–) and em-dash (—) from all string fields", () => {
      const mockResponse = JSON.stringify({
        transcript: "Text mit – Einschub – und Gedanken",
        title: "Titel – mit Gedankenstrich",
        description: "Beschreibung — mit Em-Dash",
      });

      const result = ResponseParser.parseResponse("youtube", mockResponse);

      expect(result.transcript).not.toContain("\u2013");
      expect(result.transcript).not.toContain("\u2014");
      expect(result.transcript).toBe("Text mit Einschub und Gedanken");
      expect(result.title).toBe("Titel mit Gedankenstrich");
      expect(result.description).toBe("Beschreibung mit Em Dash");
    });

    it("should strip ALL hyphens including compound-word hyphens", () => {
      const mockResponse = JSON.stringify({
        transcript: "Web-Entwicklung und E-Commerce sind wichtig",
        title: "Cross-Platform-Titel",
      });

      const result = ResponseParser.parseResponse("youtube", mockResponse);

      expect(result.transcript).toBe("Web Entwicklung und E Commerce sind wichtig");
      expect(result.title).toBe("Cross Platform Titel");
      expect(result.transcript).not.toContain("-");
      expect(result.title).not.toContain("-");
    });

    it("should strip en-dash from keyword array entries", () => {
      const mockResponse = JSON.stringify({
        transcript: "x",
        keywords: ["AI – PHP", "Symfony — Tools", "clean-keyword"],
      });

      const result = ResponseParser.parseResponse("keywords", mockResponse);

      expect(result.keywords).toEqual(["AI PHP", "Symfony Tools", "clean keyword"]);
      expect(result.keywords?.some((k) => /[\u002D\u2013\u2014]/.test(k))).toBe(false);
    });

    it("should strip en-dash from platform posts", () => {
      const mockResponse = JSON.stringify({
        linkedinPost: "Post – mit – vielen – Strichen",
        twitterPost: "Tweet — test",
      });

      const result = ResponseParser.parseResponse("linkedin", mockResponse);

      expect(result.linkedinPost).toBe("Post mit vielen Strichen");
      expect(result.linkedinPost).not.toContain("\u2013");
    });
  });

  describe("validateResponse", () => {
    it("should validate YouTube response requires title and description", () => {
      expect(ResponseParser.validateResponse("youtube", { title: "T", description: "D" })).toBeNull();
      expect(ResponseParser.validateResponse("youtube", { title: "", description: "D" })).not.toBeNull();
      expect(ResponseParser.validateResponse("youtube", { title: "T" })).not.toBeNull();
    });

    it("should validate keywords response requires keywords", () => {
      expect(ResponseParser.validateResponse("keywords", { keywords: ["a"] })).toBeNull();
      expect(ResponseParser.validateResponse("keywords", { keywords: [] })).not.toBeNull();
    });

    it("should validate platform posts", () => {
      expect(
        ResponseParser.validateResponse("linkedin", { linkedinPost: "post" })
      ).toBeNull();
      expect(
        ResponseParser.validateResponse("twitter", { twitterPost: "" })
      ).not.toBeNull();
    });
  });
});
