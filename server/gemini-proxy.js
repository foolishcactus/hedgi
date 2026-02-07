import "dotenv/config";
import http from "node:http";
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const PORT = Number(process.env.GEMINI_PROXY_PORT || process.env.PORT || 3001);
const getApiKey = () => process.env.GEMINI_API_KEY;

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key",
  });
  res.end(JSON.stringify(payload));
};

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

const buildProfilePrompt = (input) =>
  [
    "Extract a BusinessProfile from the text.",
    "Return ONLY JSON with these fields:",
    "industry (string|null), location (string|null), seasonality (string|null),",
    "revenueDrivers (string[]), keyCosts (string[]),",
    "assumptions (array of {field, value, confidence 0-1, basis}).",
    "No extra commentary and no code fences.",
    "Text:",
    input,
  ].join(" ");

const buildRankPrompt = (profileSummary, markets) =>
  [
    "You are ranking market relevance for the business profile.",
    "Return ONLY a JSON array of objects:",
    "{id, relevanceScore 0-100, proxyStrength strong|partial|weak, mappedRisk, rationale <= 140 chars}.",
    "Use the market id provided.",
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

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" }, origin);
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      sendJson(res, 500, { error: "missing_api_key" }, origin);
      return;
    }
    const ai = new GoogleGenAI({ apiKey });

    const body = await readJsonBody(req);

    if (req.url === "/api/profile") {
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
