import axios from "axios";
import * as cheerio from "cheerio";
import { storage } from "../storage";
import { detectCategory, detectPriority } from "../keywords";

// Scrapes Google search results for people actively looking for home services
export async function scanGoogle(): Promise<number> {
  const city = (storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando").toLowerCase();
  const cityDisplay = city.charAt(0).toUpperCase() + city.slice(1);

  const runRecord = storage.createScanRun({
    source: "google",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  let newLeads = 0;

  // Search queries that surface people actively looking for services
  const queries = [
    `"need a plumber" "${city} fl"`,
    `"looking for handyman" "${city} fl"`,
    `"need ac repair" "${city} fl"`,
    `"looking for house cleaner" "${city} fl"`,
    `"need landscaper" "${city} fl"`,
    `"need electrician" "${city} fl"`,
    `"need contractor" "${city} fl"`,
    `"recommend plumber" "${city}"`,
    `"recommend hvac" "${city}"`,
    `"who does lawn" "${city}"`,
  ];

  try {
    for (const query of queries) {
      try {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbs=qdr:w&num=10`;
        console.log(`[Google] Searching: ${query}`);

        const res = await axios.get(url, {
          timeout: 15000,
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
          },
        });

        const $ = cheerio.load(res.data);
        let found = 0;

        // Extract search results
        $("div.g, div[data-sokoban-container], .MjjYud .g").each((_, el) => {
          const titleEl = $(el).find("h3").first();
          const linkEl = $(el).find("a[href^='http'], a[href^='/url']").first();
          const snippetEl = $(el).find(".VwiC3b, .s3v9rd, span[class*='snippet']").first();

          const title = titleEl.text().trim();
          const href = linkEl.attr("href") || "";
          const snippet = snippetEl.text().trim();
          const fullUrl = href.startsWith("/url?q=") ? decodeURIComponent(href.replace("/url?q=", "").split("&")[0]) : href;

          if (!title || !fullUrl || fullUrl.includes("google.com")) return;
          if (storage.leadExistsByUrl(fullUrl)) return;

          const fullText = `${title} ${snippet}`;
          const category = detectCategory(fullText);
          if (category === "other") return;

          storage.createLead({
            title: title.slice(0, 200),
            description: snippet.slice(0, 500) || title,
            source: "google",
            sourceUrl: fullUrl,
            category,
            location: `${cityDisplay}, FL`,
            status: "new",
            priority: detectPriority(fullText),
            postedAt: new Date().toISOString(),
            discoveredAt: new Date().toISOString(),
          });
          newLeads++;
          found++;
          console.log(`[Google] Lead: "${title.slice(0, 60)}" [${category}]`);
        });

        console.log(`[Google] "${query}" → ${found} leads`);
        await new Promise(r => setTimeout(r, 2000)); // respectful delay
      } catch (err: any) {
        console.log(`[Google] Error: ${err.message}`);
      }
    }

    console.log(`[Google] Done — ${newLeads} total leads`);
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
