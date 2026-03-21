import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---- LEADS ----
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(), // "craigslist" | "reddit" | "nextdoor" | "facebook"
  sourceUrl: text("source_url"),
  category: text("category").notNull(), // "cleaning" | "landscaping" | "plumbing" | "hvac" | "handyman" | "remodeling" | "other"
  location: text("location"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  status: text("status").notNull().default("new"), // "new" | "contacted" | "won" | "lost"
  notes: text("notes").default(""),
  priority: text("priority").notNull().default("medium"), // "high" | "medium" | "low"
  postedAt: text("posted_at"),
  discoveredAt: text("discovered_at").notNull(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

// ---- SCAN RUNS ----
export const scanRuns = sqliteTable("scan_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  status: text("status").notNull().default("running"), // "running" | "success" | "failed"
  leadsFound: integer("leads_found").default(0),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  errorMessage: text("error_message"),
});

export const insertScanRunSchema = createInsertSchema(scanRuns).omit({ id: true });
export type InsertScanRun = z.infer<typeof insertScanRunSchema>;
export type ScanRun = typeof scanRuns.$inferSelect;

// ---- SETTINGS ----
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;
