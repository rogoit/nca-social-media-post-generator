/**
 * Truncate `text` to the first `n` whitespace-separated words.
 * Returns the original string when it has `n` or fewer words (no truncation).
 */
export function previewWords(text: string, n = 10): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const words = trimmed.split(/\s+/);
  if (words.length <= n) return trimmed;
  return `${words.slice(0, n).join(" ")}…`;
}
