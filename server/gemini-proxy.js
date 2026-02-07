import "dotenv/config";
import http from "node:http";
import { GoogleGenAI } from "@google/genai";
import {
  fetchKalshiSeriesList,
  getKalshiMarketsCacheSnapshot,
  getKalshiSeriesCacheSnapshot,
  fetchKalshiSeriesPing,
  fetchKalshiSeriesByTags,
  getKalshiSeriesByTagsCacheSnapshot,
  fetchKalshiOpenMarketExists,
} from "./lib/kalshiClient.js";
import {
  fetchMarketsForSeriesTickers,
  selectSeriesForHedgiCategories,
  getTagsForCategories,
  selectSeriesByTags,
} from "./lib/kalshiService.js";
import { KALSHI_CATEGORY_PLANS } from "./lib/kalshiMapping.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const PORT = Number(process.env.GEMINI_PROXY_PORT || process.env.PORT || 3001);
const getApiKey = () => process.env.GEMINI_API_KEY;
const SERIES_DELAY_MS = Number(process.env.KALSHI_SERIES_DELAY_MS || 200);
const DEBUG_MODE = process.env.GEMINI_DEBUG === "true";

let lastGeminiProfileRaw = null;
let lastGeminiRankRaw = null;
let lastGeminiUpdatedAt = null;
let lastKalshiByTagsDebug = null;

const normalizeTag = (value) => value.toLowerCase().trim();

const inferCategoryFromTags = (tags) => {
  const normalized = Array.isArray(tags) ? tags.map(normalizeTag).filter(Boolean) : [];
  let bestCategory = null;
  let bestScore = 0;

  for (const [category, plan] of Object.entries(KALSHI_CATEGORY_PLANS)) {
    const planTags = Array.isArray(plan?.tags) ? plan.tags : [];
    if (!planTags.length) continue;
    const score = planTags.reduce((count, tag) => {
      return normalized.includes(normalizeTag(tag)) ? count + 1 : count;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory || "weather";
};

const parseMaxSeries = (value, fallback) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
};

const allowOrigin = (origin) => {
  if (!origin) return "*";
  if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
    return origin;
  }
  return "*";
};

const sendJson = (res, status, payload, origin) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key",
  });
  res.end(JSON.stringify(payload));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJsonBody = async (req) => {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 150_000) {
      throw new Error("payload_too_large");
    }
  }
  if (!raw) return {};
  return JSON.parse(raw);
};

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

const sanitizeProfile = (raw) => {
  if (!raw || typeof raw !== "object") return null;

  const assumptions = Array.isArray(raw.assumptions)
    ? raw.assumptions
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          field: typeof item.field === "string" ? item.field : "",
          value: typeof item.value === "string" ? item.value : "",
          confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
          basis: typeof item.basis === "string" ? item.basis : "",
        }))
        .filter((item) => item.field || item.value || item.basis)
    : [];

  return {
    industry: typeof raw.industry === "string" ? raw.industry : null,
    location: typeof raw.location === "string" ? raw.location : null,
    seasonality: typeof raw.seasonality === "string" ? raw.seasonality : null,
    revenueDrivers: sanitizeStringArray(raw.revenueDrivers),
    keyCosts: sanitizeStringArray(raw.keyCosts),
    exposures: sanitizeStringArray(raw.exposures),
    keywords: sanitizeStringArray(raw.keywords),
    assumptions,
  };
};

const sanitizeRankings = (raw, allowedIds) => {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(allowedIds);
  const results = [];

  for (const item of raw) {
    const id = typeof item.id === "string" ? item.id : typeof item.marketId === "string" ? item.marketId : "";
    if (!id || !allowed.has(id)) continue;

    const relevance = typeof item.relevanceScore === "number" ? item.relevanceScore : 0;
    const proxyStrength = ["strong", "partial", "weak"].includes(item.proxyStrength)
      ? item.proxyStrength
      : "weak";

    const mappedRisk = typeof item.mappedRisk === "string" ? item.mappedRisk : "market risk";
    const rationale = typeof item.rationale === "string" ? item.rationale.slice(0, 140) : "";

    results.push({
      marketId: id,
      relevanceScore: Math.max(0, Math.min(100, relevance)),
      proxyStrength,
      mappedRisk,
      rationale,
    });
  }

  return results;
};

