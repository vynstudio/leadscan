import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ExternalLink, Save, Trash2 } from "lucide-react";
import type { Lead } from "@shared/schema";

const statusColors: Record<string, string> = {
  new: "bg-primary/20 text-primary border-primary/30",
  contacted: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  won: "bg-green-500/20 text-green-400 border-green-500/30",
  lost: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const sourceColors: Record<string, string> = {
  craigslist: "bg-orange-500/20 text-orange-400",
  reddit: "bg-red-500/20 text-red-400",
  nextdoor: "bg-green-500/20 text-green-400",
  facebook: "bg-blue-500/20 text-blue-400",
};

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: lead, isLoading } = useQuery<Lead>({
    queryKey: ["/api/leads", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/${id}`);
      return res.json();
    },
  });

  const [contactName, setContactName] = useState(lead?.contactName || "");
  const [contactEmail, setContactEmail] = useState(lead?.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(lead?.contactPhone || "");
  const [notes, setNotes] = useState(lead?.notes || "");

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Lead>) => apiRequest("PATCH", `/api/leads/${id}`, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/leads/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leads"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      navigate("/leads");
    },
  });

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">Loading...</div>;
  if (!lead) return <div className="p-8 text-muted-foreground text-sm">Lead not found.</div>;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/leads")} data-testid="button-back" className="w-8 h-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold leading-tight line-clamp-2">{lead.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {lead.sourceUrl && (
            <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid="button-view-source">
                <ExternalLink className="w-3 h-3" /> View Source
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground hover:text-destructive"
            onClick={() => deleteMutation.mutate()}
            data-testid="button-delete"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${sourceColors[lead.source] || "bg-muted text-muted-foreground"}`}>
          {lead.source}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${statusColors[lead.status]}`}>
          {lead.status}
        </span>
        <span className="text-xs text-muted-foreground capitalize">{lead.category}</span>
        {lead.location && <span className="text-xs text-muted-foreground">{lead.location}</span>}
        <span className="text-xs text-muted-foreground">
          priority: <span className="font-medium">{lead.priority}</span>
        </span>
      </div>

      {/* Description */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Post</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-sm leading-relaxed">{lead.description}</p>
        </CardContent>
      </Card>

      {/* Status + Priority */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead Status</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={lead.status}
              onValueChange={val => updateMutation.mutate({ status: val })}
            >
              <SelectTrigger data-testid="select-status" className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priority</Label>
            <Select
              value={lead.priority}
              onValueChange={val => updateMutation.mutate({ priority: val })}
            >
              <SelectTrigger data-testid="select-priority" className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contact info */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Info</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                data-testid="input-contact-name"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Contact name"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                data-testid="input-contact-email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="email@example.com"
                className="h-9 text-sm"
                type="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                data-testid="input-contact-phone"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Textarea
            data-testid="textarea-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes about this lead..."
            className="text-sm min-h-28 resize-none"
          />
          <Button
            size="sm"
            className="gap-1.5 h-8 text-xs"
            data-testid="button-save"
            onClick={() => updateMutation.mutate({ contactName, contactEmail, contactPhone, notes })}
            disabled={updateMutation.isPending}
          >
            <Save className="w-3 h-3" /> Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
