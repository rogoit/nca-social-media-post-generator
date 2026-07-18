import { describe, it, expect } from "vitest";
import { ChatPrompts } from "../../src/config/chat-prompts.js";

describe("ChatPrompts", () => {
  const transcript = "Heute zeige ich euch wie man mit clode code arbeitet.";

  describe("createInitialMessage", () => {
    it("should include brand names rules", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain("Never Code Alone");
    });

    it("should include the transcript", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain(transcript);
    });

    it("should request JSON with transcript and keywords fields", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain("JSON-Objekt");
      expect(msg).toContain('"transcript"');
      expect(msg).toContain('"keywords"');
    });

    it("should not request section-header format", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).not.toContain("TRANSCRIPT:");
      expect(msg).not.toContain("KEYWORDS:");
    });

    it("should include transcript correction hints", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain('"Claude"');
      expect(msg).toContain('"PHP"');
      expect(msg).toContain('"Sulu"');
    });

    it("should include humanizer rules forbidding hyphens and AI patterns", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain("Bindestriche");
      expect(msg).toContain("Schreibe wie ein Mensch");
    });

    it("should include expanded AI marker vocabulary in prompts", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain("revolutioniert");
      expect(msg).toContain("Game-Changer");
      expect(msg).toContain("KI-Marker-Vokabeln");
      expect(msg).toContain("Fake-Analyse-Anhänge");
      expect(msg).toContain("unterstreichen");
    });

    it("should include fact-grounding rules forbidding invented temporal/numeric claims", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain("Fakten aus dem Transkript");
      expect(msg).toContain("Zeitangaben");
      expect(msg).toContain("vor ein paar Tagen");
    });
  });

  describe("createPlatformMessage", () => {
    it("should create YouTube message requesting JSON with title and description fields", () => {
      const msg = ChatPrompts.createPlatformMessage("youtube");
      expect(msg).toContain("JSON-Objekt");
      expect(msg).toContain('"title"');
      expect(msg).toContain('"description"');
      expect(msg).not.toContain("TITLE:");
      expect(msg).not.toContain("DESCRIPTION:");
      expect(msg).not.toContain("Never Code Alone");
      expect(msg).toContain("NUR Fakten aus dem Transkript");
    });

    it("should include timestamps field when videoDuration provided", () => {
      const msg = ChatPrompts.createPlatformMessage("youtube", { videoDuration: "7:16" });
      expect(msg).toContain('"timestamps"');
      expect(msg).toContain("7:16");
    });

    it("should not mention timestamps field without videoDuration", () => {
      const msg = ChatPrompts.createPlatformMessage("youtube");
      expect(msg).not.toContain('"timestamps"');
    });

    it("should create LinkedIn message requesting JSON with linkedinPost field", () => {
      const msg = ChatPrompts.createPlatformMessage("linkedin");
      expect(msg).toContain("JSON-Objekt");
      expect(msg).toContain('"linkedinPost"');
      expect(msg).not.toContain("LINKEDIN POST:");
      expect(msg).not.toContain("Never Code Alone");
      expect(msg).toContain("NUR Fakten aus dem Transkript");
    });

    it("should create short Twitter message requesting JSON with twitterPost field", () => {
      const msg = ChatPrompts.createPlatformMessage("twitter");
      expect(msg).toContain("JSON-Objekt");
      expect(msg).toContain('"twitterPost"');
      expect(msg).not.toContain("TWITTER POST:");
      expect(msg.length).toBeLessThan(1000);
      expect(msg).toContain("NUR Fakten aus dem Transkript");
    });

    it("should create Instagram message with required hashtags", () => {
      const msg = ChatPrompts.createPlatformMessage("instagram");
      expect(msg).toContain("JSON-Objekt");
      expect(msg).toContain('"instagramPost"');
      expect(msg).toContain("#nca #duisburg #ncatestify");
      expect(msg).not.toContain("INSTAGRAM POST:");
      expect(msg).toContain("NUR Fakten aus dem Transkript");
    });

    it("should create TikTok message requesting JSON with tiktokPost field", () => {
      const msg = ChatPrompts.createPlatformMessage("tiktok");
      expect(msg).toContain("JSON-Objekt");
      expect(msg).toContain('"tiktokPost"');
      expect(msg).not.toContain("TIKTOK POST:");
      expect(msg).toContain("NUR Fakten aus dem Transkript");
    });
  });
});
