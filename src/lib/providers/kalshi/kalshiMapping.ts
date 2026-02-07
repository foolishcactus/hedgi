import type { CategoryId } from "@/types/hedgi";

export type KalshiDiscoveryPlan = {
  // Must match Kalshi "category" strings exactly (from tags_by_categories keys or /series.category)
  seriesCategory?: string;

  // Preferred: Kalshi tag strings (from tags_by_categories)
  tags?: string[];

  // Fallback: title keyword matching only if tags are not available
  titleKeywords?: string[];
};

export const KALSHI_CATEGORY_PLANS: Record<CategoryId, KalshiDiscoveryPlan> = {
  agriculture: {
    // Kalshi doesn't expose an Agriculture category in tags_by_categories; agriculture risk is proxied by weather.
    seriesCategory: "Climate and Weather",
    tags: ["Hurricanes", "Natural disasters", "Snow and rain", "Climate change"],
    titleKeywords: ["crop", "yield", "harvest", "citrus", "orange", "dairy", "farm", "agriculture"],
  },

  weather: {
    seriesCategory: "Climate and Weather",
    tags: ["Hurricanes", "Natural disasters", "Snow and rain", "Climate change"],
    titleKeywords: ["hurricane", "storm", "rain", "snow", "temperature", "drought", "flood", "heat", "cold"],
  },

  energy: {
    // Energy is represented as a tag under Economics ("Oil and energy") and also under Science and Technology ("Energy").
    // Pick one primary. Economics is usually better for risk/macro framing.
    seriesCategory: "Economics",
    tags: ["Oil and energy"],
    titleKeywords: ["oil", "gas", "energy", "power", "electric", "fuel", "wti", "brent"],
  },

  logistics: {
    seriesCategory: "Economics",
    tags: ["Growth"], // weak proxy; mostly rely on keywords
    titleKeywords: ["shipping", "freight", "logistics", "port", "supply chain", "delivery", "trucking"],
  },

  tourism: {
    // No dedicated travel category in tags_by_categories; use Companies/KPIs as a proxy and rely on title keywords.
    seriesCategory: "Companies",
    tags: ["KPIs"],
    titleKeywords: ["travel", "hotel", "tourism", "airline", "passenger", "vacation", "resort"],
  },

  finance: {
    seriesCategory: "Economics",
    tags: ["Fed", "Inflation", "Employment", "Growth", "Housing", "Mortgages"],
    titleKeywords: ["inflation", "rates", "cpi", "gdp", "recession", "unemployment", "fed", "mortgage", "housing"],
  },

  health: {
    // Health is not available as a top-level category in tags_by_categories, so tags remain empty.
    seriesCategory: undefined,
    tags: [],
    titleKeywords: ["health", "flu", "hospital", "outbreak", "disease", "pandemic"],
  },

  technology: {
    seriesCategory: "Science and Technology",
    tags: ["AI", "Space", "Energy"],
    titleKeywords: ["technology", "software", "ai", "semiconductor", "cloud", "space"],
  },

  "real-estate": {
    seriesCategory: "Economics",
    tags: ["Housing", "Mortgages"],
    titleKeywords: ["housing", "mortgage", "rent", "property", "construction", "real estate", "home prices"],
  },
};
