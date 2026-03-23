import axios from "axios";
import * as cheerio from "cheerio";
import { storage } from "./storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority, SERVICE_KEYWORDS } from "./keywords";
import { scanNextdoorReal } from "./scrapers/nextdoor";
import { scanFacebookReal } from "./scrapers/facebook";

// ---- CRAIGSLIST SCANNER ----
export async function scanCraigslist(city?: string): Promise<number> {
  const activeCity = city || storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const runRecord = storage.createScanRun({
    source: "craigslist",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  let newLeads = 0;

  // Search terms that people USE when LOOKING FOR services
  const queryTerms = [
    "need cleaning", "need plumber", "need handyman", "need landscaping",
    "looking for cleaner", "looking for contractor", "ac repair",
    "recommend plumber", "recommend electrician", "recommend painter",
    "anyone know handyman", "who does lawn", "need hvac",
  ];

  try {
    for (const term of queryTerms) {
      try {
        // Use Craigslist's JSON search API (more reliable than HTML scraping)
        const url = `https://${activeCity}.craigslist.org/search/swp.json?query=${encodeURIComponent(term)}&sort=date&limit=20`;
        console.log(`[Craigslist] Fetching: ${url}`);
        const res = await axios.get(url, {
          timeout: 15000,
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/html",
          },
        });

        const data = res.data;
        const items = data?.data?.items || data?.items || [];
        console.log(`[Craigslist] "${term}" → ${items.length} items (JSON)`);

        for (const item of items) {
          const title = item.Title || item.title || item[1] || "";
          const postUrl = item.PostingURL || item.url || `https://${activeCity}.craigslist.org${item.path || ""}`;

          if (!title || title.length < 5) continue;
          if (postUrl && storage.leadExistsByUrl(postUrl)) continue;

          const category = detectCategory(title);
          if (category === "other") continue;

          storage.createLead({
            title: title.slice(0, 200),
            description: title,
            source: "craigslist",
            sourceUrl: postUrl,
            category,
            location: item.Location || item.location || activeCity,
            status: "new",
            priority: detectPriority(title),
            postedAt: item.PostedDate || item.Date || new Date().toISOString(),
            discoveredAt: new Date().toISOString(),
          });
          newLeads++;
        }

        // If JSON didn't work, try HTML fallback
        if (items.length === 0 && typeof data === "string") {
          const $ = cheerio.load(data);
          const found = $("li.result-row, .cl-search-result, [data-pid]");
          console.log(`[Craigslist] "${term}" → HTML fallback, ${found.length} elements`);

          found.each((_, el) => {
            const a = $(el).find("a").first();
            const title = a.text().trim();
            const href = a.attr("href") || "";
            const fullUrl = href.startsWith("http") ? href : `https://${activeCity}.craigslist.org${href}`;

            if (!title || title.length < 5 || !href) return;
            if (storage.leadExistsByUrl(fullUrl)) return;

            const category = detectCategory(title);
            if (category === "other") return;

            storage.createLead({
              title: title.slice(0, 200),
              description: title,
              source: "craigslist",
              sourceUrl: fullUrl,
              category,
              location: activeCity,
              status: "new",
              priority: detectPriority(title),
              postedAt: new Date().toISOString(),
              discoveredAt: new Date().toISOString(),
            });
            newLeads++;
          });
        }

        await new Promise(r => setTimeout(r, 800));
      } catch (err: any) {
        console.log(`[Craigslist] Error for "${term}": ${err.message}`);
      }
    }

    console.log(`[Craigslist] Total new leads: ${newLeads}`);
    storage.updateScanRun(runRecord.id, {
      status: "success",
      leadsFound: newLeads,
      finishedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.log(`[Craigslist] Fatal error: ${err.message}`);
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
  const cityLower = city.toLowerCase().replace(/\s+/g, "");

  const subreddits = [
    "HomeImprovement", "DIY", "Plumbing", "hvac",
    "lawncare", "homeowners", "orlando", "cenfl",
    "florida", "miamifl", "tampabay", cityLower,
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  let newLeads = 0;

  try {
    for (const sub of subreddits) {
      try {
        const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
        console.log(`[Reddit] Scanning r/${sub}...`);

        const res = await axios.get(url, {
          timeout: 12000,
          headers: {
            "User-Agent": "HomeLeadScanner/1.0 (home services lead finder)",
            "Accept": "application/json",
          },
        });

        const posts = res.data?.data?.children || [];
        console.log(`[Reddit] r/${sub} → ${posts.length} posts`);

        let subLeads = 0;
        for (const post of posts) {
          const d = post.data;
          const title: string = d.title || "";
          const body: string = d.selftext || "";
          const fullText = `${title} ${body}`;
          const permalink = `https://reddit.com${d.permalink}`;

          if (storage.leadExistsByUrl(permalink)) continue;

          const category = detectCategory(fullText);
          if (category === "other") continue;

          // Broad request filter
          const requestWords = [
            "looking for", "need", "hire", "recommend", "help", "find",
            "seeking", "can anyone", "anyone know", "suggestions", "quote",
            "estimate", "who do you", "cost", "price", "anyone",
            "advice", "suggestion", "where can", "how do i find",
          ];
          if (!requestWords.some(w => fullText.toLowerCase().includes(w))) continue;

          storage.createLead({
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
          });
          newLeads++;
          subLeads++;
        }

        if (subLeads > 0) console.log(`[Reddit] r/${sub} → ${subLeads} new leads`);
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        console.log(`[Reddit] Error on r/${sub}: ${err.message}`);
      }
    }

    console.log(`[Reddit] Total new leads: ${newLeads}`);
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

// ---- NEXTDOOR SIMULATOR ----
export async function scanNextdoor(): Promise<number> {
  const runRecord = storage.createScanRun({
    source: "nextdoor",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  const city = storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const loc = `${city.charAt(0).toUpperCase() + city.slice(1)}, FL`;

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
    storage.createLead({
      title: post.title,
      description: post.title,
      source: "nextdoor",
      sourceUrl: fakeUrl,
      category: post.category,
      location: loc,
      status: "new",
      priority: (post as any).priority || detectPriority(post.title),
      postedAt: now,
      discoveredAt: now,
    });
    newLeads++;
  }

  storage.updateScanRun(runRecord.id, { status: "success", leadsFound: newLeads, finishedAt: now });
  return newLeads;
}

// ---- FACEBOOK SIMULATOR ----
export async function scanFacebook(): Promise<number> {
  const runRecord = storage.createScanRun({
    source: "facebook",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  const city = storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando";
  const loc = `${city.charAt(0).toUpperCase() + city.slice(1)}, FL`;

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
    storage.createLead({
      title: post.title,
      description: post.title,
      source: "facebook",
      sourceUrl: fakeUrl,
      category: post.category,
      location: loc,
      status: "new",
      priority: (post as any).priority || detectPriority(post.title),
      postedAt: now,
      discoveredAt: now,
    });
    newLeads++;
  }

  storage.updateScanRun(runRecord.id, { status: "success", leadsFound: newLeads, finishedAt: now });
  return newLeads;
}

// ---- RUN ALL SCANNERS ----
export async function runAllScanners(): Promise<{ total: number; sources: Record<string, number> }> {
  const results: Record<string, number> = {};

  const useRealNextdoor = !!(process.env.NEXTDOOR_EMAIL && process.env.NEXTDOOR_PASSWORD);
  const useRealFacebook = !!(process.env.FACEBOOK_EMAIL && process.env.FACEBOOK_PASSWORD);

  console.log(`[Scanner] Starting all scanners. Nextdoor: ${useRealNextdoor ? "real" : "simulated"}, Facebook: ${useRealFacebook ? "real" : "simulated"}`);

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
  console.log(`[Scanner] Done. Total: ${total}`, results);
  return { total, sources: results };
}
