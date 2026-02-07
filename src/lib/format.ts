export const formatCurrency = (value: number, currency = "USD"): string => {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return formatter.format(value);
};

export const formatPercent = (value: number, digits = 0): string => {
  const normalized = value <= 1 ? value * 100 : value;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return formatter.format(normalized / 100);
};

export const daysUntil = (iso: string): number => {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  const now = Date.now();
  const diffMs = target - now;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil(diffMs / dayMs);
};
