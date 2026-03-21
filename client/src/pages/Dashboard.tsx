import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Flame, CheckCircle2, XCircle, MessageSquare,
  Wrench, Leaf, Droplets, Wind, HardHat, Home, Sparkles, Radio
} from "lucide-react";
import type { Lead, ScanRun } from "@shared/schema";

const categoryIcons: Record<string, any> = {
  cleaning: Sparkles,
  landscaping: Leaf,
  plumbing: Droplets,
  hvac: Wind,
  handyman: Wrench,
  remodeling: HardHat,
  other: Home,
};

const sourceColors: Record<string, string> = {
  craigslist: "bg-orange-500/20 text-orange-400",
  reddit: "bg-red-500/20 text-red-400",
  nextdoor: "bg-green-500/20 text-green-400",
  facebook: "bg-blue-500/20 text-blue-400",
};

const priorityBadge: Record<string, string> = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/stats"],
    refetchInterval: 10000,
  });

  const { data: leads } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    refetchInterval: 10000,
  });

  const { data: scanRuns } = useQuery<ScanRun[]>({
    queryKey: ["/api/scan-runs"],
    refetchInterval: 10000,
  });

  const newLeads = leads?.filter(l => l.status === "new").slice(0, 8) || [];
  const recentRun = scanRuns?.[0];

  const kpis = [
    { label: "New Leads", value: stats?.byStatus?.new || 0, icon: Flame, color: "text-orange-400" },
    { label: "Contacted", value: stats?.byStatus?.contacted || 0, icon: MessageSquare, color: "text-blue-400" },
    { label: "Won", value: stats?.byStatus?.won || 0, icon: CheckCircle2, color: "text-green-400" },
    { label: "Lost", value: stats?.byStatus?.lost || 0, icon: XCircle, color: "text-zinc-400" },
  ];

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {recentRun ? (
            <span className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-green-400" />
              Last scan: {timeAgo(recentRun.startedAt)} · {recentRun.leadsFound} leads found
            </span>
          ) : "No scans yet"}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} data-testid={`card-kpi-${label.toLowerCase().replace(" ", "-")}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground font-medium">{label}</span>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-3xl font-bold">{value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent new leads */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">New Leads</h2>
            <Link href="/leads">
              <a className="text-xs text-primary hover:underline">View all →</a>
            </Link>
          </div>
          {newLeads.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                No new leads yet. Run a scan to discover opportunities.
              </CardContent>
            </Card>
          ) : (
            newLeads.map(lead => {
              const Icon = categoryIcons[lead.category] || Home;
              return (
                <Link href={`/leads/${lead.id}`} key={lead.id}>
                  <a data-testid={`card-lead-${lead.id}`} className="block">
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                              <p className="text-sm font-medium leading-tight line-clamp-2">{lead.title}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceColors[lead.source] || "bg-muted text-muted-foreground"}`}>
                                {lead.source}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${priorityBadge[lead.priority]}`}>
                                {lead.priority}
                              </span>
                              {lead.location && (
                                <span className="text-[10px] text-muted-foreground">{lead.location}</span>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(lead.discoveredAt)}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                </Link>
              );
            })
          )}
        </div>

        {/* By category + by source */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By Category</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {Object.entries(stats?.byCategory || {}).sort((a: any, b: any) => b[1] - a[1]).map(([cat, count]: any) => {
                const Icon = categoryIcons[cat] || Home;
                const total = stats?.total || 1;
                return (
                  <div key={cat} className="flex items-center gap-2" data-testid={`stat-category-${cat}`}>
                    <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs capitalize flex-1">{cat}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium w-5 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By Source</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {Object.entries(stats?.bySource || {}).sort((a: any, b: any) => b[1] - a[1]).map(([src, count]: any) => (
                <div key={src} className="flex items-center justify-between" data-testid={`stat-source-${src}`}>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${sourceColors[src] || "bg-muted text-muted-foreground"}`}>
                    {src}
                  </span>
                  <span className="text-xs font-semibold">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