const buildProfilePrompt = (input) => `
You are a business risk analyst helping small businesses identify prediction markets they can use for hedging.

Your task: Extract search keywords from a business description that will match relevant prediction markets on Kalshi and Polymarket.

INPUT: A business description including their industry, location, concerns, or risks.

OUTPUT: A JSON object with an array of 5-15 specific search keywords that would appear in prediction market titles.

GUIDELINES:
1. Focus on EXTERNAL risks the business cannot control (weather, economics, regulations, commodity prices)
2. Include geographic terms if location-dependent risks are mentioned
3. Include time-related terms if seasonal/cyclical risks are mentioned
4. Use terms that would appear in market TITLES, not abstract concepts
5. Prioritize concrete, measurable events over vague concerns
6. Think about what Kalshi/Polymarket would actually create markets about

RISK CATEGORIES TO CONSIDER:
- Weather events: hurricanes, tornadoes, floods, droughts, heat waves, snow, wildfires
- Economic indicators: GDP, unemployment, recession, inflation, interest rates, consumer spending
- Commodity prices: oil, gas, wheat, corn, coffee, lumber, steel
- Real estate: housing prices, mortgage rates, construction starts
- Regulatory/Policy: minimum wage, tariffs, tax rates, Fed decisions
- Industry-specific: retail sales, manufacturing output, energy demand

KEYWORD SELECTION STRATEGY:
- Use the EXACT terms that appear in market titles (e.g., "hurricane" not "tropical storm damage")
- Include location names (states, cities, regions)
- Include timeframes if relevant (Q2, spring, summer, 2025)
- Include measurement terms (unemployment rate, GDP growth, oil price)
- Avoid: company names, internal operations, controllable risks, vague terms

OUTPUT FORMAT:
Return ONLY valid JSON, no markdown formatting, no explanation:
{
  "keywords": ["keyword1", "keyword2", "keyword3", ...]
}

EXAMPLES:

Input: "I run a coffee shop in Miami and I'm worried about hurricane season affecting my business."
Output:
{
  "keywords": ["hurricane", "Florida", "Miami", "tropical storm", "natural disaster", "storm", "Atlantic hurricane"]
}

Input: "I'm a wheat farmer in Kansas concerned about drought conditions this summer."
Output:
{
  "keywords": ["drought", "Kansas", "precipitation", "rainfall", "wheat", "agriculture", "Great Plains", "summer", "climate"]
}

Input: "I operate a construction company and rising lumber prices are killing my margins."
Output:
{
  "keywords": ["lumber", "construction", "housing", "building materials", "commodity prices", "wood"]
}

Input: "I own a small retail store and worried about a recession hurting consumer spending."
Output:
{
  "keywords": ["recession", "GDP", "consumer spending", "retail sales", "economic growth", "unemployment", "economy"]
}

Input: "I'm a restaurant owner in New York worried about minimum wage increases."
Output:
{
  "keywords": ["minimum wage", "New York", "labor costs", "wages", "employment"]
}

Input: "I run a trucking company and fuel costs are unpredictable."
Output:
{
  "keywords": ["oil price", "gas price", "fuel", "oil", "energy prices", "gasoline", "diesel"]
}

Now process this business description:

"${input}"

Remember: Return ONLY the JSON object with keywords array, nothing else.
`.trim();

