import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { db } from "./db.js";
import { syncKalshiMarkets } from "./sync.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KEYWORD_DICT_FILE = path.join(__dirname, "keyword_dictionary.json");

const PORT = Number(process.env.PORT || 3000);
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SYNC_ON_START = process.env.SYNC_ON_START !== "false";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_LOG_PROMPTS = process.env.GEMINI_LOG_PROMPTS === "true";
const GEMINI_PROMPT_LOG_PATH =
  process.env.GEMINI_PROMPT_LOG_PATH || path.join(__dirname, "gemini_prompts.log");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

let lastSyncTime = null;
let isSyncing = false;

const normalizeJsonText = (text) => {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        result += char;
        escaped = true;
        continue;
      }

      if (char === "\"") {
        result += char;
        inString = false;
        continue;
      }

      if (char === "\n") {
        result += "\\n";
        continue;
      }

      if (char === "\r") {
        if (cleaned[i + 1] === "\n") i += 1;
        result += "\\n";
        continue;
      }

      result += char;
      continue;
    }

    if (char === "\"") {
      result += char;
      inString = true;
      continue;
    }

    result += char;
  }

  return result;
};

const parseGeminiJson = (text) => {
  const normalized = normalizeJsonText(text);
  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(normalized);

  if (!parsed) {
    const firstBrace = normalized.indexOf("{");
    const firstBracket = normalized.indexOf("[");
    const start =
      firstBrace === -1
        ? firstBracket
        : firstBracket === -1
          ? firstBrace
          : Math.min(firstBrace, firstBracket);

    const lastBrace = normalized.lastIndexOf("}");
    const lastBracket = normalized.lastIndexOf("]");
    const end = Math.max(lastBrace, lastBracket);

    if (start !== -1 && end > start) {
      parsed = tryParse(normalized.slice(start, end + 1));
    }
  }

  if (typeof parsed === "string") {
    parsed = tryParse(parsed) || parsed;
  }

  return parsed ?? null;
};

const sanitizeStringArray = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseOptionalNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const num = Number(cleaned);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const clampOptional = (value, min, max) =>
  typeof value === "number" ? Math.min(max, Math.max(min, value)) : null;

const parseOptionalRatio = (value) => {
  const num = parseOptionalNumber(value);
  if (num === null) return null;
  const normalized = num > 1 ? num / 100 : num;
  return clampOptional(normalized, 0, 1);
};

const extractInputs = (parsed) => {
  if (!parsed || typeof parsed !== "object") return null;
  const raw =
    parsed.inputs && typeof parsed.inputs === "object" ? parsed.inputs : parsed;

  const expectedProfit =
    parseOptionalNumber(raw.expected_profit ?? raw.expectedProfit ?? raw.profit) ?? null;
  const lossIfEvent =
    parseOptionalNumber(raw.loss_if_event ?? raw.lossIfEvent ?? raw.loss) ?? null;
  const hedgeCoverage = parseOptionalRatio(
    raw.hedge_coverage ?? raw.hedgeCoverage ?? raw.coverage,
  );
  const lossIfEventPercent = parseOptionalRatio(
    raw.loss_if_event_percent ??
      raw.lossIfEventPercent ??
      raw.loss_percent ??
      raw.lossPercent ??
      raw.loss_pct,
  );
  const maxHedgeCost =
    parseOptionalNumber(raw.max_hedge_cost ?? raw.maxHedgeCost ?? raw.max_budget ?? raw.budget) ??
    null;

  const normalized = {
    expected_profit: expectedProfit,
    loss_if_event: lossIfEvent,
    loss_if_event_percent: lossIfEventPercent,
    hedge_coverage: hedgeCoverage,
    max_hedge_cost: maxHedgeCost,
  };

  const hasAny = Object.values(normalized).some((value) => typeof value === "number");
  return hasAny ? normalized : null;
};

