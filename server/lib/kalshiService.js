import { fetchKalshiMarketsForSeries } from "./kalshiClient.js";
import { KALSHI_CATEGORY_PLANS } from "./kalshiMapping.js";

const normalize = (value) => value.toLowerCase().trim();
const SERIES_DELAY_MS = Number(process.env.KALSHI_SERIES_DELAY_MS || 500);
const MAX_SERIES_PER_CATEGORY = Number(process.env.KALSHI_MAX_SERIES_PER_CATEGORY || 5);
const MAX_TOTAL_SERIES = Number(process.env.KALSHI_MAX_SERIES || 10);

const getSeriesFields = (series) => {
  const ticker = series?.ticker || series?.series_ticker || series?.id || "";
  const title = series?.title || series?.name || "";
  const category = series?.category || series?.category_name || "";
  return { ticker, title, category };
};

const getSeriesTags = (series) => {
  const raw = series?.tags || series?.tag_names || series?.tagNames || series?.tag_list || series?.tagList;
  if (Array.isArray(raw)) {
    return raw.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
};

const matchesPlan = (series, plan) => {
  const { ticker, title, category } = getSeriesFields(series);
  const reasons = [];

  if (plan.seriesCategory && category) {
    if (normalize(category).includes(normalize(plan.seriesCategory))) {
      reasons.push(`category:${plan.seriesCategory}`);
    }
  }

  if (plan.seriesTickerPrefixes && ticker) {
    const prefixMatch = plan.seriesTickerPrefixes.find((prefix) =>
      normalize(ticker).startsWith(normalize(prefix)),
    );
    if (prefixMatch) reasons.push(`prefix:${prefixMatch}`);
  }

  if (plan.seriesTitleKeywords && title) {
    const keywordMatch = plan.seriesTitleKeywords.find((keyword) =>
      normalize(title).includes(normalize(keyword)),
    );
    if (keywordMatch) reasons.push(`keyword:${keywordMatch}`);
  }

  return reasons;
};

export const getTagsForCategories = (categories) => {
  const tagSet = new Set();
  const tagsByCategory = {};

  for (const category of categories) {
    const plan = KALSHI_CATEGORY_PLANS[category];
    const tags = Array.isArray(plan?.tags) ? plan.tags.filter(Boolean) : [];
    if (tags.length) {
      tagsByCategory[category] = tags;
      tags.forEach((tag) => tagSet.add(tag));
    }
  }

  return { tags: Array.from(tagSet), tagsByCategory };
};

export const selectSeriesForHedgiCategories = (categories, seriesList, tagsByCategory = {}) => {
  const selected = [];
  const categoryMap = {};
  let capped = false;

  for (const category of categories) {
    const plan = KALSHI_CATEGORY_PLANS[category];
    if (!plan) continue;

    const candidates = [];

    for (const series of seriesList) {
      const { ticker, title, category: seriesCategory } = getSeriesFields(series);
      if (!ticker) continue;

      if (plan.seriesCategory) {
        if (!seriesCategory || normalize(seriesCategory) !== normalize(plan.seriesCategory)) {
          continue;
        }
      }

      let score = 0;
      const reasons = [];

      const planTags = tagsByCategory[category] || plan.tags || [];
      if (planTags.length) {
        score += 3;
        reasons.push(...planTags.map((tag) => `tag:${tag}`));
      }

      if (plan.titleKeywords && title) {
        const keyword = plan.titleKeywords.find((keywordItem) =>
          normalize(title).includes(normalize(keywordItem)),
        );
        if (keyword) {
          score += 2;
          reasons.push(`keyword:${keyword}`);
        }
      }

      if (score === 0) continue;

      candidates.push({ ticker, score, reasons });
    }

    candidates.sort((a, b) => (b.score - a.score) || a.ticker.localeCompare(b.ticker));
    const limited = candidates.slice(0, MAX_SERIES_PER_CATEGORY);
    if (candidates.length > limited.length) capped = true;

    for (const item of limited) {
      if (selected.some((existing) => existing.ticker === item.ticker)) continue;
      selected.push(item);
      if (!categoryMap[item.ticker]) {
        categoryMap[item.ticker] = category;
      }
    }
  }

  selected.sort((a, b) => (b.score - a.score) || a.ticker.localeCompare(b.ticker));
  let finalSelected = selected;
  if (selected.length > MAX_TOTAL_SERIES) {
    finalSelected = selected.slice(0, MAX_TOTAL_SERIES);
    capped = true;
  }

  return {
    selected: finalSelected,
    tickers: finalSelected.map((item) => item.ticker),
    categoryMap,
    capped,
  };
};

export const selectSeriesByTags = (seriesList, tags, maxSeries = MAX_TOTAL_SERIES) => {
  const normalizedTags = Array.isArray(tags)
    ? tags.map((tag) => tag.trim()).filter(Boolean).map(normalize)
    : [];

  const candidates = [];

  for (const series of seriesList) {
    const { ticker, title } = getSeriesFields(series);
    if (!ticker) continue;

    const seriesTags = getSeriesTags(series).map(normalize);
    let overlap = 0;
    if (normalizedTags.length && seriesTags.length) {
      const tagSet = new Set(seriesTags);
      overlap = normalizedTags.reduce((count, tag) => (tagSet.has(tag) ? count + 1 : count), 0);
    }

    candidates.push({ ticker, title, overlap });
  }

  candidates.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    if (a.title !== b.title) return a.title.localeCompare(b.title);
    return a.ticker.localeCompare(b.ticker);
  });

  const noCap = typeof maxSeries === "number" && maxSeries <= 0;
  const limit = noCap ? candidates.length : Math.max(1, maxSeries);
  const limited = candidates.slice(0, limit);
  return {
    selected: limited,
    tickers: limited.map((item) => item.ticker),
  };
};

