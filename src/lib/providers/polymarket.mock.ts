import type { CategoryId, Market } from "@/types/hedgi";

const markets: Market[] = [
  {
    id: "poly-weather-gulf-landfall-2026",
    source: "polymarket",
    title: "Will a major hurricane make Gulf Coast landfall in 2026?",
    description: "Category 3+ hurricane landfall on US Gulf Coast.",
    categoryId: "weather",
    closeTime: "2026-11-15T21:00:00Z",
    outcomes: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    liquidity: 180000,
    volume: 260000,
  },
  {
    id: "poly-agri-corn-yield-2026",
    source: "polymarket",
    title: "Will US corn yield fall below 170 bu/acre in 2026?",
    description: "USDA final corn yield estimate.",
    categoryId: "agriculture",
    closeTime: "2027-01-12T18:00:00Z",
    outcomes: [
      { id: "yes", label: "Below 170" },
      { id: "no", label: "170 or above" },
    ],
    liquidity: 72000,
    volume: 110000,
  },
  {
    id: "poly-energy-henryhub-winter-2026",
    source: "polymarket",
    title: "Will Henry Hub gas average above $4.00 in winter 2026-27?",
    description: "Winter average natural gas price.",
    categoryId: "energy",
    closeTime: "2027-03-31T20:00:00Z",
    outcomes: [
      { id: "yes", label: "Above $4.00" },
      { id: "no", label: "$4.00 or below" },
    ],
    liquidity: 65000,
    volume: 97000,
  },
  {
    id: "poly-logistics-bdi-2026",
    source: "polymarket",
    title: "Will the Baltic Dry Index exceed 2,000 in 2026?",
    description: "Shipping rate benchmark.",
    categoryId: "logistics",
    closeTime: "2026-12-29T20:00:00Z",
    outcomes: [
      { id: "yes", label: "Above 2,000" },
      { id: "no", label: "2,000 or below" },
    ],
    liquidity: 41000,
    volume: 62000,
  },
  {
    id: "poly-tourism-hotel-occupancy-2026",
    source: "polymarket",
    title: "Will US hotel occupancy exceed 66% in summer 2026?",
    description: "Industry occupancy rate, Jun-Aug 2026.",
    categoryId: "tourism",
    closeTime: "2026-09-10T20:00:00Z",
    outcomes: [
      { id: "yes", label: "Above 66%" },
      { id: "no", label: "66% or below" },
    ],
    liquidity: 36000,
    volume: 54000,
  },
  {
    id: "poly-finance-unemployment-2026",
    source: "polymarket",
    title: "Will US unemployment exceed 5.0% by Dec 2026?",
    description: "Seasonally adjusted unemployment rate.",
    categoryId: "finance",
    closeTime: "2027-01-08T13:30:00Z",
    outcomes: [
      { id: "yes", label: "Above 5.0%" },
      { id: "no", label: "5.0% or below" },
    ],
    liquidity: 98000,
    volume: 150000,
  },
  {
    id: "poly-health-flu-2026",
    source: "polymarket",
    title: "Will US flu hospitalizations exceed 2025 levels in 2026-27?",
    description: "Seasonal flu hospitalization totals.",
    categoryId: "health",
    closeTime: "2027-05-01T18:00:00Z",
    outcomes: [
      { id: "yes", label: "Exceed 2025" },
      { id: "no", label: "Not exceed" },
    ],
    liquidity: 28000,
    volume: 43000,
  },
  {
    id: "poly-tech-semiconductor-2026",
    source: "polymarket",
    title: "Will global semiconductor sales grow over 10% in 2026?",
    description: "YoY growth in semiconductor industry sales.",
    categoryId: "technology",
    closeTime: "2027-02-01T18:00:00Z",
    outcomes: [
      { id: "yes", label: "Over 10%" },
      { id: "no", label: "10% or below" },
    ],
    liquidity: 53000,
    volume: 82000,
  },
];

export const fetchActiveMarketsByCategories = async (
  categories: CategoryId[],
): Promise<Market[]> => {
  if (!categories.length) return markets;
  const categorySet = new Set(categories);
  return markets.filter((market) => categorySet.has(market.categoryId));
};
