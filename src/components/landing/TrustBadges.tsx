import { motion } from "framer-motion";
import { Shield, Lock, TrendingUp, AlertTriangle } from "lucide-react";

const badges = [
  {
    icon: Shield,
    title: "Risk Protection",
    description: "Identify threats before they impact revenue",
  },
  {
    icon: TrendingUp,
    title: "Market Signals",
    description: "Real-time data from public prediction markets",
  },
  {
    icon: AlertTriangle,
    title: "Early Warnings",
    description: "Get alerts when risk levels change",
  },
  {
    icon: Lock,
    title: "Secure & Private",
    description: "Your business data stays confidential",
  },
];

export function TrustBadges() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.8 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto mt-20"
    >
      {badges.map((badge, index) => (
        <motion.div
          key={badge.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.9 + index * 0.1 }}
          className="text-center"
        >
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-primary/10 flex items-center justify-center">
            <badge.icon className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-sm text-foreground mb-1">
            {badge.title}
          </h3>
          <p className="text-xs text-muted-foreground">{badge.description}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
