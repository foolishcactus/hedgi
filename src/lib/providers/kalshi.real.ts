import type { CategoryId, Market } from "@/types/hedgi";

type KalshiApiResponse = {
  markets: Market[];
  meta?: {
    error?: string;
  };
};

export const fetchKalshiMarketsReal = async (
  categories: CategoryId[],
): Promise<Market[]> => {
  const response = await fetch("/api/markets/kalshi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categories }),
  });

  if (!response.ok) {
    throw new Error(`kalshi_api_${response.status}`);
  }

  const data = (await response.json()) as KalshiApiResponse;
  if (data?.meta?.error) {
    throw new Error(data.meta.error);
  }

  return Array.isArray(data?.markets) ? data.markets : [];
};
