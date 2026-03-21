import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, like, or, and } from "drizzle-orm";
import { leads, scanRuns, settings } from "@shared/schema";
import type { InsertLead, Lead, InsertScanRun, ScanRun, InsertSetting, Setting } from "@shared/schema";

const DB_PATH = process.env.DB_PATH || "leads.db";
const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite);

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    category TEXT NOT NULL,
    location TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium',
    posted_at TEXT,
    discovered_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scan_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    leads_found INTEGER DEFAULT 0,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL
  );
`);

export interface IStorage {
  // Leads
  getLeads(filters?: { status?: string; category?: string; source?: string; search?: string }): Lead[];
  getLead(id: number): Lead | undefined;
  createLead(lead: InsertLead): Lead;
  updateLead(id: number, updates: Partial<InsertLead>): Lead | undefined;
  deleteLead(id: number): void;
  leadExistsByUrl(url: string): boolean;

  // Scan runs
  getScanRuns(limit?: number): ScanRun[];
  createScanRun(run: InsertScanRun): ScanRun;
  updateScanRun(id: number, updates: Partial<InsertScanRun>): ScanRun | undefined;

  // Settings
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
}

export class SqliteStorage implements IStorage {
  getLeads(filters?: { status?: string; category?: string; source?: string; search?: string }): Lead[] {
    let query = db.select().from(leads);
    const conditions = [];

    if (filters?.status) conditions.push(eq(leads.status, filters.status));
    if (filters?.category) conditions.push(eq(leads.category, filters.category));
    if (filters?.source) conditions.push(eq(leads.source, filters.source));
    if (filters?.search) {
      conditions.push(
        or(
          like(leads.title, `%${filters.search}%`),
          like(leads.description, `%${filters.search}%`),
          like(leads.location, `%${filters.search}%`)
        )!
      );
    }

    if (conditions.length > 0) {
      return db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.discoveredAt)).all();
    }
    return db.select().from(leads).orderBy(desc(leads.discoveredAt)).all();
  }

  getLead(id: number): Lead | undefined {
    return db.select().from(leads).where(eq(leads.id, id)).get();
  }

  createLead(lead: InsertLead): Lead {
    return db.insert(leads).values(lead).returning().get();
  }

  updateLead(id: number, updates: Partial<InsertLead>): Lead | undefined {
    const result = db.update(leads).set(updates).where(eq(leads.id, id)).returning().get();
    return result;
  }

  deleteLead(id: number): void {
    db.delete(leads).where(eq(leads.id, id)).run();
  }

  leadExistsByUrl(url: string): boolean {
    const result = db.select().from(leads).where(eq(leads.sourceUrl, url)).get();
    return !!result;
  }

  getScanRuns(limit = 50): ScanRun[] {
    return db.select().from(scanRuns).orderBy(desc(scanRuns.startedAt)).limit(limit).all();
  }

  createScanRun(run: InsertScanRun): ScanRun {
    return db.insert(scanRuns).values(run).returning().get();
  }

  updateScanRun(id: number, updates: Partial<InsertScanRun>): ScanRun | undefined {
    return db.update(scanRuns).set(updates).where(eq(scanRuns.id, id)).returning().get();
  }

  getSetting(key: string): string | undefined {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
  }
}

export const storage = new SqliteStorage();
