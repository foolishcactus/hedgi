import "dotenv/config";
import http from "node:http";
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const PORT = Number(process.env.GEMINI_PROXY_PORT || process.env.PORT || 3001);
const getApiKey = () => process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: getApiKey() });

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key",
  });
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req) => {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) {
      throw new Error("payload_too_large");
    }
  }
  if (!raw) return {};
  return JSON.parse(raw);
};

const parseGeminiJson = (outputText) => {
  const cleaned = outputText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const escapeNewlinesInStrings = (text) => {
    let result = "";
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

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
          if (text[i + 1] === "\n") i += 1;
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

  const normalized = escapeNewlinesInStrings(cleaned);

  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const extractLastJsonObject = (text) => {
    let inString = false;
    let escaped = false;
    let depth = 0;
    let start = -1;
    let last = null;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }

      if (char === "}") {
        if (depth > 0) depth -= 1;
        if (depth === 0 && start !== -1) {
          last = text.slice(start, i + 1);
          start = -1;
        }
      }
    }

    return last;
  };

  let parsed = tryParse(normalized);
  if (!parsed) {
    const extracted = extractLastJsonObject(normalized);
    if (extracted) {
      parsed = tryParse(extracted);
    }
  }

  if (typeof parsed === "string") {
    parsed = tryParse(parsed) || parsed;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return parsed;
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.url !== "/api/analyze") {
      sendJson(res, 404, { error: "not_found" });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      sendJson(res, 500, { error: "missing_api_key" });
      return;
    }

    const body = await readJsonBody(req);
    const business = typeof body.business === "string" ? body.business.trim() : "";

    if (!business) {
      sendJson(res, 400, { error: "missing_business" });
      return;
    }

    const schemaHint =
      "Return a JSON object with keys: summary (string), " +
      "risks (array of 3-6 objects with name, severity: low|medium|high, impact), " +
      "lossScenario (object with revenueAtRisk, worstCase, likelihood, timeframe), " +
      "hedging (object with unprotected, protected, reduction), " +
      "signals (array of 2-5 objects with name, strength: weak|partial|strong, description).";

    const basePrompt =
      "You are a risk analyst. Summarize external risks and market signals for the business described. " +
      `${schemaHint} ` +
      "Return only JSON with no extra commentary and no code fences. " +
      "Do not include newline characters inside string values; keep all strings on a single line. " +
      "Use USD with $ and commas when describing money. Keep the summary concise (2-4 sentences).";

    const runModel = async (promptText) => {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `${promptText}\n\nBusiness description:\n${business}`,
      });
      return typeof response?.text === "string" ? response.text.trim() : "";
    };

    let outputText = await runModel(basePrompt);
    if (!outputText) {
      sendJson(res, 502, { error: "empty_response" });
      return;
    }

    let parsed = parseGeminiJson(outputText);
    if (!parsed) {
      const retryPrompt = `${basePrompt} Output MUST be a single-line JSON object under 1200 characters.`;
      outputText = await runModel(retryPrompt);
      parsed = outputText ? parseGeminiJson(outputText) : null;
    }

    if (!parsed) {
      console.error("Invalid JSON output from Gemini:", JSON.stringify(outputText));
      sendJson(res, 502, { error: "invalid_json" });
      return;
    }

    sendJson(res, 200, parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "server_error";
    console.error("Proxy error:", message);
    sendJson(res, 500, { error: "server_error", details: message });
  }
});

server.listen(PORT, () => {
  console.log(`Gemini proxy running on http://localhost:${PORT}`);
});
