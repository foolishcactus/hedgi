const BASE_URL = process.env.KALSHI_BASE_URL || "https://api.elections.kalshi.com";

const SERIES_TTL_MS = Number(process.env.KALSHI_SERIES_TTL_MS || 30 * 60 * 1000);
const MARKETS_TTL_MS = Number(process.env.KALSHI_MARKETS_TTL_MS || 60000);
const OPEN_CHECK_TTL_MS = Number(process.env.KALSHI_OPEN_CHECK_TTL_MS || 30000);
const MAX_PAGES = 50;
const PAGE_LIMIT = 100;

const seriesCache = {
  expiresAt: 0,
  series: [],
  lastFetchedAt: 0,
};

const seriesByTagsCache = new Map();

const marketsCache = new Map();
const openCheckCache = new Map();

const fetchJson = async (url) => {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch (err) {
    const cause = err?.cause?.code || err?.cause?.message || err?.message || "fetch_failed";
    throw new Error(`kalshi_fetch_failed: ${cause}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`kalshi_http_${response.status}: ${text}`);
  }
  return response.json();
};

const extractArray = (data, keys) => {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
};

const extractCursor = (data) => {
  if (typeof data?.cursor === "string" && data.cursor) return data.cursor;
  if (typeof data?.next_cursor === "string" && data.next_cursor) return data.next_cursor;
  if (typeof data?.next === "string" && data.next) return data.next;
  if (typeof data?.nextCursor === "string" && data.nextCursor) return data.nextCursor;
  return null;
};

export const fetchKalshiSeriesList = async () => {
  const now = Date.now();
  if (seriesCache.series.length && now < seriesCache.expiresAt) {
    console.log(`Kalshi series cache hit (${seriesCache.series.length})`);
    return { series: seriesCache.series, cacheHit: true };
  }

  console.log("Kalshi series cache miss. Fetching series list...");
  const series = [];
  let cursor = null;
  let pages = 0;

  do {
    const url = new URL("/trade-api/v2/series", BASE_URL);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    const data = await fetchJson(url.toString());
    const batch = extractArray(data, ["series", "items", "results", "data"]);
    series.push(...batch);
    cursor = extractCursor(data);
    pages += 1;

    if (batch.length < PAGE_LIMIT) break;
  } while (cursor && pages < MAX_PAGES);

  seriesCache.series = series;
  seriesCache.lastFetchedAt = now;
  seriesCache.expiresAt = now + SERIES_TTL_MS;

  console.log(`Kalshi series fetched: ${series.length}`);
  return { series, cacheHit: false };
};

const normalizeTags = (tags) =>
  Array.isArray(tags) ? tags.map((tag) => tag.trim()).filter(Boolean) : [];

const buildTagsCacheKey = (tags) => {
  const normalized = normalizeTags(tags).sort((a, b) => a.localeCompare(b));
  return `kalshi:series:tags=${normalized.join("|")}`;
};

const buildEncodedTagsParam = (tags) => {
  const normalized = normalizeTags(tags);
  if (!normalized.length) return "";
  return normalized.map((tag) => encodeURIComponent(tag)).join(",");
};

const buildSeriesUrl = (encodedTags, cursor) => {
  const url = new URL("/trade-api/v2/series", BASE_URL);
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_LIMIT));
  if (cursor) params.set("cursor", cursor);
  let query = params.toString();
  if (encodedTags) {
    query = `${query}${query ? "&" : ""}tags=${encodedTags}`;
  }
  url.search = query;
  return url.toString();
};

export const fetchKalshiSeriesByTags = async (tags) => {
  const normalizedTags = normalizeTags(tags);
  const key = buildTagsCacheKey(normalizedTags);
  const now = Date.now();
  const cached = seriesByTagsCache.get(key);
  if (cached && now < cached.expiresAt) {
    return { series: cached.series, cacheHit: true, key };
  }

  const encodedTags = buildEncodedTagsParam(normalizedTags);

  const series = [];
  let cursor = null;
  let pages = 0;

  do {
    const url = buildSeriesUrl(encodedTags, cursor);
    const data = await fetchJson(url);
    const batch = extractArray(data, ["series", "items", "results", "data"]);
    series.push(...batch);
    cursor = extractCursor(data);
    pages += 1;

    if (batch.length < PAGE_LIMIT) break;
  } while (cursor && pages < MAX_PAGES);

  seriesByTagsCache.set(key, {
    series,
    expiresAt: now + SERIES_TTL_MS,
    fetchedAt: now,
  });

  return { series, cacheHit: false, key };
};

export const getKalshiSeriesCacheSnapshot = () => {
  const now = Date.now();
  const count = seriesCache.series.length;
  const ageMs = count ? now - seriesCache.lastFetchedAt : null;
  return { ageMs, count };
};

export const getKalshiSeriesByTagsCacheSnapshot = () => {
  const now = Date.now();
  return Array.from(seriesByTagsCache.entries()).map(([key, value]) => ({
    key,
    ageMs: now - value.fetchedAt,
    count: Array.isArray(value.series) ? value.series.length : 0,
  }));
};

export const fetchKalshiSeriesPing = async () => {
  const url = new URL("/trade-api/v2/series", BASE_URL);
  url.searchParams.set("limit", "1");
  const data = await fetchJson(url.toString());
  const sample = extractArray(data, ["series", "items", "results", "data"])[0] || null;
  return { ok: true, sample };
};

const buildMarketsCacheKey = (seriesTicker, status, closeMin, closeMax) =>
  [seriesTicker, status || "open", closeMin || "", closeMax || ""].join("|");

const getRetryAfterSeconds = (response) => {
  const header = response.headers.get("retry-after");
  if (!header) return null;

  const numeric = Number(header);
  if (!Number.isNaN(numeric) && numeric > 0) return Math.ceil(numeric);

  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    const diffMs = asDate - Date.now();
    if (diffMs > 0) return Math.ceil(diffMs / 1000);
  }

  return null;
};

export const getKalshiMarketsCacheSnapshot = () => {
  const now = Date.now();
  return Array.from(marketsCache.entries()).map(([key, value]) => ({
    key,
    ageMs: now - value.fetchedAtMs,
    count: Array.isArray(value.markets) ? value.markets.length : 0,
  }));
};

export const fetchKalshiMarketsForSeries = async ({
  seriesTicker,
  status = "open",
  closeMin = null,
  closeMax = null,
} = {}) => {
  if (!seriesTicker) {
    return { markets: [], cacheHit: false, rateLimited: false, retryAfterSec: null };
  }

  const cacheKey = buildMarketsCacheKey(seriesTicker, status, closeMin, closeMax);
  const cached = marketsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAtMs < MARKETS_TTL_MS) {
    return { markets: cached.markets, cacheHit: true, rateLimited: false, retryAfterSec: null };
  }

  const markets = [];
  let cursor = null;
  let pages = 0;

  do {
    const url = new URL("/trade-api/v2/markets", BASE_URL);
    url.searchParams.set("series_ticker", seriesTicker);
    url.searchParams.set("status", status);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (closeMin) url.searchParams.set("close_min", closeMin);
    if (closeMax) url.searchParams.set("close_max", closeMax);
    if (cursor) url.searchParams.set("cursor", cursor);

    let response;
    try {
      response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    } catch (err) {
      const cause = err?.cause?.code || err?.cause?.message || err?.message || "fetch_failed";
      throw new Error(`kalshi_fetch_failed: ${cause}`);
    }

    if (response.status === 429) {
      const retryAfterSec = getRetryAfterSeconds(response);
      return { markets, cacheHit: false, rateLimited: true, retryAfterSec };
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`kalshi_http_${response.status}: ${text}`);
    }

    const data = await response.json();
    const batch = extractArray(data, ["markets", "items", "results", "data"]);
    markets.push(...batch);
    cursor = extractCursor(data);
    pages += 1;

    if (batch.length < PAGE_LIMIT) break;
  } while (cursor && pages < MAX_PAGES);

  marketsCache.set(cacheKey, { markets, fetchedAtMs: Date.now() });
  return { markets, cacheHit: false, rateLimited: false, retryAfterSec: null };
};

export const fetchKalshiOpenMarketExists = async (seriesTicker) => {
  if (!seriesTicker) {
    return { hasOpen: false, cacheHit: false, rateLimited: false, retryAfterSec: null };
  }

  const cached = openCheckCache.get(seriesTicker);
  if (cached && Date.now() - cached.fetchedAtMs < OPEN_CHECK_TTL_MS) {
    return { hasOpen: cached.hasOpen, cacheHit: true, rateLimited: false, retryAfterSec: null };
  }

  const url = new URL("/trade-api/v2/markets", BASE_URL);
  url.searchParams.set("series_ticker", seriesTicker);
  url.searchParams.set("status", "open");
  url.searchParams.set("limit", "1");

  let response;
  try {
    response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  } catch (err) {
    const cause = err?.cause?.code || err?.cause?.message || err?.message || "fetch_failed";
    throw new Error(`kalshi_fetch_failed: ${cause}`);
  }

  if (response.status === 429) {
    const retryAfterSec = getRetryAfterSeconds(response);
    return { hasOpen: false, cacheHit: false, rateLimited: true, retryAfterSec };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`kalshi_http_${response.status}: ${text}`);
  }

  const data = await response.json();
  const batch = extractArray(data, ["markets", "items", "results", "data"]);
  const hasOpen = Array.isArray(batch) && batch.length > 0;
  openCheckCache.set(seriesTicker, { hasOpen, fetchedAtMs: Date.now() });
  return { hasOpen, cacheHit: false, rateLimited: false, retryAfterSec: null };
};
