import type {
  BusinessProfile,
  CategoryId,
  CategoryMatch,
  Market,
  RankedSignal,
  RankedSignalPartial,
} from "@/types/hedgi";
import { CATEGORY_DEFINITIONS, inferCategoriesFromProfile } from "@/lib/categories";
import { fetchActiveMarketsByCategories as fetchKalshiMarkets } from "@/lib/providers/kalshi.mock";
import { fetchKalshiMarketsReal } from "@/lib/providers/kalshi.real";
import { fetchActiveMarketsByCategories as fetchPolymarketMarkets } from "@/lib/providers/polymarket.mock";
import { daysUntil } from "@/lib/format";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "into", "over", "under", "above",
  "below", "about", "have", "has", "had", "our", "are", "was", "were", "will", "can", "could",
  "should", "would", "a", "an", "of", "to", "in", "on", "by", "as", "is", "it",
]);

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const STATE_REGION_MAP: Record<string, string> = {
  florida: "US-SE",
  texas: "US-South",
  california: "US-West",
  colorado: "US-Mountain",
  iowa: "US-Midwest",
  kansas: "US-Midwest",
  "new york": "US-Northeast",
  georgia: "US-SE",
  louisiana: "US-Gulf",
  massachusetts: "US-Northeast",
};

const INDUSTRY_HINTS: Array<{ keyword: string; industry: string }> = [
  { keyword: "farm", industry: "agriculture" },
  { keyword: "crop", industry: "agriculture" },
  { keyword: "orchard", industry: "agriculture" },
  { keyword: "resort", industry: "tourism" },
  { keyword: "hotel", industry: "tourism" },
  { keyword: "rental", industry: "tourism" },
  { keyword: "logistics", industry: "logistics" },
  { keyword: "warehouse", industry: "logistics" },
  { keyword: "construction", industry: "real estate" },
  { keyword: "software", industry: "technology" },
];

const tokenize = (input: string): string[] => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
};

const detectRevenueSeason = (input: string) => {
  const lower = input.toLowerCase();
  const rangeMatch = lower.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(?:-|to|through)\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*/,
  );
  if (rangeMatch) {
    const start = MONTH_MAP[rangeMatch[1]];
    const end = MONTH_MAP[rangeMatch[2]];
    return { startMonth: start ?? null, endMonth: end ?? null, notes: rangeMatch[0] };
  }

  const months = Array.from(
    new Set(
      Object.keys(MONTH_MAP).filter((month) => lower.includes(month)),
    ),
  );
  if (months.length >= 2) {
    const start = MONTH_MAP[months[0]];
    const end = MONTH_MAP[months[months.length - 1]];
    return { startMonth: start ?? null, endMonth: end ?? null, notes: months.join(", ") };
  }

  return null;
};

const detectLocation = (input: string): { location: string | null; region: string | null } => {
  const lower = input.toLowerCase();
  for (const [state, region] of Object.entries(STATE_REGION_MAP)) {
    if (lower.includes(state)) {
      return { location: state, region };
    }
  }
  return { location: null, region: null };
};

const detectExposures = (input: string): string[] => {
  const lower = input.toLowerCase();
  const exposureKeywords = [
    "hurricane",
    "drought",
    "flood",
    "rain",
    "storm",
    "heat",
    "snow",
    "interest rate",
    "inflation",
    "supply chain",
    "fuel",
    "energy",
    "pest",
    "disease",
  ];

  return exposureKeywords.filter((keyword) => lower.includes(keyword));
};

const detectIndustry = (input: string): string | null => {
  const lower = input.toLowerCase();
  for (const hint of INDUSTRY_HINTS) {
    if (lower.includes(hint.keyword)) {
      return hint.industry;
    }
  }
  return null;
};

const mockExtractBusinessProfile = (input: string): BusinessProfile => {
  const tokens = tokenize(input);
  const keywords = Array.from(new Set(tokens)).slice(0, 20);
  const exposures = detectExposures(input);
  const industry = detectIndustry(input);
  const { location, region } = detectLocation(input);
  const revenueSeason = detectRevenueSeason(input);

  return {
    rawInput: input,
    industry,
    location,
    region,
    seasonality: revenueSeason?.notes ?? null,
    revenueDrivers: [],
    keyCosts: [],
    assumptions: [],
    revenueSeason,
    exposures,
    keywords,
  };
};

const postJson = async <T>(path: string, payload: unknown): Promise<T> => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`api_error_${response.status}`);
  }

  return (await response.json()) as T;
};