const buildKeywordPrompt = (input, dictionaryTerms) => `
You are a Business Risk & Derivatives Analyst helping small businesses identify prediction markets (e.g., Kalshi) for hedging.

### TASK:
1. Analyze the business description to identify the **Primary Exposure**.
2. Determine the "Long" (what benefits them) and "Short" (what hurts them) positions of the business.
3. Extract search keywords that match relevant contract titles on prediction markets.

### OUTPUT RULES:
- **Return ONLY valid JSON.**
- **Keywords:** Select EXACTLY 10 single-word tokens ONLY.
- **IMPORTANT:** You MUST choose the 10 best-matching words from the AVAILABLE KEYWORDS list below.
- **No phrases.** Split multi-word concepts (e.g., "Fed Funds" becomes "Fed", "Funds").
- **Synonyms:** Include exact title terms, close synonyms, and plural variants when they exist in the AVAILABLE KEYWORDS.
- **Geo/Time:** Prefer 2-4 regional terms and 2-4 seasonal months. **IMPORTANT:** DO NOT output off-season months (e.g., exclude summer months for a ski resort).
- **Measurements:** Prefer 2-5 measurement terms (e.g., "inches", "degrees", "knots", "millimeter") if relevant.
- **Strictness:** Avoid vague words like "risk" or "uncertainty." Focus on external, measurable variables.

### INPUT:
"${input}"

### AVAILABLE KEYWORDS (use ONLY these; single tokens):
${JSON.stringify(dictionaryTerms)}

### OUTPUT FORMAT:
{
  "analysis": {
    "primary_risk_factor": "string",
    "is_long": "economic variable that helps the business",
    "is_short": "economic variable that hurts the business"
  },
  "keywords": ["word1", "word2", "word3"],
  "inputs": {
    "expected_profit": number | null,
    "loss_if_event": number | null,
    "loss_if_event_percent": number | null,
    "hedge_coverage": number | null,
    "max_hedge_cost": number | null
  }
}
`.trim();

const buildScoringPrompt = (businessDescription, markets) => `
You are a financial risk analyst evaluating prediction markets for business hedging purposes.

Business Description: "${businessDescription}"

Markets to Score:
${JSON.stringify(markets)}

SCORING CRITERIA (0-10 each):
1. RELEVANCE (0-10)
2. HEDGING UTILITY (0-10)
3. TIMING ALIGNMENT (0-10)

HARD FILTER RULES (MANDATORY):
- If a market resolves clearly outside the business risk window, set ALL THREE SCORES to 0 and explain why.
  Example: Ski resort winter risk -> June/July/August markets must be 0.
- If geography is clearly mismatched for a local weather risk, set scores <= 3 unless the title explicitly frames it as a broad proxy.
- Prefer direct measures (snowfall/snowpack/snow depth/precipitation) over generic "temperature increase" unless winter + location align.

OUTPUT FORMAT:
Return ONLY valid JSON, no markdown, no explanation:
{
  "scored_markets": [
    {
      "ticker": "market_ticker",
      "title": "market_title",
      "platform": "kalshi",
      "relevance_score": 0-10,
      "hedging_utility_score": 0-10,
      "timing_score": 0-10,
      "overall_score": 0-10 (average of the three scores),
      "reasoning": "2-3 sentence explanation"
    }
  ]
}

IMPORTANT:
- overall_score MUST equal the average of the three scores (not "vibes").
- If a market is out-of-season, all scores MUST be 0.
- Use the EXACT "ticker" values from the Markets to Score list. Do NOT invent or substitute tickers.

Return ONLY the JSON scoring result.
`.trim();

const logSyncStart = () => {
  console.log(`Starting sync at ${new Date().toISOString()}`);
};

const runSync = async () => {
  if (isSyncing) return null;
  isSyncing = true;
  logSyncStart();

  const kalshiResult = await syncKalshiMarkets(db);
  console.log(`Fetched ${kalshiResult.fetched} total Kalshi markets`);
  console.log(
    `Stored ${kalshiResult.stored} relevant Kalshi markets (filtered out ${kalshiResult.filtered})`,
  );

  lastSyncTime = new Date().toISOString();
  console.log(`Sync complete: ${kalshiResult.stored} Kalshi markets`);
  try {
    buildKeywordDictionary();
  } catch (err) {
    console.warn("Keyword dictionary rebuild failed:", err?.message || err);
  }

  isSyncing = false;
  return { kalshi: kalshiResult };
};

const getCountsByPlatform = () => {
  const row = db.prepare("SELECT COUNT(*) as count FROM markets WHERE platform = 'kalshi'").get();
  const kalshi = row?.count ?? 0;
  return { kalshi, total: kalshi };
};

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

