import { describe, it, expect } from "vitest";
import { computeHedgeQuote, computeHedgeQuotePercent } from "@/lib/hedgeCalculator";

describe("computeHedgeQuote", () => {
  it("calculates without budget cap", () => {
    const result = computeHedgeQuote({
      market_id: "M1",
      price_yes: 0.2,
      expected_profit: 1000,
      loss_if_event: 500,
      hedge_coverage: 1,
    });

    expect(result.contracts_needed).toBe(500);
    expect(result.contracts_to_buy).toBe(500);
    expect(result.total_cost).toBeCloseTo(100, 6);
    expect(result.profit_if_event).toBeCloseTo(900, 6);
    expect(result.profit_if_no_event).toBeCloseTo(900, 6);
    expect(result.coverage_achieved).toBeCloseTo(1, 6);
  });

  it("applies budget cap", () => {
    const result = computeHedgeQuote({
      market_id: "M2",
      price_yes: 0.5,
      expected_profit: 2000,
      loss_if_event: 1000,
      hedge_coverage: 1,
      max_hedge_cost: 200,
    });

    expect(result.contracts_needed).toBe(1000);
    expect(result.contracts_to_buy).toBe(400);
    expect(result.total_cost).toBeCloseTo(200, 6);
    expect(result.coverage_achieved).toBeCloseTo(0.4, 6);
  });

  it("supports partial coverage", () => {
    const result = computeHedgeQuote({
      market_id: "M3",
      price_yes: 0.25,
      expected_profit: 1000,
      loss_if_event: 100,
      hedge_coverage: 0.5,
    });

    expect(result.contracts_needed).toBe(50);
    expect(result.total_cost).toBeCloseTo(12.5, 6);
    expect(result.coverage_achieved).toBeCloseTo(0.5, 6);
  });

  it("rejects invalid price_yes", () => {
    expect(() =>
      computeHedgeQuote({
        market_id: "M4",
        price_yes: 1,
        expected_profit: 1000,
        loss_if_event: 100,
      }),
    ).toThrow("invalid_price_yes");
  });

  it("handles tiny loss values", () => {
    const result = computeHedgeQuote({
      market_id: "M5",
      price_yes: 0.33,
      expected_profit: 100,
      loss_if_event: 10,
    });

    expect(result.contracts_needed).toBe(10);
    expect(result.total_cost).toBeCloseTo(3.3, 6);
    expect(result.coverage_achieved).toBeCloseTo(1, 6);
  });

  it("supports percent-of-loss mode", () => {
    const result = computeHedgeQuotePercent({
      market_id: "P1",
      price_yes: 0.25,
      loss_if_event_percent: 50,
      hedge_coverage: 0.5,
    });

    expect(result.target_payout).toBeCloseTo(25, 6);
    expect(result.contracts_needed).toBe(25);
  });
});
