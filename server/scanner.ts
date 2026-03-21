import axios from "axios";
import * as cheerio from "cheerio";
import { storage } from "./storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority } from "./keywords";
import { scanNextdoorReal } from "./scrapers/nextdoor";
import { scanFacebookReal } from "./scrapers/facebook";

// ---- CRAIGSLIST SCANNER ----
export async function scanCraigslist(city?: string): Promise<number> {
  // Always read city from settings/env so changes take effect immediately
  const activeCity = city || storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const runRecord = storage.createScanRun({
    source: "craigslist",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  const sections = ["hss", "hss"]; // household services
  const allKeywords = Object.values(SERVICE_KEYWORDS).flat();
  // Use a sample of keywords to search
  const queryTerms = ["cleaning", "plumber", "handyman", "landscaping", "hvac", "remodel"];

  let newLeads = 0;

  try {
    for (const term of queryTerms) {
      try {
        const url = `https://${activeCity}.craigslist.org/search/hss?query=${encodeURIComponent(term)}&sort=date`;
        const res = await axios.get(url, {
          timeout: 10000,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
        });
        const $ = cheerio.load(res.data);

        $(".cl-search-result, .result-row, li.result-row").each((_, el) => {
          const titleEl = $(el).find(".title-anchor, a.result-title, .cl-app-anchor");
          const title = titleEl.text().trim();
          const href = titleEl.attr("href") || "";
          const fullUrl = href.startsWith("http") ? href : `https://${activeCity}.craigslist.org${href}`;
          const location = $(el).find(".result-hood, .meta .maptag").text().replace(/[()]/g, "").trim();
          const dateStr = $(el).find("time").attr("datetime") || new Date().toISOString();

          if (!title || title.length < 5) return;
          if (fullUrl && storage.leadExistsByUrl(fullUrl)) return;

          const category = detectCategory(title);
          if (category === "other") return; // Only home services

          const lead: InsertLead = {
            title,
            description: title,
            source: "craigslist",
            sourceUrl: fullUrl,
            category,
            location: location || activeCity,
            status: "new",
            priority: detectPriority(title),
            postedAt: dateStr,
            discoveredAt: new Date().toISOString(),
          };

          storage.createLead(lead);
          newLeads++;
        });
      } catch (err) {
        // Skip individual term errors
      }
    }

    storage.updateScanRun(runRecord.id, {
      status: "success",
      leadsFound: newLeads,
      finishedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    storage.updateScanRun(runRecord.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: err.message,
    });
  }

  return newLeads;
}

// ---- REDDIT SCANNER ----
export async function scanReddit(): Promise<number> {
  const runRecord = storage.createScanRun({
    source: "reddit",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  const city = storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const subreddits = [
    "HomeImprovement", "DIY", "Plumbing", "hvac",
    "lawncare", "cleaning_tips", "FirstTimeHomeBuyer",
    "homeowners", "orlando", "cenfl", "florida"
  ];

  let newLeads = 0;

  try {
    for (const sub of subreddits) {
      try {
        const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
        const res = await axios.get(url, {
          timeout: 10000,
          headers: {
            "User-Agent": "LeadBot/1.0 (home services lead scanner)",
          },
        });

        const posts = res.data?.data?.children || [];
        for (const post of posts) {
          const d = post.data;
          const title: string = d.title || "";
          const body: string = d.selftext || "";
          const fullText = `${title} ${body}`;
          const permalink = `https://reddit.com${d.permalink}`;

          if (storage.leadExistsByUrl(permalink)) continue;

          const category = detectCategory(fullText);
          if (category === "other") continue;

          // Only show request-type posts (looking for, need, hire, recommend)
          const requestWords = ["looking for", "need", "hire", "recommend", "help", "find", "seeking", "can anyone"];
          if (!requestWords.some(w => fullText.toLowerCase().includes(w))) continue;

          const lead: InsertLead = {
            title: title.slice(0, 200),
            description: body.slice(0, 500) || title,
            source: "reddit",
            sourceUrl: permalink,
            category,
            location: d.subreddit_name_prefixed || `r/${sub}`,
            contactName: d.author || undefined,
            status: "new",
            priority: detectPriority(fullText),
            postedAt: new Date(d.created_utc * 1000).toISOString(),
            discoveredAt: new Date().toISOString(),
          };

          storage.createLead(lead);
          newLeads++;
        }
      } catch (err) {
        // Skip individual subreddit errors
      }
    }

    storage.updateScanRun(runRecord.id, {
      status: "success",
      leadsFound: newLeads,
      finishedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    storage.updateScanRun(runRecord.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: err.message,
    });
  }

  return newLeads;
}

// ---- NEXTDOOR SIMULATOR (public API not available — simulate realistic leads) ----
export async function scanNextdoor(): Promise<number> {
  const runRecord = storage.createScanRun({
    source: "nextdoor",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  // Nextdoor does not have a public API — we simulate realistic neighborhood lead data
  // In production, integrate via Nextdoor Business API or manual export
  const city = storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const isOrlando = city.toLowerCase().includes("orlando");
  const simulatedPosts = isOrlando ? [
    { title: "Looking for a reliable house cleaner in the area", location: "Orlando, FL", category: "cleaning" },
    { title: "Need a plumber ASAP — pipe burst in my kitchen", location: "Winter Park, FL", category: "plumbing", priority: "high" as const },
    { title: "Recommend a good landscaper for weekly lawn maintenance?", location: "Kissimmee, FL", category: "landscaping" },
    { title: "Anyone know a handyman who does drywall repairs?", location: "Oviedo, FL", category: "handyman" },
    { title: "HVAC not working — need repair this week", location: "Sanford, FL", category: "hvac" },
    { title: "Looking for bathroom remodel contractor, budget ready", location: "Lake Nona, FL", category: "remodeling", priority: "high" as const },
  ] : [
    { title: "Looking for a reliable house cleaner in the area", location: `${city}, FL`, category: "cleaning" },
    { title: "Need a plumber ASAP — pipe burst in my kitchen", location: `${city}, FL`, category: "plumbing", priority: "high" as const },
    { title: "Recommend a good landscaper for weekly lawn maintenance?", location: `${city}, FL`, category: "landscaping" },
    { title: "Anyone know a handyman who does drywall repairs?", location: `${city}, FL`, category: "handyman" },
    { title: "HVAC not working — need repair this week", location: `${city}, FL`, category: "hvac" },
    { title: "Looking for bathroom remodel contractor, budget ready", location: `${city}, FL`, category: "remodeling", priority: "high" as const },
  ];

  let newLeads = 0;
  const now = new Date().toISOString();

  for (const post of simulatedPosts) {
    // Simulate by using a pseudo-unique URL
    const fakeUrl = `https://nextdoor.com/p/simulated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lead: InsertLead = {
      title: post.title,
      description: post.title,
      source: "nextdoor",
      sourceUrl: fakeUrl,
      category: post.category,
      location: post.location,
      status: "new",
      priority: (post as any).priority || detectPriority(post.title),
      postedAt: now,
      discoveredAt: now,
    };
    storage.createLead(lead);
    newLeads++;
  }

  storage.updateScanRun(runRecord.id, {
    status: "success",
    leadsFound: newLeads,
    finishedAt: new Date().toISOString(),
  });

  return newLeads;
}

// ---- FACEBOOK GROUPS SIMULATOR ----
export async function scanFacebook(): Promise<number> {
  const runRecord = storage.createScanRun({
    source: "facebook",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  // Facebook Graph API requires page tokens and group membership
  // Simulate community group posts for demo — connect FB Business API for live data
  const city = storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const isOrlando = city.toLowerCase().includes("orlando");
  const simulatedPosts = isOrlando ? [
    { title: "Does anyone have a contact for a good deep cleaning service?", location: "Dr. Phillips, FL", category: "cleaning" },
    { title: "My AC went out — need a good HVAC company recommendation", location: "Windermere, FL", category: "hvac", priority: "high" as const },
    { title: "Looking to hire a landscaper for my backyard renovation", location: "Baldwin Park, FL", category: "landscaping" },
    { title: "Urgent — need water heater replacement today!", location: "Celebration, FL", category: "plumbing", priority: "high" as const },
    { title: "Anyone recommend a painter or handyman? Need some repairs done", location: "College Park, FL", category: "handyman" },
  ] : [
    { title: "Does anyone have a contact for a good deep cleaning service?", location: `${city}, FL`, category: "cleaning" },
    { title: "My AC went out — need a good HVAC company recommendation", location: `${city}, FL`, category: "hvac", priority: "high" as const },
    { title: "Looking to hire a landscaper for my backyard renovation", location: `${city}, FL`, category: "landscaping" },
    { title: "Urgent — need water heater replacement today!", location: `${city}, FL`, category: "plumbing", priority: "high" as const },
    { title: "Anyone recommend a painter or handyman? Need some repairs done", location: `${city}, FL`, category: "handyman" },
  ];

  let newLeads = 0;
  const now = new Date().toISOString();

  for (const post of simulatedPosts) {
    const fakeUrl = `https://facebook.com/groups/simulated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lead: InsertLead = {
      title: post.title,
      description: post.title,
      source: "facebook",
      sourceUrl: fakeUrl,
      category: post.category,
      location: post.location,
      status: "new",
      priority: (post as any).priority || detectPriority(post.title),
      postedAt: now,
      discoveredAt: now,
    };
    storage.createLead(lead);
    newLeads++;
  }

  storage.updateScanRun(runRecord.id, {
    status: "success",
    leadsFound: newLeads,
    finishedAt: new Date().toISOString(),
  });

  return newLeads;
}

// ---- RUN ALL SCANNERS ----
export async function runAllScanners(): Promise<{ total: number; sources: Record<string, number> }> {
  const results: Record<string, number> = {};

  // Use real scrapers if credentials are set, otherwise fall back to simulated
  const useRealNextdoor = !!(process.env.NEXTDOOR_EMAIL && process.env.NEXTDOOR_PASSWORD);
  const useRealFacebook = !!(process.env.FACEBOOK_EMAIL && process.env.FACEBOOK_PASSWORD);

  const [cl, reddit, nextdoor, fb] = await Promise.allSettled([
    scanCraigslist(),
    scanReddit(),
    useRealNextdoor ? scanNextdoorReal() : scanNextdoor(),
    useRealFacebook ? scanFacebookReal() : scanFacebook(),
  ]);

  results.craigslist = cl.status === "fulfilled" ? cl.value : 0;
  results.reddit = reddit.status === "fulfilled" ? reddit.value : 0;
  results.nextdoor = nextdoor.status === "fulfilled" ? nextdoor.value : 0;
  results.facebook = fb.status === "fulfilled" ? fb.value : 0;

  const total = Object.values(results).reduce((a, b) => a + b, 0);
  return { total, sources: results };
}
