import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Info } from "lucide-react";

const SOURCES = ["craigslist", "yelp", "nextdoor", "facebook"];

export default function Settings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: settings } = useQuery<any>({
    queryKey: ["/api/settings"],
  });

  const [scanInterval, setScanInterval] = useState("5");
  const [city, setCity] = useState("miami");
  const [enabledSources, setEnabledSources] = useState<string[]>(["craigslist", "yelp", "nextdoor", "facebook"]);

  useEffect(() => {
    if (settings) {
      setScanInterval(settings.scanInterval || "5");
      setCity(settings.city || "miami");
      setEnabledSources(settings.enabledSources || SOURCES);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings", {
      scanInterval: Number(scanInterval),
      city,
      enabledSources,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved", description: "Scanner will use new settings on next run." });
    },
  });

  const toggleSource = (src: string) => {
    setEnabledSources(prev =>
      prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]
    );
  };

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your scanner and CRM preferences</p>
      </div>

      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm">Scanner Configuration</CardTitle>
          <CardDescription className="text-xs">Controls how often and where leads are scanned</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Scan Interval (minutes)</Label>
            <Input
              data-testid="input-scan-interval"
              type="number"
              min={1}
              max={60}
              value={scanInterval}
              onChange={e => setScanInterval(e.target.value)}
              className="h-9 text-sm w-32"
            />
            <p className="text-[11px] text-muted-foreground">Minimum: 1 minute. Recommended: 5 minutes.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Target City (for Craigslist)</Label>
            <Input
              data-testid="input-city"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. miami, newyork, chicago"
              className="h-9 text-sm w-48"
            />
            <p className="text-[11px] text-muted-foreground">Use the city subdomain from craigslist.org</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Active Sources</Label>
            <div className="grid grid-cols-2 gap-2">
              {SOURCES.map(src => (
                <div key={src} className="flex items-center gap-2" data-testid={`checkbox-source-${src}`}>
                  <Checkbox
                    id={src}
                    checked={enabledSources.includes(src)}
                    onCheckedChange={() => toggleSource(src)}
                  />
                  <label htmlFor={src} className="text-sm capitalize cursor-pointer">{src}</label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm">Platform Notes</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span><strong className="text-foreground">Craigslist</strong> — scans household services & services wanted sections daily for your target city.</span>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span><strong className="text-foreground">Yelp</strong> — scans local service listings and identifies businesses with active quote requests in your area.</span>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span><strong className="text-foreground">Nextdoor</strong> — logs in with your credentials to scan the Ask section for neighbors requesting home services.</span>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span><strong className="text-foreground">Facebook</strong> — logs in with your credentials to scan local community groups for service requests.</span>
          </div>
        </CardContent>
      </Card>

      <Button
        data-testid="button-save-settings"
        className="gap-2 h-9 text-sm"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        <Save className="w-3.5 h-3.5" /> Save Settings
      </Button>
    </div>
  );
}
