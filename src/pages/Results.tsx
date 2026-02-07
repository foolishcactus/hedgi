import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Building2, ChevronRight, Shield, Signal, Tag } from "lucide-react";
import { runHedgiSnapshot, type SnapshotResult } from "@/lib/pipeline/snapshotPipeline";
import { computeHedgeQuote } from "@/lib/hedgeCalculator";

const getErrorMessage = (code: string) => {
  switch (code) {
    case "missing_api_key":
      return "Missing GEMINI_API_KEY. Add it to your .env and restart the backend server.";
    case "missing_business":
      return "No business description was sent. Please go back and try again.";
    case "missing_business_description":
      return "No business description was sent. Please go back and try again.";
    case "empty_keyword_response":
      return "The AI service returned an empty keyword response. Please try again.";
    case "empty_score_response":
      return "The AI service returned an empty scoring response. Please try again.";
    default:
      return "We could not reach the AI service. Please check the API server and try again.";
  }
};

const formatScore = (value: number) => `${value.toFixed(1)}/10`;
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const getFallbackYesPrice = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000;
  }
  const normalized = (hash % 80) / 100 + 0.1; // 0.10 - 0.89
  return Number(normalized.toFixed(2));
};

export default function Results() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expectedProfitInput, setExpectedProfitInput] = useState("");
  const [maxHedgeCostInput, setMaxHedgeCostInput] = useState("");
  const [hasPrefilled, setHasPrefilled] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  useEffect(() => {
    const storedSnapshot = sessionStorage.getItem("hedgi_snapshot");
    if (storedSnapshot) {
      try {
        const parsed = JSON.parse(storedSnapshot) as SnapshotResult;
        if (parsed && Array.isArray(parsed.scoredMarkets)) {
          setSnapshot(parsed);
          setIsLoading(false);
          return;
        }
        sessionStorage.removeItem("hedgi_snapshot");
      } catch {
        sessionStorage.removeItem("hedgi_snapshot");
      }
    }

    const storedBusiness = sessionStorage.getItem("hedgi_business");
    if (!storedBusiness) {
      navigate("/");
      return;
    }

    setIsLoading(true);
    setError(null);

    runHedgiSnapshot(storedBusiness)
      .then((result) => {
        sessionStorage.setItem("hedgi_snapshot", JSON.stringify(result));
        setSnapshot(result);
      })
      .catch((err) => {
        const code = err instanceof Error ? err.message : "analysis_failed";
        setError(getErrorMessage(code));
      })
      .finally(() => setIsLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (!snapshot?.inputs || hasPrefilled) return;
    const { expected_profit, max_hedge_cost } = snapshot.inputs;
    if (expected_profit !== null && expectedProfitInput.trim() === "") {
      setExpectedProfitInput(String(expected_profit));
    }
    if (max_hedge_cost !== null && maxHedgeCostInput.trim() === "") {
      setMaxHedgeCostInput(String(max_hedge_cost));
    }
    setHasPrefilled(true);
  }, [snapshot, hasPrefilled, expectedProfitInput, maxHedgeCostInput]);

  useEffect(() => {
    if (!snapshot?.scoredMarkets.length) return;
    if (selectedMarketId) return;
    setSelectedMarketId(snapshot.scoredMarkets[0].ticker);
  }, [snapshot, selectedMarketId]);

  const topMarkets = useMemo(() => snapshot?.scoredMarkets.slice(0, 10) ?? [], [snapshot]);
  const expectedProfit = Number(expectedProfitInput);
  const maxHedgeCost = maxHedgeCostInput.trim() === "" ? null : Number(maxHedgeCostInput);
  const hedgeInputsValid = Number.isFinite(expectedProfit) && expectedProfit > 0;

  const assumedLossIfEvent = hedgeInputsValid ? expectedProfit * 0.8 : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 pb-20 px-6">
          <div className="container mx-auto max-w-4xl text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 mx-auto mb-6 rounded-full hedgi-gradient flex items-center justify-center"
            >
              <Shield className="w-8 h-8 text-white" />
            </motion.div>
            <h2 className="text-2xl font-semibold mb-2">Analyzing your business risks...</h2>
            <p className="text-muted-foreground">This usually takes a few seconds</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 pb-20 px-6">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-semibold mb-2">Analysis failed</h2>
            <p className="text-muted-foreground mb-6">
              {error || "We could not reach the AI service. Please try again."}
            </p>
            <Button variant="outline" size="lg" onClick={() => navigate("/")}>
              Back to Home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-28 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="hedgi-card p-6 mb-6"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div className="w-full">
                <h2 className="text-lg font-semibold mb-2">Business description</h2>
                <p className="text-sm text-muted-foreground">{snapshot.businessDescription}</p>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="hedgi-card p-6 mb-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Tag className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Search keywords</h2>
                <p className="text-sm text-muted-foreground">
                  {snapshot.matches.length} matching markets found in the database
                </p>
              </div>
            </div>
            {snapshot.keywords.length ? (
              <div className="flex flex-wrap gap-2">
                {snapshot.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No keywords returned yet.</p>
            )}
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="hedgi-card p-6 mb-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Signal className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Hedge calculator</h2>
                <p className="text-sm text-muted-foreground">
                  Pick a market to see its hedge impact using a simple assumption.
                </p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 mb-4">
              <p>We’ll assume the risk event wipes out 80% of your profit for this demo.</p>
              <p>Enter your expected profit if nothing goes wrong, then pick a market to see the hedge.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <label className="space-y-1">
                <span className="text-muted-foreground">Expected Profit (USD)</span>
                <span className="block text-[11px] text-muted-foreground/80">
                  Profit if the season goes normally.
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                  value={expectedProfitInput}
                  onChange={(event) => setExpectedProfitInput(event.target.value)}
                  placeholder="e.g., 250000"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">Max Hedge Cost (USD, optional)</span>
                <span className="block text-[11px] text-muted-foreground/80">
                  Optional budget cap for buying contracts.
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                  value={maxHedgeCostInput}
                  onChange={(event) => setMaxHedgeCostInput(event.target.value)}
                  placeholder="e.g., 10000"
                />
              </label>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hedgi-card p-6 mb-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Signal className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Signals</h2>
                <p className="text-sm text-muted-foreground">Top ranked markets</p>
              </div>
            </div>

            {topMarkets.length ? (
              <div className="space-y-3">
                {topMarkets.map((market) => {
                  const priceYesRaw =
                    typeof market.price_yes === "number"
                      ? market.price_yes
                      : getFallbackYesPrice(market.market_ticker || market.ticker);
                  const priceYesNormalized =
                    priceYesRaw !== null
                      ? priceYesRaw > 1
                        ? priceYesRaw / 100
                        : priceYesRaw
                      : null;
                  const hasValidPrice =
                    priceYesNormalized !== null &&
                    priceYesNormalized > 0 &&
                    priceYesNormalized < 1;
                  const isSelected = selectedMarketId === market.ticker;
                  const quote =
                    isSelected && hedgeInputsValid && hasValidPrice && assumedLossIfEvent !== null
                      ? (() => {
                          try {
                            return computeHedgeQuote({
                              market_id: market.market_ticker || market.ticker,
                              price_yes: priceYesNormalized,
                              expected_profit: expectedProfit,
                              loss_if_event: assumedLossIfEvent,
                              hedge_coverage: 1,
                              max_hedge_cost: maxHedgeCost,
                            });
                          } catch {
                            return null;
                          }
                        })()
                      : null;
                  return (
                    <div
                      key={market.ticker}
                      className={`flex items-start justify-between gap-4 p-4 rounded-lg border ${
                        isSelected
                          ? "bg-secondary/70 border-primary/40"
                          : "bg-secondary/50 border-transparent"
                      }`}
                    >
                      <div>
                        <p className="font-medium">{market.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                            {market.platform.toUpperCase()}
                          </span>
                          <span>{market.ticker}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{market.reasoning}</p>
                        {priceYesNormalized !== null ? (
                          <p className="text-xs text-muted-foreground">
                            YES price: {(priceYesNormalized * 100).toFixed(1)}% (
                            {formatCurrency(priceYesNormalized)} per contract)
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">YES price unavailable</p>
                        )}
                        {isSelected ? (
                          <div className="mt-2 text-xs text-muted-foreground space-y-1">
                            <p>
                              Assumed loss if event:{" "}
                              {assumedLossIfEvent !== null
                                ? formatCurrency(assumedLossIfEvent)
                                : "-"}
                            </p>
                            {quote ? (
                              <>
                                <p>
                                  Contracts: {quote.contracts_to_buy} · Cost:{" "}
                                  {formatCurrency(quote.total_cost)}
                                </p>
                                <p>
                                  Profit if event: {formatCurrency(quote.profit_if_event)} · If no
                                  event: {formatCurrency(quote.profit_if_no_event)}
                                </p>
                                <p>
                                  Risk managed: {(quote.coverage_achieved * 100).toFixed(1)}% of
                                  the assumed loss
                                </p>
                              </>
                            ) : (
                              <p>Enter expected profit to estimate hedge impact.</p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedMarketId(market.ticker)}
                            >
                              Calculate this hedge
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">
                          Overall {formatScore(market.overall_score)}
                        </p>
                        <p>Relevance: {formatScore(market.relevance_score)}</p>
                        <p>Hedging: {formatScore(market.hedging_utility_score)}</p>
                        <p>Timing: {formatScore(market.timing_score)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No scored markets returned. Try a broader description or a different risk focus.
              </p>
            )}
          </motion.section>

          <details className="hedgi-card p-6 mb-8">
            <summary className="cursor-pointer font-medium">Debug</summary>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>Keywords: {snapshot.keywords.join(", ") || "-"}</p>
              <p>Match count: {snapshot.matches.length}</p>
              <p>Score count: {snapshot.scoredMarkets.length}</p>
              <p>
                Gemini inputs:{" "}
                {snapshot.inputs
                  ? JSON.stringify(snapshot.inputs)
                  : "none"}
              </p>
            </div>
          </details>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="hedgi-card p-8 text-center hedgi-shadow-glow"
          >
            <h2 className="text-2xl font-bold mb-3">Track this risk over time</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Create a free Hedgi account to monitor these risks, receive alerts when conditions change,
              and explore protection options.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button variant="hero" size="xl" asChild>
                <Link to="/signup" className="gap-2">
                  Create Free Account
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/login">Sign In</Link>
              </Button>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}
