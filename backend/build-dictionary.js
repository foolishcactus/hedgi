import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "markets.db");
const OUTPUT_PATH = path.join(__dirname, "keyword_dictionary.json");

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "with",
  "will",
  "would",
  "could",
  "should",
  "i",
  "we",
  "you",
  "our",
  "my",
  "your",
  "they",
  "them",
  "us",
  "about",
  "into",
  "over",
  "under",
  "between",
  "after",
  "before",
  "during",
  "up",
  "down",
  "out",
  "so",
  "if",
  "but",
  "than",
  "then",
  "also",
  "any",
  "all",
  "more",
  "most",
  "less",
  "least",
  "very",
  "can",
  "may",
  "might",
]);

const tokenize = (value) =>
  (value || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const stemToken = (token) => {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 3) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ing") && token.length > 4) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 3) return token.slice(0, -2);
  if (token.endsWith("es") && token.length > 3) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  return token;
};

const buildDictionary = () => {
  const db = new Database(DB_PATH);
  const rows = db.prepare("SELECT title FROM markets WHERE platform = 'kalshi'").all();
  const counts = new Map();

  for (const row of rows) {
    const tokens = tokenize(row.title);
    for (const token of tokens) {
      if (STOPWORDS.has(token)) continue;
      const stem = stemToken(token);
      if (stem.length < 2) continue;
      counts.set(stem, (counts.get(stem) || 0) + 1);
    }
  }

  const entries = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const terms = entries.map(([term]) => term);

  const payload = {
    generated_at: new Date().toISOString(),
    total_terms: terms.length,
    terms,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Keyword dictionary written to ${OUTPUT_PATH}`);
  console.log(`Total terms: ${terms.length}`);
};

try {
  buildDictionary();
} catch (err) {
  console.error("Failed to build keyword dictionary:", err?.message || err);
  process.exitCode = 1;
}
