export type HedgeQuoteInput = {
  market_id: string;
  price_yes: number;
  expected_profit: number;
  loss_if_event: number;
  hedge_coverage?: number;
  max_hedge_cost?: number | null;
};

export type HedgeQuoteOutput = {
  market_id: string;
  contracts_needed: number;
  contracts_to_buy: number;
  price_yes: number;
  target_payout: number;
  actual_payout: number;
  total_cost: number;
  profit_if_event: number;
  profit_if_no_event: number;
  coverage_achieved: number;
  expected_value: number;
};

export type HedgeQuotePercentInput = {
  market_id: string;
  price_yes: number;
  loss_if_event_percent: number;
  hedge_coverage?: number;
  max_hedge_cost?: number | null;
  baseline_loss?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const computeHedgeQuote = (input: HedgeQuoteInput): HedgeQuoteOutput => {
  const priceYes = input.price_yes;
  if (!(priceYes > 0 && priceYes < 1)) {
    throw new Error("invalid_price_yes");
  }

  const expectedProfit = input.expected_profit;
  if (!Number.isFinite(expectedProfit) || expectedProfit < -1e12 || expectedProfit > 1e12) {
    throw new Error("invalid_expected_profit");
  }

  const lossIfEvent = input.loss_if_event;
  if (!Number.isFinite(lossIfEvent) || lossIfEvent <= 0) {
    throw new Error("invalid_loss_if_event");
  }

  const hedgeCoverage = clamp(
    typeof input.hedge_coverage === "number" ? input.hedge_coverage : 1,
    0,
    1,
  );

  const maxCost = typeof input.max_hedge_cost === "number" ? Math.max(0, input.max_hedge_cost) : null;

  const targetPayout = lossIfEvent * hedgeCoverage;
  const contractsNeeded = Math.ceil(targetPayout);

  let contractsToBuy = contractsNeeded;
  if (maxCost !== null) {
    contractsToBuy = Math.min(contractsNeeded, Math.floor(maxCost / priceYes));
  }

  const actualPayout = contractsToBuy;
  const totalCost = contractsToBuy * priceYes;
  const profitIfEvent = expectedProfit - lossIfEvent + actualPayout - totalCost;
  const profitIfNoEvent = expectedProfit - totalCost;
  const coverageAchieved = lossIfEvent > 0 ? actualPayout / lossIfEvent : 0;

  const pEvent = clamp(priceYes, 0, 1);
  const expectedValue = pEvent * profitIfEvent + (1 - pEvent) * profitIfNoEvent;

  return {
    market_id: input.market_id,
    contracts_needed: contractsNeeded,
    contracts_to_buy: contractsToBuy,
    price_yes: priceYes,
    target_payout: targetPayout,
    actual_payout: actualPayout,
    total_cost: totalCost,
    profit_if_event: profitIfEvent,
    profit_if_no_event: profitIfNoEvent,
    coverage_achieved: coverageAchieved,
    expected_value: expectedValue,
  };
};

export const computeHedgeQuotePercent = (
  input: HedgeQuotePercentInput,
): HedgeQuoteOutput => {
  const baselineLoss =
    typeof input.baseline_loss === "number" && input.baseline_loss > 0
      ? input.baseline_loss
      : 100;

  const rawPercent = input.loss_if_event_percent;
  if (!Number.isFinite(rawPercent) || rawPercent <= 0) {
    throw new Error("invalid_loss_if_event_percent");
  }
  const normalizedPercent = rawPercent > 1 ? rawPercent / 100 : rawPercent;

  const lossIfEvent = baselineLoss * clamp(normalizedPercent, 0, 1);

  return computeHedgeQuote({
    market_id: input.market_id,
    price_yes: input.price_yes,
    expected_profit: 0,
    loss_if_event: lossIfEvent,
    hedge_coverage: input.hedge_coverage,
    max_hedge_cost: input.max_hedge_cost,
  });
};
