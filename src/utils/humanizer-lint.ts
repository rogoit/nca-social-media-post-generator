/**
 * Humanizer lint: post-generation validator for German AI slop.
 * Inspired by marmbiz/humanizer-de Patterns 64 (KI-Marker-Vokabular) and 66 (Fake-Analyse-Anhang).
 * Pure function, no external deps. Mirrors humanizer-de's cluster-threshold semantics.
 */

// Zero-tolerance words: any single occurrence blocks (high-slop signal on its own).
const HARD_BLOCK_WORDS = [
  "revolutionär",
  "revolution",
  "revolutionieren",
  "revolutioniert",
  "transformiert",
  "transformation",
  "game-changer",
  "game-changing",
  "gamechanger",
  "disruption",
  "disruptiv",
  "disrupt",
  "paradigmenwechsel",
  "bahnbrechend",
  "zukunftsweisend",
  "meilenstein",
  "ultimativ",
  "unglaublich",
];

// Pattern 64 (KI-Marker-Vokabular): cluster rule fires when 3+ distinct markers co-occur.
const CLUSTER_WORDS = [
  // Verben
  "beleuchten",
  "eintauchen",
  "unterstreichen",
  "aufzeigen",
  "entfesseln",
  // Adjektive
  "spannend",
  "entscheidend",
  "maßgeblich",
  "nahtlos",
  "vielschichtig",
  "facettenreich",
  "dynamisch",
  "ganzheitlich",
  "maßgeschneidert",
  "essenziell",
  // Abstrakta
  "zusammenspiel",
  "spannungsfeld",
];

// Multi-word cluster phrases (Pattern 64 figurative abstractions).
const CLUSTER_PHRASES = ["die digitale landschaft", "die mediale landschaft", "die reise"];

// Pattern 66 (Fake-Analyse-Anhang): relative clauses that simulate analysis without new info.
const FAKE_ANALYSIS_PATTERNS = [
  // "was X unterstreicht/belegt/verdeutlicht/bestätigt/beweist" — X can be a long noun phrase
  /\bwas\b[\s\w]{0,50}\b(unterstreicht|belegt|verdeutlicht|bestätigt|beweist)\b/i,
  // "und zeigt/verdeutlicht damit, dass ..."
  /\bund\s+(zeigt|verdeutlicht)\s+damit,?\s*dass\b/i,
  // "und macht deutlich, wie wichtig ..."
  /\bund\s+macht\s+deutlich,?\s+wie\s+wichtig\b/i,
  // "unterstreicht die Bedeutung/Wichtigkeit von ..." (with or without leading "und")
  /\bunterstreicht\s+die\s+(bedeutung|wichtigkeit)(\s+von)?\b/i,
];

const CLUSTER_THRESHOLD = 3;

export interface HumanizerViolation {
  word: string;
  type: "hard" | "cluster" | "phrase";
  context: string;
}

export interface HumanizerReport {
  violations: HumanizerViolation[];
  blocked: boolean;
}

function getContext(text: string, matchIndex: number, matchLength: number, radius = 30): string {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(text.length, matchIndex + matchLength + radius);
  return text.slice(start, end).trim();
}

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWordOccurrences(text: string, word: string): { index: number; word: string }[] {
  const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, "giu");
  const matches: { index: number; word: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    matches.push({ index: m.index, word: m[0] });
  }
  return matches;
}

export function lintPost(text: string): HumanizerReport {
  if (!text || typeof text !== "string") {
    return { violations: [], blocked: false };
  }

  const violations: HumanizerViolation[] = [];
  const clusterHits = new Set<string>();
  const clusterHitContexts = new Map<string, string>();

  // 1. Hard-block words: any occurrence blocks
  for (const word of HARD_BLOCK_WORDS) {
    const occurrences = findWordOccurrences(text, word);
    for (const occ of occurrences) {
      violations.push({
        word: occ.word,
        type: "hard",
        context: getContext(text, occ.index, occ.word.length),
      });
    }
  }

  // 2. Pattern 64 cluster words: count distinct hits
  for (const word of CLUSTER_WORDS) {
    const occurrences = findWordOccurrences(text, word);
    if (occurrences.length > 0) {
      clusterHits.add(word);
      clusterHitContexts.set(
        word,
        getContext(text, occurrences[0].index, occurrences[0].word.length)
      );
    }
  }

  // 2b. Pattern 64 cluster phrases
  for (const phrase of CLUSTER_PHRASES) {
    const occurrences = findWordOccurrences(text, phrase);
    if (occurrences.length > 0) {
      clusterHits.add(phrase);
      clusterHitContexts.set(
        phrase,
        getContext(text, occurrences[0].index, occurrences[0].word.length)
      );
    }
  }

  // Fire only when 3+ distinct markers co-occur (matches humanizer-de semantics)
  if (clusterHits.size >= CLUSTER_THRESHOLD) {
    for (const word of clusterHits) {
      violations.push({
        word,
        type: "cluster",
        context: clusterHitContexts.get(word) || "",
      });
    }
  }

  // 3. Pattern 66: Fake-Analyse-Anhang phrases
  for (const pattern of FAKE_ANALYSIS_PATTERNS) {
    const m = pattern.exec(text);
    if (m) {
      violations.push({
        word: m[0].trim(),
        type: "phrase",
        context: getContext(text, m.index, m[0].length),
      });
    }
  }

  return {
    violations,
    blocked: violations.length > 0,
  };
}

/**
 * Returns a comma-separated list of unique forbidden words for AI retry feedback.
 */
export function formatViolationsForRetry(report: HumanizerReport): string {
  const unique = Array.from(new Set(report.violations.map((v) => v.word)));
  return unique.join(", ");
}
