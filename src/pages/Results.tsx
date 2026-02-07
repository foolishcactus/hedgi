import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Building2,
  AlertTriangle,
  TrendingDown,
  Shield,
  Signal,
  ArrowRight,
  CheckCircle,
  XCircle,
  ChevronRight,
} from "lucide-react";

// Mock data - in production this would come from AI analysis
const generateMockResults = (business: string) => {
  const isAgricultural = business.toLowerCase().includes("farm") || business.toLowerCase().includes("crop");
  const isWinterBusiness = business.toLowerCase().includes("ski") || business.toLowerCase().includes("snow");
  const isEnergySensitive = business.toLowerCase().includes("gas") || business.toLowerCase().includes("fuel") || business.toLowerCase().includes("solar");

  if (isAgricultural) {
    return {
      summary: "Your agricultural operation appears to be primarily exposed to weather volatility and commodity price fluctuations. As a grain producer in the Midwest, your revenue is closely tied to growing conditions and market prices for corn and soybeans.",
      risks: [
        { name: "Drought Conditions", severity: "high", impact: "Severe yield reduction, potential crop loss" },
        { name: "Commodity Price Volatility", severity: "high", impact: "Revenue fluctuates with market prices" },
        { name: "Extreme Weather Events", severity: "medium", impact: "Flooding, hail, early frost damage" },
        { name: "Input Cost Increases", severity: "medium", impact: "Fertilizer, seed, and fuel cost spikes" },
      ],
      lossScenario: {
        revenueAtRisk: "$180,000",
        worstCase: "$320,000",
        likelihood: "15-25%",
        timeframe: "Growing season",
      },
      hedging: {
        unprotected: "$320,000 potential loss",
        protected: "$85,000 maximum exposure",
        reduction: "73%",
      },
      signals: [
        { name: "NOAA Drought Outlook", strength: "strong", description: "Direct weather prediction data" },
        { name: "CBOT Corn Futures", strength: "strong", description: "Market price expectations" },
        { name: "La Niña Probability", strength: "partial", description: "Seasonal weather patterns" },
      ],
    };
  }

  if (isWinterBusiness) {
    return {
      summary: "Your winter recreation business is highly sensitive to temperature and snowfall patterns. Climate variability poses significant operational risk, with warm winters directly impacting visitor numbers and season length.",
      risks: [
        { name: "Below-Average Snowfall", severity: "high", impact: "Shortened season, reduced visitors" },
        { name: "Warm Temperature Anomalies", severity: "high", impact: "Poor snow conditions, early melt" },
        { name: "Energy Costs", severity: "medium", impact: "Snowmaking and operations costs" },
        { name: "Economic Downturn", severity: "low", impact: "Discretionary spending reduction" },
      ],
      lossScenario: {
        revenueAtRisk: "$450,000",
        worstCase: "$1,200,000",
        likelihood: "20-30%",
        timeframe: "Winter season",
      },
      hedging: {
        unprotected: "$1,200,000 potential loss",
        protected: "$280,000 maximum exposure",
        reduction: "77%",
      },
      signals: [
        { name: "NOAA Winter Outlook", strength: "strong", description: "Seasonal temperature forecasts" },
        { name: "El Niño/La Niña Index", strength: "strong", description: "Winter weather patterns" },
        { name: "Regional Snowpack Data", strength: "partial", description: "Historical comparison data" },
      ],
    };
  }

  // Default for other businesses
  return {
    summary: "Based on your business description, we've identified several external factors that could impact your revenue. Your operation appears sensitive to supply chain dynamics, energy costs, and broader economic conditions.",
    risks: [
      { name: "Supply Chain Disruption", severity: "medium", impact: "Inventory shortages, delivery delays" },
      { name: "Energy Price Volatility", severity: "medium", impact: "Operating cost increases" },
      { name: "Interest Rate Changes", severity: "low", impact: "Customer financing costs" },
      { name: "Economic Slowdown", severity: "medium", impact: "Reduced customer demand" },
    ],
    lossScenario: {
      revenueAtRisk: "$75,000",
      worstCase: "$150,000",
      likelihood: "10-20%",
      timeframe: "12 months",
    },
    hedging: {
      unprotected: "$150,000 potential loss",
      protected: "$45,000 maximum exposure",
      reduction: "70%",
    },
    signals: [
      { name: "Consumer Sentiment Index", strength: "partial", description: "Demand indicator" },
      { name: "WTI Crude Futures", strength: "strong", description: "Energy cost projection" },
      { name: "Fed Rate Expectations", strength: "strong", description: "Interest rate outlook" },
    ],
  };
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "high": return "text-destructive bg-destructive/10";
    case "medium": return "text-warning bg-warning/10";
    case "low": return "text-success bg-success/10";
    default: return "text-muted-foreground bg-muted";
  }
};

const getSignalColor = (strength: string) => {
  switch (strength) {
    case "strong": return "text-success";
    case "partial": return "text-warning";
    case "weak": return "text-muted-foreground";
    default: return "text-muted-foreground";
  }
};