const toIso = (value) => {
  if (!value) return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
};

const normalizeOutcomes = (market) => {
  if (Array.isArray(market?.outcomes) && market.outcomes.length) {
    return market.outcomes.map((outcome, index) => ({
      id: outcome?.id || outcome?.name || outcome?.label || `outcome-${index}`,
      label: outcome?.name || outcome?.label || `Outcome ${index + 1}`,
      price: typeof outcome?.price === "number" ? outcome.price : undefined,
    }));
  }

  const outcomes = [];
  if (typeof market?.yes_price === "number") {
    outcomes.push({ id: "yes", label: "Yes", price: market.yes_price });
  }
  if (typeof market?.no_price === "number") {
    outcomes.push({ id: "no", label: "No", price: market.no_price });
  }
  if (!outcomes.length) {
    outcomes.push({ id: "yes", label: "Yes" }, { id: "no", label: "No" });
  }
  return outcomes;
};

const normalizeMarket = (market, categoryId) => {
  const ticker = market?.ticker || market?.market_ticker || market?.id || "";
  const title = market?.title || market?.market_name || market?.name || "Kalshi market";
  const closeTime =
    toIso(market?.close_time || market?.closeTime || market?.close_ts || market?.closeTimestamp) ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const url = ticker ? `https://kalshi.com/markets/${ticker.toLowerCase()}` : "";

  return {
    id: ticker || `${categoryId}-${title}`,
    source: "kalshi",
    title,
    description: market?.description || market?.subtitle || "",
    categoryId,
    closeTime,
    outcomes: normalizeOutcomes(market),
    liquidity: typeof market?.liquidity === "number" ? market.liquidity : market?.open_interest,
    volume: typeof market?.volume === "number" ? market.volume : market?.volume_24h,
    url,
  };
};

export const fetchMarketsForSeriesTickers = async (tickers, categoryMap) => {
  const markets = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  let seriesFetched = 0;
  let rateLimited = false;
  let retryAfterSec = null;

  for (const ticker of tickers) {
    const result = await fetchKalshiMarketsForSeries({ seriesTicker: ticker, status: "open" });
    const categoryId = categoryMap[ticker] || "finance";

    if (result.rateLimited) {
      rateLimited = true;
      retryAfterSec = result.retryAfterSec;
      seriesFetched += 1;
      cacheMisses += 1;
      break;
    }

    if (result.cacheHit) {
      cacheHits += 1;
    } else {
      cacheMisses += 1;
      seriesFetched += 1;
    }

    for (const market of result.markets) {
      markets.push(normalizeMarket(market, categoryId));
    }

    if (!result.cacheHit && SERIES_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, SERIES_DELAY_MS));
    }
  }

  return {
    markets,
    meta: {
      seriesSelected: tickers.length,
      seriesFetched,
      cacheHits,
      cacheMisses,
      rateLimited,
      retryAfterSec,
      partial: rateLimited,
      marketsTotal: markets.length,
    },
  };
};
