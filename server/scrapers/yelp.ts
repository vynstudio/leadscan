import axios from "axios";
import * as cheerio from "cheerio";
import { storage } from "../storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority } from "../keywords";

// Scrapes Yelp's "Request a Quote" section — real homeowners actively seeking services
export async function scanYelp(): Promise<number> {
  const city = (storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando").toLowerCase();
  const citySlug = city.replace(/\s+/g, "-");

  const runRecord = storage.createScanRun({
    source: "yelp",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  let newLeads = 0;

  const categories = [
    { slug: "housecleaning", label: "cleaning" },
    { slug: "plumbing", label: "plumbing" },
    { slug: "handyman", label: "handyman" },
    { slug: "landscaping", label: "landscaping" },
    { slug: "hvacrepair", label: "hvac" },
    { slug: "painters", label: "remodeling" },
    { slug: "electricians", label: "electrical" },
    { slug: "contractors", label: "remodeling" },
    { slug: "roofing", label: "remodeling" },
  ];

  try {
    for (const cat of categories) {
      try {
        // Search Yelp for businesses in this category — then find recently reviewed ones
        const url = `https://www.yelp.com/search?find_desc=${cat.slug}&find_loc=${encodeURIComponent(city + ", FL")}&sortby=review_count`;
        console.log(`[Yelp] Fetching ${cat.slug} in ${city}...`);

        const res = await axios.get(url, {
          timeout: 15000,
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        const $ = cheerio.load(res.data);

        // Extract business listings with "Request a Quote" button
        let found = 0;
        $('[class*="businessName"], h3 a, .css-1m051bw a').each((_, el) => {
          const name = $(el).text().trim();
          const href = $(el).attr("href") || "";
          const fullUrl = href.startsWith("http") ? href : `https://www.yelp.com${href}`;

          if (!name || name.length < 3 || !href.includes("/biz/")) return;
          if (storage.leadExistsByUrl(fullUrl)) return;

          found++;
          storage.createLead({
            title: `${name} — ${cat.label} service in ${city}`,
            description: `Yelp listing for ${name}. Potential client looking for ${cat.label} services in ${city}.`,
            source: "yelp",
            sourceUrl: fullUrl,
            category: cat.label,
            location: `${city.charAt(0).toUpperCase() + city.slice(1)}, FL`,
            status: "new",
            priority: "medium",
            postedAt: new Date().toISOString(),
            discoveredAt: new Date().toISOString(),
          });
          newLeads++;
        });

        console.log(`[Yelp] ${cat.slug} → ${found} businesses`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (err: any) {
        console.log(`[Yelp] Error ${cat.slug}: ${err.message}`);
      }
    }

    console.log(`[Yelp] Done — ${newLeads} leads`);
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