type GeminiProfilePayload = {
  industry: string | null;
  location: string | null;
  seasonality: string | null;
  revenueDrivers: string[];
  keyCosts: string[];
  assumptions: Array<{
    field: string;
    value: string;
    confidence: number;
    basis: string;
  }>;
};

const sanitizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const extractBusinessProfileWithGemini = async (input: string): Promise<BusinessProfile> => {
  const payload = await postJson<GeminiProfilePayload>("/api/profile", { input });
  const base = mockExtractBusinessProfile(input);

  return {
    ...base,
    industry: payload.industry ?? base.industry,
    location: payload.location ?? base.location,
    seasonality: payload.seasonality ?? base.seasonality,
    revenueDrivers: sanitizeStringArray(payload.revenueDrivers),
    keyCosts: sanitizeStringArray(payload.keyCosts),
    assumptions: Array.isArray(payload.assumptions)
      ? payload.assumptions
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            field: typeof item.field === "string" ? item.field : "",
            value: typeof item.value === "string" ? item.value : "",
            confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
            basis: typeof item.basis === "string" ? item.basis : "",
          }))
          .filter((item) => item.field || item.value || item.basis)
      : [],
  };
};

type GeminiRankedResponse = Array<{
  marketId?: string;
  id?: string;
  relevanceScore?: number;
  proxyStrength?: "strong" | "partial" | "weak";
  mappedRisk?: string;
  rationale?: string;
}>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const rankMarketsWithGemini = async (
  profile: BusinessProfile,
  markets: Market[],
): Promise<RankedSignalPartial[]> => {
  const profilePayload = {
    industry: profile.industry,
    location: profile.location,
    seasonality: profile.seasonality,
    revenueDrivers: profile.revenueDrivers,
    keyCosts: profile.keyCosts,
    assumptions: profile.assumptions,
  };

  const marketsPayload = markets.map((market) => ({
    id: market.id,
    title: market.title,
    description: market.description ?? "",
    closeTime: market.closeTime,
    categoryTags: [market.categoryId],
    regionTags: profile.region ? [profile.region] : [],
  }));

  const payload = { profile: profilePayload, markets: marketsPayload };
  const response = await postJson<GeminiRankedResponse>("/api/rank-markets", payload);

  const byId = new Map<string, RankedSignalPartial>();
  for (const item of response) {
    const id = item.marketId ?? item.id ?? "";
    if (!id) continue;
    const relevanceScore = typeof item.relevanceScore === "number" ? item.relevanceScore : 0;
    const proxyStrength = item.proxyStrength ?? "weak";
    const mappedRisk = typeof item.mappedRisk === "string" ? item.mappedRisk : "market risk";
    const rationale = typeof item.rationale === "string" ? item.rationale : "";

    byId.set(id, {
      marketId: id,
      relevanceScore: clamp(relevanceScore, 0, 100),
      proxyStrength,
      mappedRisk,
      rationale: rationale.slice(0, 140),
    });
  }

  return Array.from(byId.values());
};

const normalizeTitle = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

const hygieneFilter = (markets: Market[]): Market[] => {
  const now = Date.now();
  const seen = new Set<string>();
  const liquidityThreshold = 20000;

  return markets.filter((market) => {
    const closeTime = Date.parse(market.closeTime);
    if (Number.isNaN(closeTime) || closeTime <= now) return false;
    if (typeof market.liquidity === "number" && market.liquidity < liquidityThreshold) return false;

    const normalized = normalizeTitle(market.title);
    if (seen.has(normalized)) return false;
    seen.add(normalized);

    return true;
  });
};

const relevanceScoreStub = (
  profile: BusinessProfile,
  market: Market,
  categories: CategoryMatch[],
): number => {
  const matchedCategoryIds = new Set(categories.map((match) => match.id));
  const matchedKeywords = new Set<string>();

  for (const category of CATEGORY_DEFINITIONS) {
    if (matchedCategoryIds.has(category.id)) {
      category.keywords.forEach((keyword) => matchedKeywords.add(keyword));
    }
  }

  profile.keywords.forEach((keyword) => matchedKeywords.add(keyword));
  profile.exposures.forEach((risk) => matchedKeywords.add(risk));

  const titleTokens = new Set(tokenize(market.title));
  let overlap = 0;
  titleTokens.forEach((token) => {
    if (matchedKeywords.has(token)) overlap += 1;
  });

  const base = overlap / Math.max(4, titleTokens.size);
  const topCategory = categories[0]?.id;
  const categoryBoost = topCategory && market.categoryId === topCategory ? 0.15 : 0;

  return Math.min(1, base + categoryBoost);
};

