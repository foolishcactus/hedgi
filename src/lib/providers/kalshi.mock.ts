import type { CategoryId, Market } from "@/types/hedgi";

const markets: Market[] = [
  {
    id: "kalshi-weather-atlantic-2026",
    source: "kalshi",
    title: "Will the 2026 Atlantic hurricane season be above average?",
    description: "Seasonal hurricane activity vs long-term average.",
    categoryId: "weather",
    closeTime: "2026-11-30T21:00:00Z",
    outcomes: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    liquidity: 220000,
    volume: 480000,
  },
  {
    id: "kalshi-agri-florida-citrus-2026",
    source: "kalshi",
    title: "Will Florida orange yield fall below 60M boxes in 2026?",
    description: "USDA reported Florida orange production.",
    categoryId: "agriculture",
    closeTime: "2027-01-15T18:00:00Z",
    outcomes: [
      { id: "yes", label: "Below 60M" },
      { id: "no", label: "60M or more" },
    ],
    liquidity: 85000,
    volume: 140000,
  },
  {
    id: "kalshi-energy-wti-q3-2026",
    source: "kalshi",
    title: "Will WTI crude average above $85 in Q3 2026?",
    description: "Quarterly average of front-month WTI.",
    categoryId: "energy",
    closeTime: "2026-10-01T00:00:00Z",
    outcomes: [
      { id: "yes", label: "Above $85" },
      { id: "no", label: "At or below $85" },
    ],
    liquidity: 190000,
    volume: 320000,
  },
  {
    id: "kalshi-finance-cpi-dec-2026",
    source: "kalshi",
    title: "Will US CPI YoY exceed 3.0% in Dec 2026?",
    description: "BLS CPI YoY for December 2026.",
    categoryId: "finance",
    closeTime: "2027-01-20T13:30:00Z",
    outcomes: [
      { id: "yes", label: "Above 3.0%" },
      { id: "no", label: "3.0% or below" },
    ],
    liquidity: 130000,
    volume: 210000,
  },
  {
    id: "kalshi-weather-co-snow-2026",
    source: "kalshi",
    title: "Will Colorado snowfall be above average for 2026-27?",
    description: "Seasonal snowfall vs 10-year average.",
    categoryId: "weather",
    closeTime: "2027-04-15T19:00:00Z",
    outcomes: [
      { id: "yes", label: "Above average" },
      { id: "no", label: "Average or below" },
    ],
    liquidity: 64000,
    volume: 98000,
  },
  {
    id: "kalshi-tourism-airline-2026",
    source: "kalshi",
    title: "Will US airline passenger volume exceed 2019 levels in 2026?",
    description: "Total annual US airline passengers.",
    categoryId: "tourism",
    closeTime: "2027-02-15T20:00:00Z",
    outcomes: [
      { id: "yes", label: "Exceed 2019" },
      { id: "no", label: "Not exceed" },
    ],
    liquidity: 52000,
    volume: 76000,
  },
  {
    id: "kalshi-realestate-housing-2026",
    source: "kalshi",
    title: "Will US housing starts exceed 1.5M in 2026?",
    description: "Annualized housing starts.",
    categoryId: "real-estate",
    closeTime: "2027-01-25T15:00:00Z",
    outcomes: [
      { id: "yes", label: "Above 1.5M" },
      { id: "no", label: "1.5M or below" },
    ],
    liquidity: 78000,
    volume: 120000,
  },
  {
    id: "kalshi-agri-soy-2026",
    source: "kalshi",
    title: "Will soybean prices exceed $14/bushel by Sep 2026?",
    description: "Front-month soybean futures settlement.",
    categoryId: "agriculture",
    closeTime: "2026-09-30T19:00:00Z",
    outcomes: [
      { id: "yes", label: "Above $14" },
      { id: "no", label: "At or below $14" },
    ],
    liquidity: 94000,
    volume: 155000,
  },
];

export const fetchActiveMarketsByCategories = async (
  categories: CategoryId[],
): Promise<Market[]> => {
  if (!categories.length) return markets;
  const categorySet = new Set(categories);
  return markets.filter((market) => categorySet.has(market.categoryId));
};