const SYNONYM_MAP = {
  twister: ["tornado"],
  twisters: ["tornado"],
  cyclone: ["hurricane"],
  cyclones: ["hurricane"],
  typhoon: ["hurricane"],
  typhoons: ["hurricane"],
  flooding: ["flood"],
  floods: ["flood"],
  droughts: ["drought"],
  wildfires: ["wildfire"],
  blizzard: ["snow", "snowfall"],
  blizzards: ["snow", "snowfall"],
};

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

const buildKeywordStems = (keywords) =>
  keywords
    .map((keyword) => tokenize(keyword).map(stemToken).filter(Boolean))
    .filter((tokens) => tokens.length > 0);

const scoreTitleAgainstKeywords = (title, keywordStems) => {
  const titleTokens = tokenize(title).map(stemToken);
  const titleSet = new Set(titleTokens);
  let score = 0;

  for (const keywordTokens of keywordStems) {
    const matches = keywordTokens.every((token) => titleSet.has(token));
    if (matches) score += 1;
  }

  return score;
};

let keywordDictionarySet = null;
let keywordDictionaryList = null;
let keywordDictionaryBuiltAt = null;

const buildKeywordDictionary = () => {
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

  keywordDictionarySet = new Set(counts.keys());
  keywordDictionaryList = entries.map(([term]) => term);
  keywordDictionaryBuiltAt = lastSyncTime || "startup";
  console.log(`Keyword dictionary built: ${keywordDictionarySet.size} terms`);
  try {
    const payload = {
      generated_at: new Date().toISOString(),
      total_terms: keywordDictionarySet.size,
      terms: keywordDictionaryList,
    };
    fs.writeFileSync(KEYWORD_DICT_FILE, JSON.stringify(payload, null, 2));
    console.log(`Keyword dictionary written to ${KEYWORD_DICT_FILE}`);
  } catch (err) {
    console.warn("Failed to write keyword dictionary file:", err?.message || err);
  }
  return { set: keywordDictionarySet, list: keywordDictionaryList };
};

const getKeywordDictionarySet = () => {
  if (!keywordDictionarySet || keywordDictionaryBuiltAt !== (lastSyncTime || "startup")) {
    return buildKeywordDictionary().set;
  }
  return keywordDictionarySet;
};

const getKeywordDictionaryList = () => {
  if (!keywordDictionaryList || keywordDictionaryBuiltAt !== (lastSyncTime || "startup")) {
    return buildKeywordDictionary().list;
  }
  return keywordDictionaryList;
};

const extractKeywordsFromDescription = (description, maxKeywords = 15) => {
  const dict = getKeywordDictionarySet();
  const matches = new Set();
  const tokens = tokenize(description);

  for (const token of tokens) {
    if (STOPWORDS.has(token)) continue;
    const stem = stemToken(token);
    if (dict.has(stem)) {
      matches.add(stem);
    }
    const synonyms = SYNONYM_MAP[stem] || SYNONYM_MAP[token] || [];
    for (const synonym of synonyms) {
      const synStem = stemToken(synonym);
      if (dict.has(synStem)) {
        matches.add(synStem);
      }
    }
  }

  return Array.from(matches).slice(0, Math.max(1, maxKeywords));
};

const normalizeGeminiKeywords = (keywords) => {
  const dict = getKeywordDictionarySet();
  const normalized = [];

  for (const keyword of keywords) {
    const token = tokenize(keyword)[0];
    if (!token) continue;
    const stem = stemToken(token);
    if (dict.has(stem)) {
      normalized.push(stem);
    }
  }

  return Array.from(new Set(normalized)).slice(0, 10);
};

const parseNumberWithSuffix = (value) => {
  if (!value) return null;
  const match = value.toString().match(/-?\d+(?:[\d,]*\d)?(?:\.\d+)?\s*[kKmMbB]?/);
  if (!match) return null;
  const raw = match[0].replace(/,/g, "").trim();
  const suffix = raw.slice(-1).toLowerCase();
  const numeric = suffix.match(/[kmb]/) ? raw.slice(0, -1) : raw;
  const num = Number(numeric);
  if (!Number.isFinite(num)) return null;
  const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
  return num * multiplier;
};

const findAmountNear = (text, pattern) => {
  const match = text.match(pattern);
  if (!match || match.length < 2) return null;
  return parseNumberWithSuffix(match[1]);
};

