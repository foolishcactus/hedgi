const KALSHI_EVENTS_URL = "https://api.elections.kalshi.com/trade-api/v2/events";

const EVENTS_PAGE_LIMIT = Number(process.env.KALSHI_EVENTS_LIMIT || 200);
const REQUESTS_PER_SECOND = Number(process.env.KALSHI_RPS || 5);
const MAX_RETRIES = Number(process.env.KALSHI_MAX_RETRIES || 3);
const BACKOFF_MS = Number(process.env.KALSHI_BACKOFF_MS || 1000);

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const KALSHI_CATEGORIES = ["Climate and Weather", "Economics", "Financials"];

const KALSHI_ALLOWED_CATEGORIES = new Set(
  KALSHI_CATEGORIES.map((category) => category.toLowerCase()).concat("climates and weather"),
);

const KALSHI_EXCLUDE_TAGS = new Set([
  "daily temperature",
  "high temp",
  "recurring",
  "foreign elections",
]);


const normalizeText = (value) => (value || "").toString().toLowerCase();
const normalizeCategory = (value) =>
  normalizeText(value)
    .replace(/\s+/g, " ")
    .trim();

const parseCloseTime = (value) => {
  if (!value) return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    return Number.isNaN(ms) ? null : ms;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeStatus = (value) => {
  const status = normalizeText(value).trim();
  if (status === "initialized") return "unopened";
  if (status === "active") return "open";
  return status;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let rateQueue = Promise.resolve();
let lastRequestAt = 0;
const MIN_INTERVAL_MS = Math.max(1, Math.floor(1000 / Math.max(1, REQUESTS_PER_SECOND)));

const scheduleRequest = () => {
  rateQueue = rateQueue.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastRequestAt = Date.now();
  });
  return rateQueue;
};