export default function Results() {
  const navigate = useNavigate();
  const [business, setBusiness] = useState("");
  const [results, setResults] = useState<ReturnType<typeof generateMockResults> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getErrorMessage = (code: string, status?: number) => {
    switch (code) {
      case "missing_api_key":
        return "Missing Gemini API key. Add GEMINI_API_KEY to your .env and restart the API server.";
      case "missing_business":
        return "No business description was sent. Please go back and try again.";
      case "invalid_json":
        return "The AI service returned invalid JSON. Check the API server logs and try again.";
      case "empty_response":
        return "The AI service returned an empty response. Please try again.";
      case "gemini_request_failed":
        return "The AI request failed. Check the API server logs and try again.";
      default:
        if (status === 404) {
          return "API server not reachable. Ensure npm run dev:api is running and the Vite proxy is configured.";
        }
        if (status && status >= 500) {
          return "The AI server encountered an error. Please try again.";
        }
        return "We could not reach the AI service. Please check the API server and try again.";
    }
  };

  useEffect(() => {
    const storedBusiness = sessionStorage.getItem("hedgi_business");
    if (!storedBusiness) {
      navigate("/");
      return;
    }
    setBusiness(storedBusiness);
    setError(null);
    setIsLoading(true);

    const controller = new AbortController();

    const runAnalysis = async () => {
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ business: storedBusiness }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let code = "analysis_failed";
          let details = "";
          try {
            const payload = (await response.json()) as { error?: string; details?: string };
            if (payload?.error) code = payload.error;
            if (payload?.details) details = payload.details;
          } catch (err) {
            // Ignore JSON parsing errors and fall back to default message.
          }
          const message = getErrorMessage(code, response.status);
          const fullMessage = details ? `${message} (${details})` : message;
          throw { message: fullMessage };
        }

        const data = (await response.json()) as ReturnType<typeof generateMockResults>;
        setResults(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = typeof err === "object" && err && "message" in err ? String(err.message) : null;
        setError(message || "We could not reach the AI service. Please check the API server and try again.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    runAnalysis();
    return () => controller.abort();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 pb-20 px-6">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center">
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
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 pb-20 px-6">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-2">Analysis failed</h2>
              <p className="text-muted-foreground mb-6">{error}</p>
              <Button variant="outline" size="lg" onClick={() => navigate("/")}>
                Back to Home
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!results) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-28 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          {/* Section 1: Business Summary */}
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
              <div>
                <h2 className="text-lg font-semibold mb-2">Business Summary</h2>
                <p className="text-muted-foreground">{results.summary}</p>
              </div>
            </div>
          </motion.section>

          {/* Section 2: Key External Risks */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="hedgi-card p-6 mb-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold">Key External Risks</h2>
            </div>
            <div className="space-y-3">
              {results.risks.map((risk, index) => (
                <motion.div
                  key={risk.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + index * 0.1 }}
                  className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${getSeverityColor(risk.severity)}`}>
                      {risk.severity}
                    </span>
                    <span className="font-medium">{risk.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{risk.impact}</span>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Section 3: Loss Scenarios */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hedgi-card p-6 mb-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-warning" />
              </div>
              <h2 className="text-lg font-semibold">Loss Scenarios</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-secondary/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-1">Revenue at Risk</p>
                <p className="text-2xl font-bold text-foreground">{results.lossScenario.revenueAtRisk}</p>
              </div>
              <div className="p-4 bg-destructive/10 rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-1">Worst-Case Loss</p>
                <p className="text-2xl font-bold text-destructive">{results.lossScenario.worstCase}</p>
              </div>
              <div className="p-4 bg-secondary/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-1">Likelihood</p>
                <p className="text-2xl font-bold text-foreground">{results.lossScenario.likelihood}</p>
              </div>
              <div className="p-4 bg-secondary/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-1">Timeframe</p>
                <p className="text-2xl font-bold text-foreground">{results.lossScenario.timeframe}</p>
              </div>
            </div>
          </motion.section>

          {/* Section 4: With vs Without Hedging */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="hedgi-card p-6 mb-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-success" />
              </div>
              <h2 className="text-lg font-semibold">With vs Without Protection</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-5 border border-destructive/30 bg-destructive/5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="w-5 h-5 text-destructive" />
                  <span className="font-medium">Without Protection</span>
                </div>
                <p className="text-2xl font-bold text-destructive">{results.hedging.unprotected}</p>
              </div>
              <div className="p-5 border border-success/30 bg-success/5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-success" />
                  <span className="font-medium">With Hedgi Protection</span>
                </div>
                <p className="text-2xl font-bold text-success">{results.hedging.protected}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {results.hedging.reduction} risk reduction
                </p>
              </div>
            </div>
          </motion.section>

          {/* Section 5: Market Signal Explanation */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="hedgi-card p-6 mb-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Signal className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Market Signals</h2>
                <p className="text-sm text-muted-foreground">
                  Hedgi aggregates public event-based signals to track your risk exposure
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {results.signals.map((signal, index) => (
                <div
                  key={signal.name}
                  className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Signal className={`w-4 h-4 ${getSignalColor(signal.strength)}`} />
                    <div>
                      <span className="font-medium">{signal.name}</span>
                      <p className="text-sm text-muted-foreground">{signal.description}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium capitalize ${getSignalColor(signal.strength)}`}>
                    {signal.strength} proxy
                  </span>
                </div>
              ))}
            </div>
          </motion.section>

          {/* CTA Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
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
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/login">
                  Sign In
                </Link>
              </Button>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}
