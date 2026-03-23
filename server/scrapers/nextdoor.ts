import { chromium, type Browser, type BrowserContext } from "playwright";
import { storage } from "../storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority } from "../keywords";
import fs from "fs";
import path from "path";

// Where we persist the Nextdoor session so we don't need to log in every time
const SESSION_PATH = process.env.NEXTDOOR_SESSION_PATH || "/data/nextdoor-session.json";

// In-memory state for verification flow
let verificationState: {
  resolve: ((code: string) => void) | null;
  reject: ((err: Error) => void) | null;
  waiting: boolean;
  expiresAt: number;
} = { resolve: null, reject: null, waiting: false, expiresAt: 0 };

// Called by the API route when user submits the verification code
export function submitNextdoorCode(code: string) {
  if (verificationState.waiting && verificationState.resolve) {
    verificationState.resolve(code);
    verificationState.waiting = false;
  }
}

export function getNextdoorVerificationStatus() {
  return {
    waiting: verificationState.waiting && Date.now() < verificationState.expiresAt,
  };
}

async function waitForVerificationCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    verificationState.resolve = resolve;
    verificationState.reject = reject;
    verificationState.waiting = true;
    verificationState.expiresAt = Date.now() + 5 * 60 * 1000; // 5 min timeout

    // Auto-reject after 5 min
    setTimeout(() => {
      if (verificationState.waiting) {
        verificationState.waiting = false;
        reject(new Error("Verification code timed out — no code entered within 5 minutes"));
      }
    }, 5 * 60 * 1000);
  });
}

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
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    // Load saved session if it exists
    let context: BrowserContext;
    if (fs.existsSync(SESSION_PATH)) {
      console.log("[Nextdoor] Loading saved session...");
      const sessionData = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
      context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        storageState: sessionData,
      });
    } else {
      context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      });
    }

    const page = await context.newPage();

    // Check if session is still valid
    await page.goto("https://nextdoor.com/news_feed/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2000);

    const needsLogin = page.url().includes("login") || page.url().includes("signin");

    if (needsLogin) {
      console.log("[Nextdoor] Session expired or missing, logging in...");
      await page.goto("https://nextdoor.com/login/", { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);

      await page.fill('input[name="email"], input[type="email"], #id_email', email);
      await page.waitForTimeout(500);

      const nextBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Next")').first();
      await nextBtn.click();
      await page.waitForTimeout(2000);

      await page.fill('input[name="password"], input[type="password"]', password);
      await page.waitForTimeout(500);

      const loginBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
      await loginBtn.click();
      await page.waitForTimeout(4000);

      const urlAfterLogin = page.url();

      // Check if verification is needed
      const needsVerification =
        urlAfterLogin.includes("verify") ||
        urlAfterLogin.includes("confirmation") ||
        urlAfterLogin.includes("2fa") ||
        await page.locator('input[name="code"], input[placeholder*="code"], input[placeholder*="Code"]').count() > 0;

      if (needsVerification) {
        console.log("[Nextdoor] Verification code required — waiting for user input...");

        // Signal to the UI that we need a code
        const code = await waitForVerificationCode();
        console.log("[Nextdoor] Got verification code, submitting...");

        // Try to fill the verification code
        const codeInput = page.locator('input[name="code"], input[placeholder*="code"], input[placeholder*="Code"], input[type="text"], input[type="number"]').first();
        await codeInput.fill(code);
        await page.waitForTimeout(500);

        const submitBtn = page.locator('button[type="submit"], button:has-text("Verify"), button:has-text("Continue"), button:has-text("Submit")').first();
        await submitBtn.click();
        await page.waitForTimeout(4000);
      }

      // Check if fully logged in now
      const finalUrl = page.url();
      if (finalUrl.includes("login") || finalUrl.includes("verify")) {
        throw new Error("Login failed after verification — check credentials or try again");
      }

      // Save session for next time
      const sessionData = await context.storageState();
      fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true });
      fs.writeFileSync(SESSION_PATH, JSON.stringify(sessionData));
      console.log("[Nextdoor] Session saved — won't need to verify again");
    }

    console.log("[Nextdoor] Logged in, scanning Ask section...");

    await page.goto("https://nextdoor.com/news_feed/?post_type=ask", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(1000);
    }

    const posts = await page.evaluate(() => {
      const results: any[] = [];
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