const fetchWithTimeout = async (url, timeoutMs = 15000) => {
  await scheduleRequest();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const getRetryAfterMs = (response) => {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const numeric = Number(header);
  if (!Number.isNaN(numeric) && numeric > 0) return Math.ceil(numeric * 1000);
  const parsed = Date.parse(header);
  if (!Number.isNaN(parsed)) {
    const diff = parsed - Date.now();
    return diff > 0 ? diff : null;
  }
  return null;
};

const fetchJson = async (url, retries = MAX_RETRIES, backoffMs = BACKOFF_MS) => {
  const response = await fetchWithTimeout(url);
  if (response.status === 429 && retries > 0) {
    const retryAfterMs = getRetryAfterMs(response);
    const waitMs = retryAfterMs ?? backoffMs;
    console.warn(`Rate limit hit (429). Retrying in ${waitMs}ms...`);
    await sleep(waitMs);
    return fetchJson(url, retries - 1, Math.min(backoffMs * 2, 15000));
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
};

const extractKalshiTags = (entity) => {
  const raw =
    entity?.tags ||
    entity?.tag_names ||
    entity?.tagNames ||
    entity?.tag_list ||
    entity?.tagList ||
    entity?.tags_list;

  if (Array.isArray(raw)) {
    return raw
      .filter((tag) => typeof tag === "string")
      .map((tag) => normalizeText(tag).trim())
      .filter(Boolean);
  }
  return [];
};

const extractKalshiEvents = (payload) => {
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const extractEventMarkets = (event) => {
  if (Array.isArray(event?.markets)) return event.markets;
  if (Array.isArray(event?.nested_markets)) return event.nested_markets;
  if (Array.isArray(event?.market_list)) return event.market_list;
  return [];
};

const extractEventTicker = (event) =>
  event?.event_ticker || event?.ticker || event?.id || event?.eventTicker || "";

const extractYesPrice = (market) => {
  const price =
    market?.yes_price ??
    market?.yesPrice ??
    market?.best_yes ??
    market?.best_yes_price ??
    market?.yes_bid ??
    market?.yesBid;
  if (typeof price === "number" && Number.isFinite(price)) return price;
  return null;
};

const extractKalshiCursor = (payload) => {
  if (typeof payload?.cursor === "string" && payload.cursor) return payload.cursor;
  if (typeof payload?.next_cursor === "string" && payload.next_cursor) return payload.next_cursor;
  if (typeof payload?.next === "string" && payload.next) return payload.next;
  return null;
};

const shouldKeepKalshiMarket = (market, overrides = {}) => {
  const status = normalizeStatus(
    market?.status || market?.market_status || market?.state || overrides.status,
  );
  if (status !== "open" && status !== "unopened") return false;

  const category = normalizeCategory(
    market?.category || market?.category_name || market?.categoryName || overrides.category,
  );
  if (!category || !KALSHI_ALLOWED_CATEGORIES.has(category)) return false;

  const rawTags = extractKalshiTags(market);
  const tags =
    rawTags.length > 0
      ? rawTags
      : Array.isArray(overrides.tags)
        ? overrides.tags.map((tag) => normalizeText(tag).trim()).filter(Boolean)
        : [];
  if (tags.some((tag) => KALSHI_EXCLUDE_TAGS.has(tag))) return false;

  const now = Date.now();
  const closeTimeMs = parseCloseTime(
    market?.close_time || market?.closeTime || market?.close_ts || market?.closeTimestamp,
  );
  if (status === "open" && closeTimeMs && closeTimeMs - now < TWO_DAYS_MS) return false;

  if (status === "unopened") {
    const openTimeMs = parseCloseTime(
      market?.open_time || market?.openTime || market?.open_ts || market?.openTimestamp,
    );
    if (!openTimeMs) return false;
    const delta = openTimeMs - now;
    if (delta < 0 || delta > ONE_YEAR_MS) return false;
  }

  return true;
};

const syncCategory = async (category, insertMany) => {
  let fetched = 0;
  let stored = 0;
  let filtered = 0;
  let cursor = null;
  let pages = 0;
  const seenEvents = new Set();

  do {
    console.log(
      `Kalshi sync status: events ${category} page ${pages + 1} (cursor=${cursor || "start"})`,
    );
    const url = new URL(KALSHI_EVENTS_URL);
    url.searchParams.set("category", category);
    url.searchParams.set("with_nested_markets", "true");
    url.searchParams.set("limit", String(EVENTS_PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    const payload = await fetchJson(url.toString());
    const events = extractKalshiEvents(payload);

    const rows = [];
    for (const event of events) {
      const eventTicker = extractEventTicker(event);
      const eventTitle = event?.title || event?.name || "";
      const eventCategory = event?.category || event?.category_name || category;
      const eventTags = extractKalshiTags(event);
      const markets = extractEventMarkets(event);

      if (!eventTicker || !eventTitle || seenEvents.has(eventTicker)) {
        filtered += markets.length || 1;
        continue;
      }
      seenEvents.add(eventTicker);

      let keepEvent = false;
      let selectedMarketTicker = null;
      let selectedYesPrice = null;
      for (const market of markets) {
        const status = normalizeStatus(market?.status || market?.market_status || market?.state);
        const mergedTags = Array.from(
          new Set([...eventTags, ...extractKalshiTags(market)]),
        );

        if (
          !shouldKeepKalshiMarket(market, {
            category: eventCategory,
            tags: mergedTags,
            status,
          })
        ) {
          filtered += 1;
          continue;
        }

        keepEvent = true;
        selectedMarketTicker =
          market?.ticker || market?.market_ticker || market?.id || selectedMarketTicker;
        selectedYesPrice = extractYesPrice(market) ?? selectedYesPrice;
        break;
      }

      if (keepEvent) {
        rows.push({
          ticker: eventTicker,
          title: eventTitle,
          market_ticker: selectedMarketTicker,
          price_yes: selectedYesPrice,
        });
      }
    }

    if (rows.length) {
      insertMany(rows);
      stored += rows.length;
    }

    fetched += events.reduce((acc, event) => acc + extractEventMarkets(event).length, 0);

    cursor = extractKalshiCursor(payload);
    pages += 1;

    if (!cursor || events.length < EVENTS_PAGE_LIMIT) break;
    if (pages > 200) break;
  } while (cursor);

  return { fetched, stored, filtered };
};

export const syncKalshiMarkets = async (db) => {
  let fetched = 0;
  let stored = 0;
  let filtered = 0;

  const insert = db.prepare(
    "INSERT OR REPLACE INTO markets (ticker, title, platform, market_ticker, price_yes, last_updated) VALUES (?, ?, 'kalshi', ?, ?, CURRENT_TIMESTAMP)",
  );
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row.ticker, row.title, row.market_ticker ?? null, row.price_yes ?? null);
    }
  });

  try {
    const results = await Promise.all(
      KALSHI_CATEGORIES.map((category) => syncCategory(category, insertMany)),
    );

    for (const result of results) {
      fetched += result.fetched;
      stored += result.stored;
      filtered += result.filtered;
    }
  } catch (err) {
    console.error("Error: Kalshi sync failed", err?.message || err);
  }

  return { fetched, stored, filtered };
};
