import { chromium, type Browser } from "playwright";
import { storage } from "../storage";
import { detectCategory, detectPriority } from "../keywords";

// Scrapes Facebook Marketplace for home service requests in the target city
export async function scanFacebookMarketplace(): Promise<number> {
  const email = process.env.FACEBOOK_EMAIL;
  const password = process.env.FACEBOOK_PASSWORD;

  if (!email || !password) {
    console.log("[FB Marketplace] No credentials — skipping");
    return 0;
  }

  const city = (storage.getSetting("city") || process.env.DEFAULT_CITY || "orlando").toLowerCase();
  const cityDisplay = city.charAt(0).toUpperCase() + city.slice(1);

  const runRecord = storage.createScanRun({
    source: "fb_marketplace",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  let newLeads = 0;
  let browser: Browser | undefined;

  // Service categories to search in Marketplace
  const serviceQueries = [
    "house cleaning", "lawn care", "handyman", "plumber",
    "ac repair", "hvac", "painting", "landscaping",
  ];

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    // Login
    console.log("[FB Marketplace] Logging in...");
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const emailSelectors = ['#email', 'input[name="email"]', 'input[type="email"]'];
    for (const sel of emailSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 4000 });
        await page.fill(sel, email);
        break;
      } catch {}
    }

    await page.fill('#pass, input[name="pass"], input[type="password"]', password).catch(() => {});
    await page.click('button[name="login"], button[type="submit"]').catch(() => {});
    await page.waitForTimeout(5000);

    const loggedIn = !page.url().includes("login");
    if (!loggedIn) {
      throw new Error("FB login failed — check credentials");
    }

    console.log("[FB Marketplace] Logged in, scanning Marketplace services...");

    for (const query of serviceQueries) {
      try {
        // Facebook Marketplace services category
        const url = `https://www.facebook.com/marketplace/${city}fl/search/?query=${encodeURIComponent(query)}&category_id=233614207386531`; // 233614207386531 = Home Services
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(3000);

        // Scroll to load listings
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(1500);

        // Extract listings
        const listings = await page.evaluate(() => {
          const results: any[] = [];
          const items = document.querySelectorAll(
            '[aria-label*="listing"], [data-testid*="marketplace"], div[class*="x1qjc9v5"] a[href*="/marketplace/item/"]'
          );
          items.forEach(item => {
            const link = item.tagName === "A" ? item : item.querySelector("a[href*='/marketplace/item/']");
            const href = link?.getAttribute("href") || "";
            const title = item.querySelector('[class*="x1lliihq"], span')?.textContent?.trim() || "";
            const price = item.querySelector('[class*="price"], [aria-label*="price"]')?.textContent?.trim() || "";

            if (href.includes("/marketplace/item/") && title) {
              results.push({
                title,
                price,
                url: href.startsWith("http") ? href : `https://www.facebook.com${href}`,
              });
            }
          });
          return results;
        });

        console.log(`[FB Marketplace] "${query}" → ${listings.length} listings`);

        for (const listing of listings) {
          if (storage.leadExistsByUrl(listing.url)) continue;

          const category = detectCategory(`${listing.title} ${query}`);

          storage.createLead({
            title: listing.title.slice(0, 200),
            description: `Facebook Marketplace: ${listing.title}${listing.price ? ` — ${listing.price}` : ""}`,
            source: "fb_marketplace",
            sourceUrl: listing.url,
            category: category !== "other" ? category : detectCategory(query),
            location: `${cityDisplay}, FL`,
            status: "new",
            priority: detectPriority(listing.title),
            postedAt: new Date().toISOString(),
            discoveredAt: new Date().toISOString(),
          });
          newLeads++;
          console.log(`[FB Marketplace] Lead: "${listing.title.slice(0, 60)}"`);
        }

        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        console.log(`[FB Marketplace] Error "${query}": ${err.message}`);
      }
    }

    await browser.close();
    console.log(`[FB Marketplace] Done — ${newLeads} leads`);
    storage.updateScanRun(runRecord.id, {
      status: "success",
      leadsFound: newLeads,
      finishedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    console.error("[FB Marketplace] Error:", err.message);
    storage.updateScanRun(runRecord.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: err.message,
    });
  }

  return newLeads;
}
