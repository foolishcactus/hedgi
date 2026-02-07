export type BusinessProfile = {
  rawInput: string;
  industry: string | null;
  location: string | null;
  region: string | null;
  seasonality: string | null;
  revenueDrivers: string[];
  keyCosts: string[];
  assumptions: Array<{
    field: string;
    value: string;
    confidence: number;
    basis: string;
  }>;
  revenueSeason: {
    startMonth: number | null;
    endMonth: number | null;
    notes?: string;
  } | null;
  exposures: string[];
  keywords: string[];
};

export type CategoryId =
  | "agriculture"
  | "weather"
  | "energy"
  | "logistics"
  | "tourism"
  | "sports"
  | "finance"
  | "health"
  | "technology"
  | "real-estate";

export type CategoryMatch = {
  id: CategoryId;
  confidence: number;
  rationale: string;
};

export type MarketSource = "kalshi" | "polymarket";

export type MarketOutcome = {
  id: string;
  label: string;
  price?: number;
};

export type Market = {
  id: string;
  source: MarketSource;
  title: string;
  description?: string;
  categoryId: CategoryId;
  closeTime: string;
  outcomes: MarketOutcome[];
  liquidity?: number;
  volume?: number;
  url?: string;
};

export type RankedSignal = {
  market: Market;
  relevanceScore: number;
  proxyStrength: "strong" | "partial" | "weak";
  signalScore: number;
  mappedRisk: string;
  rationale: string;
};

export type RankedSignalPartial = {
  marketId: string;
  relevanceScore: number;
  proxyStrength: "strong" | "partial" | "weak";
  mappedRisk: string;
  rationale: string;
};