const parseInputsFromDescription = (description) => {
  const text = description || "";

  const expectedProfit = findAmountNear(
    text,
    /(profit|revenue|sales)\D{0,20}\$?\s*([\d,]+(?:\.\d+)?\s*[kKmMbB]?)/i,
  );
  const lossIfEvent = findAmountNear(
    text,
    /(loss|lose|lost|damage|cost|hit|drop|decline)\D{0,20}\$?\s*([\d,]+(?:\.\d+)?\s*[kKmMbB]?)/i,
  );
  const maxHedgeCost = findAmountNear(
    text,
    /(budget|max|cap)\D{0,20}\$?\s*([\d,]+(?:\.\d+)?\s*[kKmMbB]?)/i,
  );

  let lossPercent = null;
  let hedgeCoverage = null;
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const value = Number(percentMatch[1]);
    if (Number.isFinite(value)) {
      const normalized = value > 1 ? value / 100 : value;
      const context = text.slice(Math.max(0, percentMatch.index - 20), percentMatch.index + 20);
      if (/(hedge|cover)/i.test(context)) {
        hedgeCoverage = normalized;
      } else {
        lossPercent = normalized;
      }
    }
  }

  if (
    expectedProfit === null &&
    lossIfEvent === null &&
    lossPercent === null &&
    hedgeCoverage === null &&
    maxHedgeCost === null
  ) {
    return null;
  }

  return {
    expected_profit: expectedProfit,
    loss_if_event: lossIfEvent,
    loss_if_event_percent: lossPercent,
    hedge_coverage: hedgeCoverage,
    max_hedge_cost: maxHedgeCost,
  };
};

const logGeminiPrompt = (label, prompt) => {
  if (!GEMINI_LOG_PROMPTS) return;
  try {
    console.log(`--- GEMINI ${label.toUpperCase()} ---`);
    console.log(prompt);
    console.log("--- END GEMINI PROMPT ---");
    const entry = `[${new Date().toISOString()}] ${label}\n${prompt}\n---\n`;
    fs.appendFileSync(GEMINI_PROMPT_LOG_PATH, entry, "utf8");
    console.log(`Gemini prompt logged: ${label}`);
  } catch (err) {
    console.warn("Failed to log Gemini prompt:", err?.message || err);
  }
};

const searchMarketsByKeywords = (keywords, limit = 10) => {
  const keywordStems = buildKeywordStems(keywords);
  if (!keywordStems.length) return [];

  const rows = db
    .prepare(
      "SELECT platform, ticker, title, market_ticker, price_yes FROM markets WHERE platform = 'kalshi'",
    )
    .all();
  console.log(`DB rows scanned: ${rows.length}`);

  const scored = [];
  for (const row of rows) {
    const score = scoreTitleAgainstKeywords(row.title, keywordStems);
    if (score <= 0) continue;
    scored.push({ ...row, score });
  }

  scored.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  console.log(`Matched rows: ${scored.length}`);
  return scored.slice(0, Math.max(1, Number(limit))).map(({ score, ...row }) => row);
};

const sanitizeScores = (raw, allowedTickers, allowedMarketTickers = []) => {
  if (!raw || typeof raw !== "object") return [];
  const items = Array.isArray(raw.scored_markets) ? raw.scored_markets : [];
  const allowed = new Set(allowedTickers);
  const allowedMarket = new Set(allowedMarketTickers);

  const clamp = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(10, num));
  };

  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const ticker =
        typeof item.ticker === "string"
          ? item.ticker
          : typeof item.market_ticker === "string"
            ? item.market_ticker
            : "";
      if (!ticker) return null;
      const normalizedTicker = allowed.has(ticker)
        ? ticker
        : allowedMarket.has(ticker)
          ? ticker
          : "";
      if (!normalizedTicker) return null;

      const relevance = clamp(item.relevance_score);
      const hedging = clamp(item.hedging_utility_score);
      const timing = clamp(item.timing_score);
      const overall =
        typeof item.overall_score === "number"
          ? clamp(item.overall_score)
          : clamp((relevance + hedging + timing) / 3);

      return {
        ticker: normalizedTicker,
        title: typeof item.title === "string" ? item.title : "",
        platform: typeof item.platform === "string" ? item.platform : "kalshi",
        relevance_score: relevance,
        hedging_utility_score: hedging,
        timing_score: timing,
        overall_score: overall,
        reasoning: typeof item.reasoning === "string" ? item.reasoning : "",
      };
    })
    .filter(Boolean);
};

