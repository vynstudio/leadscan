import axios from "axios";
import * as cheerio from "cheerio";
import { storage } from "./storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority, SERVICE_KEYWORDS } from "./keywords";
import { scanNextdoorReal } from "./scrapers/nextdoor";
import { scanFacebookReal } from "./scrapers/facebook";
import { scanYelp } from "./scrapers/yelp";

// ---- CRAIGSLIST ----
export async function scanCraigslist(city?: string): Promise<number> {
  const activeCity = (city || storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando").toLowerCase().replace(/\s+/g, "");
  const runRecord = storage.createScanRun({
    source: "craigslist",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  let newLeads = 0;

  // Search multiple sections: hss=household services, swp=services wanted, sss=all services
  const sections = ["hss", "swp"];
  const queryTerms = ["cleaning", "plumber", "handyman", "landscaping", "hvac", "repair", "mover", "electrician"];

  try {
    for (const section of sections) {
      for (const term of queryTerms) {
        try {
          const url = `https://${activeCity}.craigslist.org/search/${section}?query=${encodeURIComponent(term)}&sort=date`;
          console.log(`[Craigslist] GET ${url}`);

          const res = await axios.get(url, {
            timeout: 15000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
              "Accept-Encoding": "gzip, deflate, br",
              "Connection": "keep-alive",
            },
          });

          const $ = cheerio.load(res.data);

          // Log what selectors are present
          const resultCount = $(".cl-search-result, li.result-row, [data-pid], .gallery-card, .result-title").length;
          console.log(`[Craigslist] ${section}/${term} → ${resultCount} elements found`);

          // Try all known Craigslist selectors
          $(".cl-search-result, li.result-row, [data-pid]").each((_, el) => {
            const titleEl = $(el).find("a.cl-app-anchor, a.result-title, .title-anchor, a[href*='/d/']").first();
            const title = titleEl.text().trim() || $(el).find("a").first().text().trim();
            const href = titleEl.attr("href") || $(el).find("a[href]").first().attr("href") || "";
            const fullUrl = href.startsWith("http") ? href : href ? `https://${activeCity}.craigslist.org${href}` : "";
            const location = $(el).find(".result-hood, .maptag, .separator ~ span").text().replace(/[()]/g, "").trim();
            const dateStr = $(el).find("time").attr("datetime") || new Date().toISOString();

            if (!title || title.length < 5 || !fullUrl) return;
            if (storage.leadExistsByUrl(fullUrl)) return;

            const category = detectCategory(title);
            if (category === "other") {
              console.log(`[Craigslist] Skipped (other): "${title}"`);
              return;
            }

            storage.createLead({
              title: title.slice(0, 200),
              description: title,
              source: "craigslist",
              sourceUrl: fullUrl,
              category,
              location: location || activeCity,
              status: "new",
              priority: detectPriority(title),
              postedAt: dateStr,
              discoveredAt: new Date().toISOString(),
            });
            newLeads++;
            console.log(`[Craigslist] Lead: "${title}" [${category}]`);
          });

          await new Promise(r => setTimeout(r, 1000));
        } catch (err: any) {
          console.log(`[Craigslist] Error ${section}/${term}: ${err.message}`);
        }
      }
    }

    console.log(`[Craigslist] Done — ${newLeads} new leads`);
    storage.updateScanRun(runRecord.id, { status: "success", leadsFound: newLeads, finishedAt: new Date().toISOString() });
  } catch (err: any) {
    console.log(`[Craigslist] Fatal: ${err.message}`);
    storage.updateScanRun(runRecord.id, { status: "failed", finishedAt: new Date().toISOString(), errorMessage: err.message });
  }

  return newLeads;
}

// ---- NEXTDOOR (fallback simulator if no credentials) ----
export async function scanNextdoor(): Promise<number> {
  const city = storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const loc = city.charAt(0).toUpperCase() + city.slice(1) + ", FL";
  const runRecord = storage.createScanRun({ source: "nextdoor", status: "running", leadsFound: 0, startedAt: new Date().toISOString() });
  const posts = [
    { title: "Looking for a reliable house cleaner in the area", category: "cleaning" },
    { title: "Need a plumber ASAP — pipe burst in my kitchen", category: "plumbing", priority: "high" as const },
    { title: "Recommend a good landscaper for weekly lawn maintenance?", category: "landscaping" },
    { title: "Anyone know a handyman who does drywall repairs?", category: "handyman" },
    { title: "HVAC not working — need repair this week", category: "hvac" },
    { title: "Looking for bathroom remodel contractor, budget ready", category: "remodeling", priority: "high" as const },
  ];
  let newLeads = 0;
  const now = new Date().toISOString();
  for (const post of posts) {
    const fakeUrl = `https://nextdoor.com/p/sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    storage.createLead({ title: post.title, description: post.title, source: "nextdoor", sourceUrl: fakeUrl, category: post.category, location: loc, status: "new", priority: (post as any).priority || detectPriority(post.title), postedAt: now, discoveredAt: now });
    newLeads++;
  }
  storage.updateScanRun(runRecord.id, { status: "success", leadsFound: newLeads, finishedAt: now });
  return newLeads;
}

// ---- FACEBOOK (fallback simulator if no credentials) ----
export async function scanFacebook(): Promise<number> {
  const city = storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const loc = city.charAt(0).toUpperCase() + city.slice(1) + ", FL";
  const runRecord = storage.createScanRun({ source: "facebook", status: "running", leadsFound: 0, startedAt: new Date().toISOString() });
  const posts = [
    { title: "Does anyone have a contact for a good deep cleaning service?", category: "cleaning" },
    { title: "My AC went out — need a good HVAC company recommendation", category: "hvac", priority: "high" as const },
    { title: "Looking to hire a landscaper for my backyard renovation", category: "landscaping" },
    { title: "Urgent — need water heater replacement today!", category: "plumbing", priority: "high" as const },
    { title: "Anyone recommend a painter or handyman? Need some repairs done", category: "handyman" },
  ];
  let newLeads = 0;
  const now = new Date().toISOString();
  for (const post of posts) {
    const fakeUrl = `https://facebook.com/groups/sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    storage.createLead({ title: post.title, description: post.title, source: "facebook", sourceUrl: fakeUrl, category: post.category, location: loc, status: "new", priority: (post as any).priority || detectPriority(post.title), postedAt: now, discoveredAt: now });
    newLeads++;
  }
  storage.updateScanRun(runRecord.id, { status: "success", leadsFound: newLeads, finishedAt: now });
  return newLeads;
}

// ---- RUN ALL ----
export async function runAllScanners(): Promise<{ total: number; sources: Record<string, number> }> {
  const useRealNextdoor = !!(process.env.NEXTDOOR_EMAIL && process.env.NEXTDOOR_PASSWORD);
  const useRealFacebook = !!(process.env.FACEBOOK_EMAIL && process.env.FACEBOOK_PASSWORD);
  console.log(`[Scanner] Starting — Nextdoor: ${useRealNextdoor ? "REAL" : "simulated"}, Facebook: ${useRealFacebook ? "REAL" : "simulated"}`);

  const [cl, yelp, nextdoor, fb] = await Promise.allSettled([
    scanCraigslist(),
    scanYelp(),
    useRealNextdoor ? scanNextdoorReal() : scanNextdoor(),
    useRealFacebook ? scanFacebookReal() : scanFacebook(),
  ]);

  const results = {
    craigslist: cl.status === "fulfilled" ? cl.value : 0,
    yelp: yelp.status === "fulfilled" ? yelp.value : 0,
    nextdoor: nextdoor.status === "fulfilled" ? nextdoor.value : 0,
    facebook: fb.status === "fulfilled" ? fb.value : 0,
  };

  const total = Object.values(results).reduce((a, b) => a + b, 0);
  console.log(`[Scanner] Complete — total: ${total}`, results);
  return { total, sources: results };
}
