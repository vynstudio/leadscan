import type { Express } from "express";
import { Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema } from "@shared/schema";
import { runAllScanners, scanCraigslist, scanNextdoor, scanFacebook } from "./scanner";
import { submitNextdoorCode, getNextdoorVerificationStatus } from "./scrapers/nextdoor";
import cron from "node-cron";
import { z } from "zod";
import { requireAuth } from "./auth";

let scannerJob: cron.ScheduledTask | null = null;
let isScanning = false;

export async function registerRoutes(httpServer: Server, app: Express) {

  // Protect all /api routes except /api/auth/*
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    return requireAuth(req, res, next);
  });

  // ---- LEADS ROUTES ----
  app.get("/api/leads", (req, res) => {
    const { status, category, source, search } = req.query;
    const leads = storage.getLeads({
      status: status as string,
      category: category as string,
      source: source as string,
      search: search as string,
    });
    res.json(leads);
  });

  app.get("/api/leads/:id", (req, res) => {
    const lead = storage.getLead(Number(req.params.id));
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json(lead);
  });

  app.post("/api/leads", (req, res) => {
    const parsed = insertLeadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
    const lead = storage.createLead(parsed.data);
    res.status(201).json(lead);
  });

  app.patch("/api/leads/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = storage.getLead(id);
    if (!existing) return res.status(404).json({ message: "Lead not found" });
    const updated = storage.updateLead(id, req.body);
    res.json(updated);
  });

  app.delete("/api/leads/:id", (req, res) => {
    const id = Number(req.params.id);
    storage.deleteLead(id);
    res.json({ success: true });
  });

  // ---- STATS ----
  app.get("/api/stats", (req, res) => {
    const allLeads = storage.getLeads();
    const stats = {
      total: allLeads.length,
      byStatus: {
        new: allLeads.filter(l => l.status === "new").length,
        contacted: allLeads.filter(l => l.status === "contacted").length,
        won: allLeads.filter(l => l.status === "won").length,
        lost: allLeads.filter(l => l.status === "lost").length,
      },
      byCategory: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      byPriority: {
        high: allLeads.filter(l => l.priority === "high").length,
        medium: allLeads.filter(l => l.priority === "medium").length,
        low: allLeads.filter(l => l.priority === "low").length,
      },
    };
    for (const lead of allLeads) {
      stats.byCategory[lead.category] = (stats.byCategory[lead.category] || 0) + 1;
      stats.bySource[lead.source] = (stats.bySource[lead.source] || 0) + 1;
    }
    res.json(stats);
  });

  // ---- NEXTDOOR VERIFICATION ----
  app.get("/api/nextdoor/verification-status", (req, res) => {
    res.json(getNextdoorVerificationStatus());
  });

  app.post("/api/nextdoor/verify", (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Code required" });
    submitNextdoorCode(String(code).trim());
    res.json({ success: true });
  });

  // ---- SCAN RUNS ----
  app.get("/api/scan-runs", (req, res) => {
    const runs = storage.getScanRuns(20);
    res.json(runs);
  });

  // ---- TRIGGER MANUAL SCAN ----
  app.post("/api/scan", async (req, res) => {
    if (isScanning) {
      return res.json({ message: "Scan already in progress", scanning: true });
    }
    isScanning = true;
    res.json({ message: "Scan started", scanning: true });

    try {
      await runAllScanners();
    } finally {
      isScanning = false;
    }
  });

  app.get("/api/scan/status", (req, res) => {
    res.json({ scanning: isScanning });
  });

  // ---- SCANNER SETTINGS ----
  app.get("/api/settings", (req, res) => {
    const scanInterval = storage.getSetting("scanInterval") || "5";
    const city = storage.getSetting("city") || "miami";
    const enabledSources = storage.getSetting("enabledSources") || JSON.stringify(["craigslist", "reddit", "nextdoor", "facebook"]);
    res.json({ scanInterval, city, enabledSources: JSON.parse(enabledSources) });
  });

  app.post("/api/settings", (req, res) => {
    const { scanInterval, city, enabledSources } = req.body;
    if (scanInterval) storage.setSetting("scanInterval", String(scanInterval));
    if (city) storage.setSetting("city", city);
    if (enabledSources) storage.setSetting("enabledSources", JSON.stringify(enabledSources));

    // Restart cron if interval changed
    if (scanInterval) startScannerCron(Number(scanInterval));
    res.json({ success: true });
  });

  // ---- AUTO-SCAN CRON ----
  function startScannerCron(intervalMinutes: number) {
    if (scannerJob) {
      scannerJob.stop();
      scannerJob = null;
    }

    const mins = Math.max(1, Math.floor(intervalMinutes));
    // Run every N minutes
    const expr = `*/${mins} * * * *`;
    scannerJob = cron.schedule(expr, async () => {
      if (isScanning) return;
      isScanning = true;
      try {
        await runAllScanners();
      } finally {
        isScanning = false;
      }
    });
    console.log(`[Scanner] Auto-scan scheduled every ${mins} min`);
  }

  // Initial scan on startup + schedule
  const initialInterval = Number(storage.getSetting("scanInterval") || "5");
  startScannerCron(initialInterval);

  // Trigger first scan after short delay
  setTimeout(async () => {
    if (!isScanning) {
      isScanning = true;
      try {
        await runAllScanners();
      } finally {
        isScanning = false;
      }
    }
  }, 3000);
}