const liquidityScore = (market: Market): number => {
  if (typeof market.liquidity !== "number") return 0.5;
  const scaled = Math.log10(Math.max(1, market.liquidity)) / 6;
  return Math.min(1, Math.max(0, scaled));
};

const timeAlignmentScore = (market: Market): number => {
  const remainingDays = daysUntil(market.closeTime);
  if (remainingDays <= 0) return 0;
  if (remainingDays <= 30) return 1;
  if (remainingDays <= 90) return 0.7;
  if (remainingDays <= 180) return 0.5;
  return 0.3;
};

const proxyStrengthFromRelevance = (relevance: number): "strong" | "partial" | "weak" => {
  if (relevance >= 0.7) return "strong";
  if (relevance >= 0.45) return "partial";
  return "weak";
};

const mappedRiskFromProfile = (profile: BusinessProfile, categoryId: CategoryId): string => {
  if (profile.exposures.length) return profile.exposures[0];
  const category = CATEGORY_DEFINITIONS.find((item) => item.id === categoryId);
  return category ? category.label : "market risk";
};

export const buildRankedSignals = async (input: string): Promise<RankedSignal[]> => {
  const profile = await extractBusinessProfileWithGemini(input).catch(() =>
    mockExtractBusinessProfile(input),
  );
  const categoryMatches = inferCategoriesFromProfile(profile);
  const topCategories = categoryMatches.slice(0, 3).map((match) => match.id);

  const useRealKalshi = import.meta.env.VITE_USE_REAL_KALSHI === "true";
  const kalshiMarkets = useRealKalshi
    ? await fetchKalshiMarketsReal(topCategories).catch(() => [])
    : await fetchKalshiMarkets(topCategories);
  const polymarketMarkets = await fetchPolymarketMarkets(topCategories);

  const resolvedKalshiMarkets =
    useRealKalshi && kalshiMarkets.length === 0
      ? await fetchKalshiMarkets(topCategories)
      : kalshiMarkets;

  const filteredMarkets = hygieneFilter([...resolvedKalshiMarkets, ...polymarketMarkets]);

  const geminiRanked = await rankMarketsWithGemini(profile, filteredMarkets).catch(() => []);
  const geminiMap = new Map(geminiRanked.map((item) => [item.marketId, item]));

  const ranked = filteredMarkets.map((market) => {
    const geminiItem = geminiMap.get(market.id);
    const relevance = geminiItem
      ? clamp(geminiItem.relevanceScore / 100, 0, 1)
      : relevanceScoreStub(profile, market, categoryMatches);
    const liquidity = liquidityScore(market);
    const timeScore = timeAlignmentScore(market);
    const signalScore = relevance * 0.6 + liquidity * 0.25 + timeScore * 0.15;
    const proxyStrength = geminiItem
      ? geminiItem.proxyStrength
      : proxyStrengthFromRelevance(relevance);
    const mappedRisk = geminiItem
      ? geminiItem.mappedRisk
      : mappedRiskFromProfile(profile, market.categoryId);

    const rationale = geminiItem?.rationale?.length
      ? geminiItem.rationale
      : [
          `Relevance ${relevance.toFixed(2)}`,
          `Liquidity ${liquidity.toFixed(2)}`,
          `Time ${timeScore.toFixed(2)}`,
        ].join(" | ");

    return {
      market,
      relevanceScore: Number(relevance.toFixed(3)),
      proxyStrength,
      signalScore: Number(signalScore.toFixed(3)),
      mappedRisk,
      rationale,
    };
  });

  return ranked.sort((a, b) => b.signalScore - a.signalScore);
};

if (import.meta.env.DEV && typeof window !== "undefined") {
  const globalWindow = window as unknown as {
    hedgiPipelineTest?: () => Promise<void>;
  };

  if (!globalWindow.hedgiPipelineTest) {
    globalWindow.hedgiPipelineTest = async () => {
      const input =
        "I run a small orange farm in central Florida. Revenue Sep-Nov. Hurricanes and heavy rain can wipe out yields.";
      const profile = await extractBusinessProfileWithGemini(input).catch(() =>
        mockExtractBusinessProfile(input),
      );
      console.log("Gemini profile:", profile);
      const result = await buildRankedSignals(input);
      console.log("Top 10 signals:", result.slice(0, 10));
    };
  }
}