app.get("/api/status", (req, res) => {
  res.json({
    lastSyncTime,
    counts: getCountsByPlatform(),
    syncing: isSyncing,
  });
});

app.post("/api/sync", async (req, res) => {
  try {
    const result = await runSync();
    res.json({
      ok: true,
      lastSyncTime,
      result,
    });
  } catch (err) {
    console.error("Error: manual sync failed", err?.message || err);
    res.status(500).json({ ok: false, error: "sync_failed" });
  }
});

app.get("/api/search", (req, res) => {
  try {
    const raw = typeof req.query.keywords === "string" ? req.query.keywords : "";
    const keywords = raw
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    console.log(`Gemini keywords: ${keywords.join(", ")}`);

    if (!keywords.length) {
      res.json([]);
      return;
    }

    const rows = searchMarketsByKeywords(keywords, 10);

    res.json(rows);
  } catch (err) {
    console.error("Error: search failed", err?.message || err);
    res.json([]);
  }
});

app.post("/api/score-markets", async (req, res) => {
  try {
    const description =
      typeof req.body?.businessDescription === "string"
        ? req.body.businessDescription.trim()
        : typeof req.body?.description === "string"
          ? req.body.description.trim()
          : "";

    if (!description) {
      res.status(400).json({ error: "missing_business_description" });
      return;
    }

    if (!GEMINI_API_KEY) {
      res.status(500).json({ error: "missing_api_key" });
      return;
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const dictionaryTerms = getKeywordDictionaryList();
    const keywordPrompt = buildKeywordPrompt(description, dictionaryTerms);
    logGeminiPrompt("keyword_prompt", keywordPrompt);

    const keywordResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: keywordPrompt,
    });

    const keywordText =
      typeof keywordResponse?.text === "string" ? keywordResponse.text.trim() : "";
    if (!keywordText) {
      res.status(502).json({ error: "empty_keyword_response" });
      return;
    }

    const keywordParsed = parseGeminiJson(keywordText);
    const geminiKeywords = sanitizeStringArray(
      keywordParsed?.keywords ? keywordParsed.keywords : keywordParsed,
    );
    const keywords = normalizeGeminiKeywords(geminiKeywords);
    const inputs = parseInputsFromDescription(description);

    if (!keywords.length) {
      console.warn("Gemini keyword output invalid, falling back to dictionary match.");
    }

    const fallbackKeywords = extractKeywordsFromDescription(description, 15);
    const combinedKeywords = Array.from(new Set([...keywords, ...fallbackKeywords]));
    const finalKeywords = combinedKeywords.slice(0, 10);

    console.log(`Matched keywords: ${finalKeywords.join(", ")}`);
    if (inputs) {
      console.log("Parsed inputs:", inputs);
    }

    if (!finalKeywords.length) {
      res.json({ keywords: [], markets: [], scored_markets: [], inputs });
      return;
    }

    const markets = searchMarketsByKeywords(finalKeywords, 10);
    console.log(
      `DB matches (top ${markets.length}): ${markets.map((market) => market.ticker).join(", ")}`,
    );
    if (!markets.length) {
      res.json({ keywords: finalKeywords, markets: [], scored_markets: [], inputs });
      return;
    }

    const scoringPrompt = buildScoringPrompt(description, markets);
    logGeminiPrompt("scoring_prompt", scoringPrompt);

    const scoreResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: scoringPrompt,
    });

    const scoreText = typeof scoreResponse?.text === "string" ? scoreResponse.text.trim() : "";
    if (!scoreText) {
      res.status(502).json({ error: "empty_score_response" });
      return;
    }

    const scoreParsed = parseGeminiJson(scoreText);
    const scored = sanitizeScores(
      scoreParsed,
      markets.map((market) => market.ticker),
      markets.map((market) => market.market_ticker).filter(Boolean),
    );

    res.json({
      keywords: finalKeywords,
      markets,
      scored_markets: scored,
      inputs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error: scoring failed", message);
    res.status(500).json({ error: "scoring_failed", details: message });
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (SYNC_ON_START) {
    await runSync();
    setInterval(runSync, SYNC_INTERVAL_MS);
  } else {
    console.log("Auto-sync on startup disabled.");
  }
});