const buildRankPrompt = (profileSummary, markets) =>
  [
    "You are ranking market relevance for the business profile.",
    "Return ONLY a JSON array of objects:",
    "{id, relevanceScore 0-100, proxyStrength strong|partial|weak, mappedRisk, rationale <= 140 chars}.",
    "Use the market id provided.",
    "Base relevance only on the provided profile text and market title/description.",
    "If a market is not relevant, give it a low relevanceScore and say why.",
    "No extra commentary and no code fences.",
    `Profile: ${JSON.stringify(profileSummary)}`,
    `Markets: ${JSON.stringify(markets)}`,
  ].join(" ");

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;

  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {}, origin);
      return;
    }

    if (req.method === "GET") {
      if (req.url?.startsWith("/api/debug/kalshi-selected-series")) {
        const url = new URL(req.url, "http://localhost");
        const raw = url.searchParams.get("categories") || "";
        const categories = raw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

        const { tags, tagsByCategory } = getTagsForCategories(categories);
        const seriesResult = tags.length
          ? await fetchKalshiSeriesByTags(tags)
          : await fetchKalshiSeriesList();
        const selection = selectSeriesForHedgiCategories(categories, seriesResult.series, tagsByCategory);
        sendJson(
          res,
          200,
          {
            categories,
            selected: selection.selected,
            capped: selection.capped,
            tagsUsed: tags,
          },
          origin,
        );
        return;
      }

      if (req.url?.startsWith("/api/debug/kalshi-series-by-tags")) {
        const url = new URL(req.url, "http://localhost");
        const raw = url.searchParams.get("tags") || "";
        const tags = raw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const { series, cacheHit } = await fetchKalshiSeriesByTags(tags);
        const sample = series.slice(0, 10).map((item) => ({
          ticker: item?.ticker || item?.series_ticker || item?.id || "",
          title: item?.title || item?.name || "",
          tags: Array.isArray(item?.tags) ? item.tags : [],
        }));
        sendJson(res, 200, { tags, count: series.length, sample, cacheHit }, origin);
        return;
      }

      if (req.url?.startsWith("/api/debug/kalshi-open-check")) {
        const url = new URL(req.url, "http://localhost");
        const raw = url.searchParams.get("tags") || "";
        const tags = raw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const maxSeries = parseMaxSeries(
          url.searchParams.get("maxSeries"),
          Number(process.env.KALSHI_MAX_SERIES || 10),
        );

        const seriesResult = await fetchKalshiSeriesByTags(tags);
        const selection = selectSeriesByTags(seriesResult.series, tags, maxSeries);

        const results = [];
        let rateLimited = false;
        let retryAfterSec = null;

        for (const series of selection.selected) {
          const result = await fetchKalshiOpenMarketExists(series.ticker);
          if (result.rateLimited) {
            rateLimited = true;
            retryAfterSec = result.retryAfterSec;
            break;
          }

          results.push({
            ticker: series.ticker,
            title: series.title,
            hasOpen: result.hasOpen,
          });

          if (!result.cacheHit && SERIES_DELAY_MS > 0) {
            await sleep(SERIES_DELAY_MS);
          }
        }

        sendJson(
          res,
          200,
          {
            tags,
            seriesSelected: selection.selected.length,
            results,
            rateLimited,
            retryAfterSec,
          },
          origin,
        );
        return;
      }

      if (req.url?.startsWith("/api/debug/kalshi-series")) {
        const { series, cacheHit } = await fetchKalshiSeriesList();
        const sample = series.slice(0, 5).map((item) => ({
          ticker: item?.ticker || item?.series_ticker || item?.id || "",
          title: item?.title || item?.name || "",
          category: item?.category || item?.category_name || "",
        }));
        sendJson(res, 200, { cacheHit, count: series.length, sample }, origin);
        return;
      }

      if (req.url?.startsWith("/api/debug/kalshi-cache")) {
        if (process.env.NODE_ENV === "production") {
          sendJson(res, 404, { error: "not_found" }, origin);
          return;
        }
        const seriesCache = getKalshiSeriesCacheSnapshot();
        const marketsCache = getKalshiMarketsCacheSnapshot();
        const seriesByTagsCache = getKalshiSeriesByTagsCacheSnapshot();
        sendJson(
          res,
          200,
          {
            seriesCache,
            seriesByTagsCache,
            marketsCacheKeys: marketsCache,
          },
          origin,
        );
        return;
      }

      if (req.url?.startsWith("/api/debug/kalshi-last")) {
        if (!DEBUG_MODE || process.env.NODE_ENV === "production") {
          sendJson(res, 404, { error: "not_found" }, origin);
          return;
        }
        sendJson(res, 200, { last: lastKalshiByTagsDebug }, origin);
        return;
      }

      if (req.url?.startsWith("/api/debug/gemini")) {
        if (!DEBUG_MODE || process.env.NODE_ENV === "production") {
          sendJson(res, 404, { error: "not_found" }, origin);
          return;
        }
        sendJson(
          res,
          200,
          {
            profileRaw: lastGeminiProfileRaw,
            rankRaw: lastGeminiRankRaw,
            updatedAt: lastGeminiUpdatedAt,
          },
          origin,
        );
        return;
      }

      if (req.url?.startsWith("/api/debug/kalshi-ping")) {
        try {
          const result = await fetchKalshiSeriesPing();
          sendJson(res, 200, result, origin);
        } catch (err) {
          const message = err instanceof Error ? err.message : "kalshi_ping_failed";
          sendJson(res, 502, { ok: false, error: message }, origin);
        }
        return;
      }
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" }, origin);
      return;
    }

    const body = await readJsonBody(req);

    if (req.url === "/api/markets/kalshi") {
      const categories = Array.isArray(body.categories)
        ? body.categories.filter((item) => typeof item === "string")
        : [];

      try {
        const { tags, tagsByCategory } = getTagsForCategories(categories);
        const seriesResult = tags.length
          ? await fetchKalshiSeriesByTags(tags)
          : await fetchKalshiSeriesList();
        const selection = selectSeriesForHedgiCategories(categories, seriesResult.series, tagsByCategory);
        const result = await fetchMarketsForSeriesTickers(selection.tickers, selection.categoryMap);

        sendJson(
          res,
          200,
          {
            markets: result.markets,
            meta: {
              provider: "kalshi",
              seriesSelected: selection.tickers.length,
              seriesFetched: result.meta.seriesFetched,
              marketsTotal: result.markets.length,
              cacheHit: seriesResult.cacheHit,
              capped: selection.capped,
              cacheHits: result.meta.cacheHits,
              cacheMisses: result.meta.cacheMisses,
              rateLimited: result.meta.rateLimited,
              partial: result.meta.partial,
              retryAfterSec: result.meta.retryAfterSec,
              tagsUsed: tags,
            },
          },
          origin,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "kalshi_error";
        sendJson(
          res,
          200,
          {
            markets: [],
            meta: {
              provider: "kalshi",
              seriesSelected: 0,
              seriesFetched: 0,
              marketsTotal: 0,
              cacheHit: false,
              error: message,
              cacheHits: 0,
              cacheMisses: 0,
              rateLimited: false,
              partial: false,
            },
          },
          origin,
        );
      }
      return;
    }

    if (req.url === "/api/markets/kalshi/by-tags") {
      const tags = Array.isArray(body.tags)
        ? body.tags.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
        : [];

      if (!tags.length) {
        sendJson(res, 400, { error: "missing_tags" }, origin);
        return;
      }

      const maxSeries = parseMaxSeries(body.maxSeries, Number(process.env.KALSHI_MAX_SERIES || 10));

      try {
        const seriesResult = await fetchKalshiSeriesByTags(tags);
        const selection = selectSeriesByTags(seriesResult.series, tags, maxSeries);

        const openSeries = [];
        let openCheckCacheHits = 0;
        let openCheckCacheMisses = 0;
        let rateLimited = false;
        let retryAfterSec = null;

        for (const series of selection.selected) {
          const result = await fetchKalshiOpenMarketExists(series.ticker);
          if (result.rateLimited) {
            rateLimited = true;
            retryAfterSec = result.retryAfterSec;
            break;
          }

          if (result.cacheHit) {
            openCheckCacheHits += 1;
          } else {
            openCheckCacheMisses += 1;
          }

          if (result.hasOpen) {
            openSeries.push(series.ticker);
          }

          if (!result.cacheHit && SERIES_DELAY_MS > 0) {
            await sleep(SERIES_DELAY_MS);
          }
        }

        let markets = [];
        let marketsMeta = {
          cacheHits: 0,
          cacheMisses: 0,
          seriesFetched: 0,
          rateLimited: false,
          partial: false,
          retryAfterSec: null,
          marketsTotal: 0,
        };

        if (!rateLimited && openSeries.length) {
          const inferredCategory = inferCategoryFromTags(tags);
          const categoryMap = Object.fromEntries(openSeries.map((ticker) => [ticker, inferredCategory]));
          const result = await fetchMarketsForSeriesTickers(openSeries, categoryMap);
          markets = result.markets;
          marketsMeta = result.meta;
        }

        const deduped = new Map();
        for (const market of markets) {
          if (!deduped.has(market.id)) {
            deduped.set(market.id, market);
          }
        }

        const finalMarkets = Array.from(deduped.values());
        const finalRateLimited = rateLimited || marketsMeta.rateLimited;
        const finalPartial = finalRateLimited || marketsMeta.partial;

        if (DEBUG_MODE) {
          lastKalshiByTagsDebug = {
            tags,
            seriesReturned: seriesResult.series.length,
            seriesSelected: selection.selected.length,
            seriesWithOpen: openSeries.length,
            marketsTotal: finalMarkets.length,
            sampleMarkets: finalMarkets.slice(0, 5).map((market) => ({
              id: market.id,
              title: market.title,
              closeTime: market.closeTime,
            })),
            updatedAt: new Date().toISOString(),
          };
        }

        sendJson(
          res,
          200,
          {
            markets: finalMarkets,
            meta: {
              tags,
              inferredCategory: inferCategoryFromTags(tags),
              seriesReturned: seriesResult.series.length,
              seriesSelected: selection.selected.length,
              seriesWithOpen: openSeries.length,
              marketsTotal: finalMarkets.length,
              cacheHits: {
                seriesByTags: seriesResult.cacheHit,
                marketsSeries: marketsMeta.cacheHits,
                openChecks: openCheckCacheHits,
              },
              rateLimited: finalRateLimited,
              partial: finalPartial,
              retryAfterSec: retryAfterSec || marketsMeta.retryAfterSec || null,
            },
          },
          origin,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "kalshi_error";
        sendJson(
          res,
          200,
          {
            markets: [],
            meta: {
              tags,
              seriesReturned: 0,
              seriesSelected: 0,
              seriesWithOpen: 0,
              marketsTotal: 0,
              cacheHits: {
                seriesByTags: false,
                marketsSeries: 0,
                openChecks: 0,
              },
              rateLimited: false,
              partial: false,
              error: message,
            },
          },
          origin,
        );
      }
      return;
    }

    if (req.url === "/api/profile") {
      const apiKey = getApiKey();
      if (!apiKey) {
        sendJson(res, 500, { error: "missing_api_key" }, origin);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });

      const input = typeof body.input === "string" ? body.input.trim() : "";
      if (!input) {
        sendJson(res, 400, { error: "missing_input" }, origin);
        return;
      }

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: buildProfilePrompt(input),
      });

      const text = typeof response?.text === "string" ? response.text.trim() : "";
      if (!text) {
        sendJson(res, 502, { error: "empty_response" }, origin);
        return;
      }

      if (DEBUG_MODE) {
        lastGeminiProfileRaw = text;
        lastGeminiUpdatedAt = new Date().toISOString();
      }

      const parsed = parseGeminiJson(text);
      const profile = sanitizeProfile(parsed);
      if (!profile) {
        console.error("Invalid profile JSON:", JSON.stringify(text));
        sendJson(res, 502, { error: "invalid_json" }, origin);
        return;
      }

      sendJson(res, 200, profile, origin);
      return;
    }

    if (req.url === "/api/rank-markets") {
      const apiKey = getApiKey();
      if (!apiKey) {
        sendJson(res, 500, { error: "missing_api_key" }, origin);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });

      const profile = body.profile ?? null;
      const markets = Array.isArray(body.markets) ? body.markets : [];

      if (!profile || markets.length === 0) {
        sendJson(res, 400, { error: "missing_payload" }, origin);
        return;
      }

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: buildRankPrompt(profile, markets),
      });

      const text = typeof response?.text === "string" ? response.text.trim() : "";
      if (!text) {
        sendJson(res, 502, { error: "empty_response" }, origin);
        return;
      }

      if (DEBUG_MODE) {
        lastGeminiRankRaw = text;
        lastGeminiUpdatedAt = new Date().toISOString();
      }

      const parsed = parseGeminiJson(text);
      const ranked = sanitizeRankings(parsed, markets.map((market) => market.id));

      if (!ranked.length) {
        console.error("Invalid rank JSON:", JSON.stringify(text));
        sendJson(res, 502, { error: "invalid_json" }, origin);
        return;
      }

      sendJson(res, 200, ranked, origin);
      return;
    }

    sendJson(res, 404, { error: "not_found" }, origin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "server_error";
    console.error("Server error:", message);
    sendJson(res, 500, { error: "server_error", details: message }, origin);
  }
});

server.listen(PORT, () => {
  console.log(`Gemini proxy running on http://localhost:${PORT}`);
});
