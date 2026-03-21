import { chromium } from "playwright";
import { storage } from "../storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority } from "../keywords";

export async function scanNextdoorReal(): Promise<number> {
  const email = process.env.NEXTDOOR_EMAIL;
  const password = process.env.NEXTDOOR_PASSWORD;

  if (!email || !password) {
    console.log("[Nextdoor] No credentials set — skipping real scan");
    return 0;
  }

  const runRecord = storage.createScanRun({
    source: "nextdoor",
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
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    // Login
    console.log("[Nextdoor] Logging in...");
    await page.goto("https://nextdoor.com/login/", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Fill email
    await page.fill('input[name="email"], input[type="email"], #id_email', email);
    await page.waitForTimeout(500);

    // Click next / continue
    const nextBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Next")').first();
    await nextBtn.click();
    await page.waitForTimeout(2000);

    // Fill password
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.waitForTimeout(500);

    const loginBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
    await loginBtn.click();
    await page.waitForTimeout(4000);

    // Check if login succeeded
    const url = page.url();
    if (url.includes("login") || url.includes("verify")) {
      throw new Error("Login failed or requires verification — check credentials");
    }

    console.log("[Nextdoor] Logged in, navigating to Ask section...");

    // Go to the Ask/Help section — where people request services
    await page.goto("https://nextdoor.com/news_feed/?post_type=ask", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Scroll to load more posts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(1000);
    }

    // Extract posts
    const posts = await page.evaluate(() => {
      const results: any[] = [];
      // Try multiple selectors for post cards
      const cards = document.querySelectorAll(
        '[data-testid="post-card"], .post-card, article[data-post-id], [class*="PostCard"], [class*="FeedItem"]'
      );

      cards.forEach(card => {
        const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="subject"], [class*="PostTitle"]');
        const bodyEl = card.querySelector('p, [class*="body"], [class*="content"], [class*="PostBody"]');
        const linkEl = card.querySelector('a[href*="/p/"], a[href*="/posts/"]');
        const authorEl = card.querySelector('[class*="author"], [class*="Author"], [class*="name"]');

        const title = titleEl?.textContent?.trim() || "";
        const body = bodyEl?.textContent?.trim() || "";
        const href = linkEl?.getAttribute("href") || "";
        const author = authorEl?.textContent?.trim() || "";

        if (title.length > 10) {
          results.push({
            title,
            body: body.slice(0, 500),
            url: href.startsWith("http") ? href : `https://nextdoor.com${href}`,
            author,
          });
        }
      });

      return results;
    });

    console.log(`[Nextdoor] Found ${posts.length} posts to evaluate`);

    for (const post of posts) {
      const fullText = `${post.title} ${post.body}`;
      const category = detectCategory(fullText);
      if (category === "other") continue;

      const requestWords = ["looking for", "need", "recommend", "hire", "help", "find", "anyone know", "can someone"];
      if (!requestWords.some(w => fullText.toLowerCase().includes(w))) continue;

      if (post.url && storage.leadExistsByUrl(post.url)) continue;

      const lead: InsertLead = {
        title: post.title.slice(0, 200),
        description: post.body || post.title,
        source: "nextdoor",
        sourceUrl: post.url,
        category,
        location: "Orlando, FL",
        contactName: post.author || undefined,
        status: "new",
        priority: detectPriority(fullText),
        postedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
      };

      storage.createLead(lead);
      newLeads++;
    }

    await browser.close();

    storage.updateScanRun(runRecord.id, {
      status: "success",
      leadsFound: newLeads,
      finishedAt: new Date().toISOString(),
    });

    console.log(`[Nextdoor] Done — ${newLeads} new leads`);
  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    console.error("[Nextdoor] Error:", err.message);
    storage.updateScanRun(runRecord.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: err.message,
    });
  }

  return newLeads;
}
