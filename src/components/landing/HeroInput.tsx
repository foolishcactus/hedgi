import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const exampleBusinesses = [
  "I run a small farm in Iowa growing corn and soybeans. Drought and commodity prices significantly affect my revenue.",
  "I own a ski resort in Colorado. Warm winters and low snowfall can devastate our business.",
  "I operate a food truck in Austin. High gas prices and supply chain issues impact my margins.",
  "I manage a small solar installation company. Interest rates affect customer financing options.",
];

export function HeroInput() {
  const [businessDescription, setBusinessDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const navigate = useNavigate();

  const handleAnalyze = async () => {
    if (!businessDescription.trim()) return;
    
    setIsAnalyzing(true);
    
    // Store the business description and navigate to results
    sessionStorage.setItem("hedgi_business", businessDescription);
    navigate("/results");
  };

  const handleExampleClick = (example: string) => {
    setBusinessDescription(example);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="w-full max-w-3xl mx-auto"
    >
      <div className="hedgi-card p-2">
        <div className="relative">
          <textarea
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="Describe your business: industry, location, what affects your revenue..."
            className="w-full min-h-[140px] p-6 text-lg bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/60"
            disabled={isAnalyzing}
          />
          <div className="flex items-center justify-between p-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="w-4 h-4" />
              <span>AI-powered risk analysis</span>
            </div>
            <Button
              variant="hero"
              size="lg"
              onClick={handleAnalyze}
              disabled={!businessDescription.trim() || isAnalyzing}
              className="gap-2"
            >
              {isAnalyzing ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-5 h-5" />
                  </motion.div>
                  Analyzing...
                </>
              ) : (
                <>
                  Analyze My Risk
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8"
      >
        <p className="text-sm text-muted-foreground text-center mb-4">
          Try an example:
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {exampleBusinesses.map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              className="text-xs px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors truncate max-w-[200px]"
            >
              {example.split(".")[0]}...
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
