import { describe, it, expect } from "vitest";
import { lintPost, formatViolationsForRetry } from "../../src/utils/humanizer-lint.js";

describe("humanizer-lint", () => {
  describe("clean text", () => {
    it("passes a clean dev LinkedIn post", () => {
      const post =
        "PHP bleibt relevant für viele Unternehmensanwendungen. Wir haben diese Woche eine Migration auf PHP 8.3 abgeschlossen. Die neue JIT-Compiler-Implementierung bringt 20 Prozent mehr Durchsatz in unserem Benchmark.";
      const report = lintPost(post);
      expect(report.blocked).toBe(false);
      expect(report.violations).toHaveLength(0);
    });

    it("passes an empty string", () => {
      expect(lintPost("").blocked).toBe(false);
    });

    it("passes null or undefined safely", () => {
      expect(lintPost(null as unknown as string).blocked).toBe(false);
      expect(lintPost(undefined as unknown as string).blocked).toBe(false);
    });
  });

  describe("hard-block words (zero tolerance)", () => {
    it("flags single 'revolutioniert'", () => {
      const post = "OpenCode revolutioniert die AI Coding Welt.";
      const report = lintPost(post);
      expect(report.blocked).toBe(true);
      expect(report.violations.some((v) => v.word.toLowerCase() === "revolutioniert")).toBe(true);
      expect(report.violations[0].type).toBe("hard");
    });

    it("flags 'Game-Changer' case-insensitive", () => {
      const post = "Vitest ist ein game-changer für Frontend-Tests.";
      const report = lintPost(post);
      expect(report.blocked).toBe(true);
      expect(report.violations.some((v) => /game-?changer/i.test(v.word))).toBe(true);
    });

    it("flags 'Paradigmenwechsel'", () => {
      const post = "AI Coding ist ein Paradigmenwechsel für Teams.";
      const report = lintPost(post);
      expect(report.blocked).toBe(true);
    });

    it("flags 'bahnbrechend'", () => {
      const post = "Die neue Version ist bahnbrechend.";
      const report = lintPost(post);
      expect(report.blocked).toBe(true);
    });

    it("does not match substrings inside other words", () => {
      // "Meilenstein" should match, but "meilensteine" inside a longer word like
      // "ratemeilensteine" would still match by word-boundary rules; we test the
      // negative case: 'Meilensteingasse' (a street name) should NOT trigger.
      const post = "Wir wohnen in der Meilensteingasse.";
      const report = lintPost(post);
      expect(report.blocked).toBe(false);
    });
  });

  describe("Pattern 64 cluster rule (3+ distinct markers)", () => {
    it("allows a single soft marker like 'spannend'", () => {
      const post = "Das war ein spannendes Projekt.";
      const report = lintPost(post);
      expect(report.blocked).toBe(false);
    });

    it("allows two distinct soft markers (below threshold)", () => {
      const post = "Wir beleuchten das Thema. Die Lösung wirkt nahtlos.";
      const report = lintPost(post);
      expect(report.blocked).toBe(false);
    });

    it("flags a cluster of 3 distinct markers", () => {
      const post =
        "Wir beleuchten das vielschichtige Thema. Die Integration wirkt nahtlos und entscheidend für den Erfolg.";
      const report = lintPost(post);
      expect(report.blocked).toBe(true);
      const clusterViolations = report.violations.filter((v) => v.type === "cluster");
      expect(clusterViolations.length).toBeGreaterThanOrEqual(3);
    });

    it("does not double-count the same marker repeated", () => {
      // "spannend" 3x should still count as 1 distinct cluster hit, below threshold
      const post = "Spannend, wirklich spannend, einfach spannend.";
      const report = lintPost(post);
      expect(report.blocked).toBe(false);
    });
  });

  describe("Pattern 66 (Fake-Analyse-Anhang)", () => {
    it("flags 'was die Wichtigkeit unterstreicht'", () => {
      const post =
        "Die Migration wurde in drei Wochen abgeschlossen, was die Wichtigkeit guter Planung unterstreicht.";
      const report = lintPost(post);
      expect(report.blocked).toBe(true);
      expect(report.violations.some((v) => v.type === "phrase")).toBe(true);
    });

    it("flags 'und zeigt damit, dass'", () => {
      const post = "Die Lasttests grün, und zeigt damit, dass das System skalierbar ist.";
      const report = lintPost(post);
      expect(report.blocked).toBe(true);
    });

    it("flags 'und macht deutlich, wie wichtig'", () => {
      const post =
        "Der Ausfall dauerte sechs Stunden und macht deutlich, wie wichtig Backups sind.";
      const report = lintPost(post);
      expect(report.blocked).toBe(true);
    });
  });

  describe("realistic Gemini slop sample", () => {
    it("flags a multi-violation LinkedIn slop post", () => {
      const slop =
        "OpenCode revolutioniert die AI Coding Landschaft. Wir beleuchten das vielschichtige Zusammenspiel der Modelle. Die Integration ist nahtlos und entscheidend für moderne Entwicklungsteams. Der Meilenstein unterstreicht die Bedeutung offener Werkzeuge.";
      const report = lintPost(slop);
      expect(report.blocked).toBe(true);
      // Expect hard-block (revolutioniert, Meilenstein), cluster (3+ soft markers), and phrase (unterstreicht die Bedeutung)
      expect(report.violations.some((v) => v.type === "hard")).toBe(true);
      expect(report.violations.some((v) => v.type === "cluster")).toBe(true);
      expect(report.violations.some((v) => v.type === "phrase")).toBe(true);
    });
  });

  describe("formatViolationsForRetry", () => {
    it("returns unique comma-separated words", () => {
      const post = "revolutioniert und nochmal revolutioniert";
      const report = lintPost(post);
      const formatted = formatViolationsForRetry(report);
      // 'revolutioniert' appears twice in violations but should dedupe
      expect(formatted).toBe("revolutioniert");
    });

    it("returns multiple distinct words separated by comma", () => {
      const post = "Das ist bahnbrechend und ein Game-Changer.";
      const report = lintPost(post);
      const formatted = formatViolationsForRetry(report);
      const words = formatted.split(", ").map((w) => w.toLowerCase());
      expect(words).toContain("bahnbrechend");
      expect(words).toContain("game-changer");
    });
  });
});
