export type KeywordMatchMarket = {
  platform: string;
  ticker: string;
  title: string;
  market_ticker?: string | null;
  price_yes?: number | null;
};

export type HedgeInputs = {
  expected_profit: number | null;
  loss_if_event: number | null;
  loss_if_event_percent: number | null;
  hedge_coverage: number | null;
  max_hedge_cost: number | null;
};

export type ScoredMarket = {
  platform: string;
  ticker: string;
  title: string;
  relevance_score: number;
  hedging_utility_score: number;
  timing_score: number;
  overall_score: number;
  reasoning: string;
  market_ticker?: string | null;
  price_yes?: number | null;
};

export type SnapshotResult = {
  businessDescription: string;
  keywords: string[];
  matches: KeywordMatchMarket[];
  scoredMarkets: ScoredMarket[];
  inputs: HedgeInputs | null;
};

type ScoreMarketsResponse = {
  keywords?: string[];
  markets?: KeywordMatchMarket[];
  scored_markets?: ScoredMarket[];
  inputs?: HedgeInputs | null;
};

const DEBUG_MODE = import.meta.env.VITE_DEBUG === "true";

const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // ignore JSON parse errors for error responses
  }

  if (!response.ok) {
    const errorCode =
      typeof payload === "object" && payload && "error" in payload ? String(payload.error) : "request_failed";
    const details =
      typeof payload === "object" && payload && "details" in payload ? String(payload.details) : "";
    const message = details ? `${errorCode}: ${details}` : errorCode;
    throw new Error(message);
  }

  return payload as T;
};

const logDebug = (label: string, value: unknown) => {
  if (!DEBUG_MODE) return;
  if (typeof console !== "undefined") {
    console.log(label, value);
  }
};

const logGroup = (label: string, callback: () => void) => {
  if (!DEBUG_MODE || typeof console === "undefined") return;
  console.groupCollapsed(label);
  try {
    callback();
  } finally {
    console.groupEnd();
  }
};

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];

const normalizeInputs = (value: unknown): HedgeInputs | null => {
  if (!value || typeof value !== "object") return null;
  const toNumber = (input: unknown): number | null => {
    const num = typeof input === "number" ? input : Number(input);
    return Number.isFinite(num) ? num : null;
  };

  const inputs = {
    expected_profit: toNumber((value as Record<string, unknown>).expected_profit),
    loss_if_event: toNumber((value as Record<string, unknown>).loss_if_event),
    loss_if_event_percent: toNumber(
      (value as Record<string, unknown>).loss_if_event_percent,
    ),
    hedge_coverage: toNumber((value as Record<string, unknown>).hedge_coverage),
    max_hedge_cost: toNumber((value as Record<string, unknown>).max_hedge_cost),
  };

  const hasAny = Object.values(inputs).some((item) => typeof item === "number");
  return hasAny ? inputs : null;
};

const normalizeMarkets = (value: unknown): KeywordMatchMarket[] =>
  Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          platform: typeof item.platform === "string" ? item.platform : "kalshi",
          ticker: typeof item.ticker === "string" ? item.ticker : "",
          title: typeof item.title === "string" ? item.title : "",
          market_ticker:
            typeof item.market_ticker === "string" ? item.market_ticker : null,
          price_yes:
            typeof item.price_yes === "number" ? item.price_yes : null,
        }))
        .filter((item) => item.ticker && item.title)
    : [];

const clampScore = (value: unknown): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(10, num));
};

const normalizeScoredMarkets = (value: unknown): ScoredMarket[] =>
  Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const relevance = clampScore(item.relevance_score);
          const hedging = clampScore(item.hedging_utility_score);
          const timing = clampScore(item.timing_score);
          const overall =
            typeof item.overall_score === "number"
              ? clampScore(item.overall_score)
              : clampScore((relevance + hedging + timing) / 3);

          return {
            platform: typeof item.platform === "string" ? item.platform : "kalshi",
            ticker: typeof item.ticker === "string" ? item.ticker : "",
            title: typeof item.title === "string" ? item.title : "",
            relevance_score: relevance,
            hedging_utility_score: hedging,
            timing_score: timing,
            overall_score: overall,
            reasoning: typeof item.reasoning === "string" ? item.reasoning : "",
            market_ticker:
              typeof item.market_ticker === "string" ? item.market_ticker : null,
            price_yes:
              typeof item.price_yes === "number" ? item.price_yes : null,
          };
        })
        .filter((item) => item.ticker && item.title)
    : [];

export const runHedgiSnapshot = async (rawInput: string): Promise<SnapshotResult> => {
  const trimmedInput = rawInput.trim();
  if (!trimmedInput) {
    throw new Error("missing_business");
  }

  const response = await postJson<ScoreMarketsResponse>("/api/score-markets", {
    businessDescription: trimmedInput,
  });

  const keywords = normalizeStringArray(response.keywords);
  const matches = normalizeMarkets(response.markets);
  const inputs = normalizeInputs(response.inputs);
  const scoredMarkets = normalizeScoredMarkets(response.scored_markets)
    .slice()
    .sort((a, b) => b.overall_score - a.overall_score || a.ticker.localeCompare(b.ticker))
    .map((market) => {
      const match = matches.find((item) => item.ticker === market.ticker);
      if (!match) return market;
      return {
        ...market,
        market_ticker: match.market_ticker ?? market.market_ticker ?? null,
        price_yes:
          typeof match.price_yes === "number"
            ? match.price_yes
            : market.price_yes ?? null,
      };
    });

  const snapshot: SnapshotResult = {
    businessDescription: trimmedInput,
    keywords,
    matches,
    scoredMarkets,
    inputs,
  };

  logGroup("Keyword search", () => {
    logDebug("keywords", keywords);
    logDebug("inputs", inputs);
    logDebug("matches", matches.length);
  });

  logGroup("Scored markets", () => {
    logDebug("count", scoredMarkets.length);
    logDebug("top", scoredMarkets.slice(0, 5));
  });

  if (DEBUG_MODE && typeof window !== "undefined") {
    const anyWindow = window as typeof window & { __hedgiLastSnapshot?: SnapshotResult };
    anyWindow.__hedgiLastSnapshot = snapshot;
  }

  return snapshot;
};
