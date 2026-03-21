import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Trash2, ExternalLink, Wrench, Leaf, Droplets, Wind, HardHat, Home, Sparkles
} from "lucide-react";
import type { Lead } from "@shared/schema";

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

const statusColors: Record<string, string> = {
  new: "bg-primary/20 text-primary",
  contacted: "bg-blue-500/20 text-blue-400",
  won: "bg-green-500/20 text-green-400",
  lost: "bg-zinc-500/20 text-zinc-400",
};

const priorityDot: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-500",
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

export default function Leads() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads", statusFilter, categoryFilter, sourceFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (search) params.set("search", search);
      const res = await apiRequest("GET", `/api/leads?${params}`);
      return res.json();
    },
    refetchInterval: 15000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/leads/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leads"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Lead deleted" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/leads/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leads"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{leads?.length || 0} results</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-testid="input-search"
            placeholder="Search leads..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger data-testid="select-status" className="w-32 h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger data-testid="select-category" className="w-36 h-9 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="cleaning">Cleaning</SelectItem>
            <SelectItem value="landscaping">Landscaping</SelectItem>
            <SelectItem value="plumbing">Plumbing</SelectItem>
            <SelectItem value="hvac">HVAC</SelectItem>
            <SelectItem value="handyman">Handyman</SelectItem>
            <SelectItem value="remodeling">Remodeling</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger data-testid="select-source" className="w-36 h-9 text-xs">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="craigslist">Craigslist</SelectItem>
            <SelectItem value="reddit">Reddit</SelectItem>
            <SelectItem value="nextdoor">Nextdoor</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Leads table */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))
        ) : leads?.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground text-sm">
              No leads match your filters.
            </CardContent>
          </Card>
        ) : (
          leads?.map(lead => {
            const Icon = categoryIcons[lead.category] || Home;
            return (
              <Card key={lead.id} data-testid={`card-lead-${lead.id}`} className="hover:border-border/80 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${priorityDot[lead.priority]}`} />
                        <Link href={`/leads/${lead.id}`}>
                          <a className="text-sm font-medium hover:text-primary transition-colors line-clamp-1">
                            {lead.title}
                          </a>
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceColors[lead.source] || "bg-muted text-muted-foreground"}`}>
                          {lead.source}
                        </span>
                        <span className="text-[10px] text-muted-foreground capitalize">{lead.category}</span>
                        {lead.location && <span className="text-[10px] text-muted-foreground">{lead.location}</span>}
                        <span className="text-[10px] text-muted-foreground">{timeAgo(lead.discoveredAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={lead.status}
                        onValueChange={val => statusMutation.mutate({ id: lead.id, status: val })}
                      >
                        <SelectTrigger data-testid={`select-lead-status-${lead.id}`} className="w-28 h-7 text-xs border-0 bg-transparent p-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${statusColors[lead.status]}`}>
                            {lead.status}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="won">Won</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>

                      {lead.sourceUrl && (
                        <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-source-${lead.id}`}>
                          <Button variant="ghost" size="icon" className="w-7 h-7">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-${lead.id}`}
                        onClick={() => deleteMutation.mutate(lead.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
