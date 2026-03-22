import { chromium } from "playwright";
import { storage } from "../storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority } from "../keywords";

// Orlando-area Facebook community groups to monitor
const ORLANDO_GROUPS = [
  "https://www.facebook.com/groups/orlandoneighbors",
  "https://www.facebook.com/groups/orlandoflorida",
  "https://www.facebook.com/groups/orlandocommunity",
  "https://www.facebook.com/groups/winterparkorlando",
  "https://www.facebook.com/groups/kissimmeecommunity",
  "https://www.facebook.com/groups/lakenonacommunity",
  "https://www.facebook.com/groups/windermerefl",
  "https://www.facebook.com/groups/celebrationflcommunity",
];

export async function scanFacebookReal(): Promise<number> {
  const email = process.env.FACEBOOK_EMAIL;
  const password = process.env.FACEBOOK_PASSWORD;

  if (!email || !password) {
    console.log("[Facebook] No credentials set — skipping real scan");
    return 0;
  }

  const runRecord = storage.createScanRun({
    source: "facebook",
    status: "running",
    leadsFound: 0,
    startedAt: new Date().toISOString(),
  });

  let newLeads = 0;
  let browser;

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

    // Login to Facebook
    console.log("[Facebook] Logging in...");
    await page.goto("https://www.facebook.com/login", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    await page.fill('#email', email);
    await page.fill('#pass', password);
    await page.click('button[name="login"], [data-testid="royal_login_button"]');
    await page.waitForTimeout(5000);

    // Check login succeeded
    const url = page.url();
    if (url.includes("login") || url.includes("checkpoint")) {
      throw new Error("Facebook login failed or requires 2FA verification");
    }

    console.log("[Facebook] Logged in successfully");

    // Scan each group
    for (const groupUrl of ORLANDO_GROUPS) {
      try {
        console.log(`[Facebook] Scanning ${groupUrl}...`);
        await page.goto(groupUrl, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(3000);

        // Scroll to load posts
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 1200));
          await page.waitForTimeout(1500);
        }

        // Extract posts
        const posts = await page.evaluate((gUrl) => {
          const results: any[] = [];
          const postEls = document.querySelectorAll(
            '[data-pagelet*="GroupFeed"] [role="article"], [data-testid="post_message"], div[class*="userContent"]'
          );

          postEls.forEach(el => {
            const textEl = el.querySelector('[data-ad-comet-preview="message"], [data-testid="post_message"], p, span[dir="auto"]');
            const linkEl = el.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="?id="]');
            const text = textEl?.textContent?.trim() || el.textContent?.trim() || "";
            const href = linkEl?.getAttribute("href") || "";

            if (text.length > 20) {
              results.push({
                text: text.slice(0, 500),
                url: href.startsWith("http") ? href : `https://www.facebook.com${href}`,
                group: gUrl,
              });
            }
          });

          return results;
        }, groupUrl);

        for (const post of posts) {
          const category = detectCategory(post.text);
          if (category === "other") continue;

          const requestWords = ["looking for", "need", "recommend", "hire", "anyone know", "help me find", "seeking"];
          if (!requestWords.some(w => post.text.toLowerCase().includes(w))) continue;

          if (post.url && post.url.length > 10 && storage.leadExistsByUrl(post.url)) continue;

          const title = post.text.split(/[.!?]/)[0].slice(0, 150) || post.text.slice(0, 150);

          const lead: InsertLead = {
            title,
            description: post.text,
            source: "facebook",
            sourceUrl: post.url || groupUrl,
            category,
            location: "Orlando, FL",
            status: "new",
            priority: detectPriority(post.text),
            postedAt: new Date().toISOString(),
            discoveredAt: new Date().toISOString(),
          };

          storage.createLead(lead);
          newLeads++;
        }
      } catch (groupErr: any) {
        console.log(`[Facebook] Skipped group ${groupUrl}: ${groupErr.message}`);
      }
    }

    await browser.close();

    storage.updateScanRun(runRecord.id, {
      status: "success",
      leadsFound: newLeads,
      finishedAt: new Date().toISOString(),
    });

    console.log(`[Facebook] Done — ${newLeads} new leads`);
  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    console.error("[Facebook] Error:", err.message);
    storage.updateScanRun(runRecord.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: err.message,
    });
  }

  return newLeads;
}
