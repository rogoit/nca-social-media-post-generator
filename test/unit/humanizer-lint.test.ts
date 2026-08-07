import { describe, it, expect } from "vitest";
import { lintPost } from "../../src/utils/humanizer-lint.js";

describe("humanizer-lint", () => {
  it("passes a clean dev post", () => {
    const post =
      "PHP bleibt relevant für viele Unternehmensanwendungen. Wir haben diese Woche eine Migration auf PHP 8.3 abgeschlossen. Die neue JIT-Compiler-Implementierung bringt 20 Prozent mehr Durchsatz in unserem Benchmark.";
    const report = lintPost(post);
    expect(report.blocked).toBe(false);
    expect(report.violations).toHaveLength(0);
  });

  it("flags a multi-violation slop post across all rule families", () => {
    const slop =
      "OpenCode revolutioniert die AI Coding Landschaft. Wir beleuchten das vielschichtige Zusammenspiel der Modelle. Die Integration ist nahtlos und entscheidend für moderne Entwicklungsteams. Der Meilenstein unterstreicht die Bedeutung offener Werkzeuge.";
    const report = lintPost(slop);
    expect(report.blocked).toBe(true);
    expect(report.violations.some((v) => v.type === "hard")).toBe(true);
    expect(report.violations.some((v) => v.type === "cluster")).toBe(true);
    expect(report.violations.some((v) => v.type === "phrase")).toBe(true);
  });
});
