import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { runHedgiSnapshot, type SnapshotResult } from "@/lib/pipeline/snapshotPipeline";

const SAMPLE_INPUT =
  "I run a small orange farm in central Florida. Revenue is highest in Sep-Nov. Hurricanes and heavy rain can wipe out yields.";

export default function Dev() {
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await runHedgiSnapshot(SAMPLE_INPUT);
      setSnapshot(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to run snapshot.";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-4xl space-y-6">
          <div className="hedgi-card p-6 space-y-4">
            <h1 className="text-2xl font-semibold">Dev Snapshot Runner</h1>
            <p className="text-sm text-muted-foreground">{SAMPLE_INPUT}</p>
            <Button onClick={handleRun} disabled={isRunning}>
              {isRunning ? "Running..." : "Run Snapshot"}
            </Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          {snapshot ? (
            <div className="hedgi-card p-6 space-y-4">
              <h2 className="text-lg font-semibold">Top 10 Scored Markets</h2>
              <pre className="text-xs whitespace-pre-wrap bg-secondary/40 p-4 rounded-lg">
                {JSON.stringify(snapshot.scoredMarkets.slice(0, 10), null, 2)}
              </pre>
              <h2 className="text-lg font-semibold">Full Snapshot</h2>
              <pre className="text-xs whitespace-pre-wrap bg-secondary/40 p-4 rounded-lg">
                {JSON.stringify(snapshot, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
