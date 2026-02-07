import { Header } from "@/components/layout/Header";
import { HeroInput } from "@/components/landing/HeroInput";
import { TrustBadges } from "@/components/landing/TrustBadges";
import { motion } from "framer-motion";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-32 pb-20 px-6">
        <div className="container mx-auto">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Risk intelligence for small businesses
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Describe your business.
              <br />
              <span className="hedgi-gradient-text">Hedgi finds your risks.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Hedgi uses public event data to help small businesses understand and 
              manage external risk — from weather to commodity prices to macro events.
            </p>
          </motion.div>

          {/* Main Input */}
          <HeroInput />

          {/* Trust Badges */}
          <TrustBadges />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>© 2024 Hedgi. Risk intelligence for small businesses.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
