import { Link, useLocation } from "wouter";
import { useTheme } from "@/components/ThemeProvider";
import {
  LayoutDashboard, Search, History, Settings, Zap, Moon, Sun, Radio, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import PerplexityAttribution from "@/components/PerplexityAttribution";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Search },
  { href: "/scan-history", label: "Scan History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children, onLogout }: { children: React.ReactNode; onLogout?: () => void }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/stats"],
    refetchInterval: 10000,
  });

  const { data: scanStatus } = useQuery<any>({
    queryKey: ["/api/scan/status"],
    refetchInterval: 3000,
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scan"),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries(), 5000);
    },
  });

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onLogout?.();
  };

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/stats"],
    refetchInterval: 10000,
  });

  const { data: scanStatus } = useQuery<any>({
    queryKey: ["/api/scan/status"],
    refetchInterval: 3000,
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scan"),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries(), 5000);
    },
  });

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col border-r border-border bg-card shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-primary-foreground" aria-label="LeadScan Logo">
                <path d="M3 9.5L12 4L21 9.5V20H3V9.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                <path d="M9 20V14H15V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="2" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">HomeLeads Pro</div>
              <div className="text-[10px] text-muted-foreground">Home Services CRM</div>
            </div>
          </div>
        </div>

        {/* Scan button */}
        <div className="px-4 py-3 border-b border-border">
          <Button
            data-testid="button-scan-now"
            className="w-full h-9 text-xs font-semibold gap-2"
            onClick={() => scanMutation.mutate()}
            disabled={scanStatus?.scanning || scanMutation.isPending}
          >
            {scanStatus?.scanning ? (
              <><Radio className="w-3.5 h-3.5 animate-pulse" /> Scanning...</>
            ) : (
              <><Zap className="w-3.5 h-3.5" /> Scan Now</>
            )}
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link href={href} key={href}>
                <a
                  data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                  {label === "Leads" && stats?.byStatus?.new > 0 && (
                    <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
                      {stats.byStatus.new}
                    </Badge>
                  )}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-border flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground">
            {stats?.total || 0} total leads
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={toggle} data-testid="button-theme-toggle">
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={handleLogout} title="Sign out">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
        <PerplexityAttribution />
      </main>
    </div>
  );
}
