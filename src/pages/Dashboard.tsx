import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Building2,
  Bell,
  Settings,
  LogOut,
  Plus,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

// Mock dashboard data
const mockRiskData = {
  overallRisk: 67,
  trend: "increasing" as const,
  changePercent: 12,
  exposedRevenue: "$245,000",
  protectedRevenue: "$180,000",
  coverageRatio: 73,
};

const mockActiveRisks = [
  {
    id: 1,
    name: "Drought Conditions",
    severity: "high",
    trend: "increasing",
    currentLevel: 78,
    signal: "NOAA predicts below-average rainfall",
  },
  {
    id: 2,
    name: "Corn Price Volatility",
    severity: "medium",
    trend: "stable",
    currentLevel: 45,
    signal: "CBOT futures showing stability",
  },
  {
    id: 3,
    name: "Input Cost Inflation",
    severity: "medium",
    trend: "decreasing",
    currentLevel: 52,
    signal: "Fertilizer prices easing",
  },
];

const mockAlerts = [
  {
    id: 1,
    type: "warning",
    title: "Drought risk elevated",
    description: "NOAA updated 30-day outlook shows increased drought probability",
    time: "2 hours ago",
  },
  {
    id: 2,
    type: "info",
    title: "Protection opportunity",
    description: "New weather derivative available for your region",
    time: "1 day ago",
  },
];

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "high": return "text-destructive bg-destructive/10";
    case "medium": return "text-warning bg-warning/10";
    case "low": return "text-success bg-success/10";
    default: return "text-muted-foreground bg-muted";
  }
};

const getRiskLevelColor = (level: number) => {
  if (level >= 70) return "bg-destructive";
  if (level >= 40) return "bg-warning";
  return "bg-success";
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email: string; businessName?: string } | null>(null);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("hedgi_user");
    if (!storedUser) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("hedgi_user");
    navigate("/");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border p-6 hidden lg:block">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 hedgi-gradient rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold">Hedgi</span>
        </div>

        <nav className="space-y-2">
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 text-primary font-medium"
          >
            <Activity className="w-5 h-5" />
            Risk Monitor
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Building2 className="w-5 h-5" />
            Business Profile
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Bell className="w-5 h-5" />
            Alerts
            <span className="ml-auto w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
              2
            </span>
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Shield className="w-5 h-5" />
            Protection
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Settings className="w-5 h-5" />
            Settings
          </a>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="p-4 bg-secondary rounded-xl mb-4">
            <p className="text-sm font-medium">{user.businessName || "My Business"}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-6 lg:p-8">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 hedgi-gradient rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold">Hedgi</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl lg:text-3xl font-bold mb-2">Risk Monitor</h1>
          <p className="text-muted-foreground">
            Track how external factors are affecting your business risk exposure
          </p>
        </motion.div>

        {/* Risk Overview Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {/* Overall Risk */}
          <div className="hedgi-card p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">Overall Risk</span>
              <div className={`flex items-center gap-1 text-sm ${mockRiskData.trend === "increasing" ? "text-destructive" : "text-success"}`}>
                {mockRiskData.trend === "increasing" ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                {mockRiskData.changePercent}%
              </div>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold">{mockRiskData.overallRisk}</span>
              <span className="text-muted-foreground mb-1">/100</span>
            </div>
            <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full ${getRiskLevelColor(mockRiskData.overallRisk)} transition-all duration-500`}
                style={{ width: `${mockRiskData.overallRisk}%` }}
              />
            </div>
          </div>

          {/* Exposed Revenue */}
          <div className="hedgi-card p-6">
            <span className="text-sm font-medium text-muted-foreground">Revenue at Risk</span>
            <p className="text-3xl font-bold mt-3 text-foreground">{mockRiskData.exposedRevenue}</p>
            <p className="text-sm text-muted-foreground mt-1">In current scenario</p>
          </div>

          {/* Protected Revenue */}
          <div className="hedgi-card p-6">
            <span className="text-sm font-medium text-muted-foreground">Protected Revenue</span>
            <p className="text-3xl font-bold mt-3 text-success">{mockRiskData.protectedRevenue}</p>
            <p className="text-sm text-muted-foreground mt-1">With active hedges</p>
          </div>

          {/* Coverage */}
          <div className="hedgi-card p-6">
            <span className="text-sm font-medium text-muted-foreground">Coverage Ratio</span>
            <p className="text-3xl font-bold mt-3 text-foreground">{mockRiskData.coverageRatio}%</p>
            <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-500"
                style={{ width: `${mockRiskData.coverageRatio}%` }}
              />
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Active Risks */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <div className="hedgi-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Active Risks</h2>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Risk
                </Button>
              </div>

              <div className="space-y-4">
                {mockActiveRisks.map((risk) => (
                  <div
                    key={risk.id}
                    className="p-4 bg-secondary/50 rounded-xl hover:bg-secondary/80 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${getSeverityColor(risk.severity)}`}>
                          {risk.severity}
                        </span>
                        <span className="font-medium">{risk.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {risk.trend === "increasing" && (
                          <TrendingUp className="w-4 h-4 text-destructive" />
                        )}
                        {risk.trend === "decreasing" && (
                          <TrendingDown className="w-4 h-4 text-success" />
                        )}
                        {risk.trend === "stable" && (
                          <Activity className="w-4 h-4 text-muted-foreground" />
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getRiskLevelColor(risk.currentLevel)} transition-all duration-500`}
                            style={{ width: `${risk.currentLevel}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{risk.currentLevel}%</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{risk.signal}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="hedgi-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Recent Alerts</h2>
                <Button variant="ghost" size="sm">
                  View all
                </Button>
              </div>

              <div className="space-y-4">
                {mockAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 border border-border rounded-xl"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        alert.type === "warning" ? "bg-warning/10" : "bg-primary/10"
                      }`}>
                        {alert.type === "warning" ? (
                          <AlertTriangle className="w-4 h-4 text-warning" />
                        ) : (
                          <Bell className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{alert.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {alert.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">{alert.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="hedgi-card p-6 mt-6">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-3">
                  <Building2 className="w-4 h-4" />
                  Update Business Profile
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3">
                  <Shield className="w-4 h-4" />
                  Explore Protection
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3">
                  <Bell className="w-4 h-4" />
                  Configure Alerts
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
