import type { Market } from "@/types/hedgi";

export type ProviderId = "kalshi" | "polymarket";

export type ProviderFetchResult = {
  markets: Market[];
  meta: {
    provider: ProviderId;
    fetchedSeries?: number;
    fetchedMarkets: number;
    cacheHit?: boolean;
    error?: string;
  };
};
