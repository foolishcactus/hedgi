import type { BusinessProfile, CategoryId, CategoryMatch } from "@/types/hedgi";

export type CategoryDefinition = {
  id: CategoryId;
  label: string;
  keywords: string[];
  notes: string;
  defaultRegionBehavior: string;
};

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: "agriculture",
    label: "Agriculture & Crops",
    keywords: ["farm", "crop", "harvest", "citrus", "orchard", "livestock", "grain", "corn", "soy", "dairy"],
    notes: "Seasonality, yields, and input costs are often dominant factors.",
    defaultRegionBehavior: "regional-seasonal",
  },
  {
    id: "weather",
    label: "Weather & Climate",
    keywords: ["hurricane", "drought", "flood", "rain", "rainfall", "snow", "temperature", "storm", "heat", "frost"],
    notes: "Severe weather drives abrupt operational and revenue changes.",
    defaultRegionBehavior: "coastal-sensitive",
  },
  {
    id: "energy",
    label: "Energy & Fuel",
    keywords: ["oil", "gas", "fuel", "diesel", "electricity", "power", "solar", "wind", "utility"],
    notes: "Input costs and demand often track energy prices.",
    defaultRegionBehavior: "national",
  },
  {
    id: "logistics",
    label: "Logistics & Supply Chain",
    keywords: ["shipping", "freight", "trucking", "port", "supply", "warehouse", "inventory", "delivery"],
    notes: "Bottlenecks or delays can compress margins quickly.",
    defaultRegionBehavior: "hub-sensitive",
  },
  {
    id: "tourism",
    label: "Tourism & Leisure",
    keywords: ["hotel", "resort", "travel", "vacation", "tourism", "airline", "cruise", "rental", "visitor"],
    notes: "Demand is highly discretionary and weather-sensitive.",
    defaultRegionBehavior: "seasonal",
  },
  {
    id: "sports",
    label: "Sports & Events",
    keywords: ["stadium", "tickets", "league", "season", "playoffs", "team", "event", "attendance"],
    notes: "Attendance and broadcast factors drive revenue shifts.",
    defaultRegionBehavior: "seasonal",
  },
  {
    id: "finance",
    label: "Rates & Macro",
    keywords: ["interest", "inflation", "cpi", "rates", "recession", "credit", "fed", "yield"],
    notes: "Rates and inflation often shape demand and financing costs.",
    defaultRegionBehavior: "national",
  },
  {
    id: "health",
    label: "Health & Insurance",
    keywords: ["hospital", "clinic", "insurance", "flu", "outbreak", "pharma", "healthcare"],
    notes: "Utilization and regulatory shifts can swing revenue.",
    defaultRegionBehavior: "regional",
  },
  {
    id: "technology",
    label: "Technology & SaaS",
    keywords: ["software", "saas", "cloud", "semiconductor", "ai", "data", "hardware"],
    notes: "Demand depends on enterprise spending and product cycles.",
    defaultRegionBehavior: "national",
  },
  {
    id: "real-estate",
    label: "Real Estate & Construction",
    keywords: ["mortgage", "housing", "rent", "commercial", "construction", "property", "development"],
    notes: "Rates, permits, and demand cycles are key drivers.",
    defaultRegionBehavior: "regional",
  },
];

const normalize = (value: string) => value.trim().toLowerCase();

const containsKeyword = (haystack: string, keyword: string) =>
  haystack.includes(keyword) || keyword.includes(haystack);

export const inferCategoriesFromProfile = (profile: BusinessProfile): CategoryMatch[] => {
  const baseKeywords = new Set<string>();
  if (profile.industry) baseKeywords.add(normalize(profile.industry));
  if (profile.location) baseKeywords.add(normalize(profile.location));
  profile.keywords.forEach((keyword) => baseKeywords.add(normalize(keyword)));
  profile.exposures.forEach((risk) => baseKeywords.add(normalize(risk)));

  const matches: CategoryMatch[] = [];

  for (const category of CATEGORY_DEFINITIONS) {
    const matchedKeywords: string[] = [];
    let industryMatch = false;

    for (const keyword of category.keywords) {
      for (const candidate of baseKeywords) {
        if (containsKeyword(candidate, keyword) || containsKeyword(keyword, candidate)) {
          matchedKeywords.push(keyword);
          if (profile.industry && containsKeyword(normalize(profile.industry), keyword)) {
            industryMatch = true;
          }
          break;
        }
      }
    }

    const hitCount = matchedKeywords.length + (industryMatch ? 1 : 0);
    if (hitCount === 0) continue;

    const coverageDenominator = Math.max(4, Math.min(8, category.keywords.length));
    const coverage = hitCount / coverageDenominator;
    const regionBoost =
      profile.region && category.defaultRegionBehavior !== "national" ? 0.05 : 0;
    const confidence = Math.min(1, 0.15 + coverage * 0.75 + regionBoost);

    const rationaleParts = [
      matchedKeywords.length ? `Matched keywords: ${matchedKeywords.join(", ")}` : "",
      industryMatch ? "Industry alignment" : "",
      profile.region ? `Region: ${profile.region}` : "",
    ].filter(Boolean);

    matches.push({
      id: category.id,
      confidence,
      rationale: rationaleParts.join(" | "),
    });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
};
