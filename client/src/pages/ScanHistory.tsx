import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Loader2, Radio } from "lucide-react";
import type { ScanRun } from "@shared/schema";

const sourceColors: Record<string, string> = {
  craigslist: "bg-orange-500/20 text-orange-400",
  reddit: "bg-red-500/20 text-red-400",
  nextdoor: "bg-green-500/20 text-green-400",
  facebook: "bg-blue-500/20 text-blue-400",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function duration(start: string, end?: string | null) {
  if (!end) return "...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ScanHistory() {
  const { data: runs, isLoading } = useQuery<ScanRun[]>({
    queryKey: ["/api/scan-runs"],
    refetchInterval: 5000,
  });

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Scan History</h1>
        <p className="text-sm text-muted-foreground mt-0.5">All automated and manual scan runs</p>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : runs?.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground text-sm">
              No scans yet. Hit "Scan Now" in the sidebar to get started.
            </CardContent>
          </Card>
        ) : (
          runs?.map(run => (
            <Card key={run.id} data-testid={`card-run-${run.id}`}>
              <CardContent className="px-4 py-3">
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    {run.status === "running" && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                    {run.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    {run.status === "failed" && <XCircle className="w-4 h-4 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceColors[run.source] || "bg-muted text-muted-foreground"}`}>
                        {run.source}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(run.startedAt)}</span>
                      <span className="text-xs text-muted-foreground">· {duration(run.startedAt, run.finishedAt)}</span>
                    </div>
                    {run.errorMessage && (
                      <p className="text-xs text-red-400 mt-0.5 truncate">{run.errorMessage}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {run.status === "success" && (
                      <span className="text-sm font-semibold text-green-400">+{run.leadsFound}</span>
                    )}
                    {run.status === "running" && (
                      <span className="text-xs text-muted-foreground">scanning...</span>
                    )}
                    {run.status === "failed" && (
                      <span className="text-xs text-red-400">failed</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
