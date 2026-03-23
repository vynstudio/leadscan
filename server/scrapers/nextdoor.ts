import { chromium, type Browser, type BrowserContext } from "playwright";
import { storage } from "../storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority } from "../keywords";
import fs from "fs";
import path from "path";

const SESSION_PATH = process.env.NEXTDOOR_SESSION_PATH || "/data/nextdoor-session.json";

let verificationState: {
  resolve: ((code: string) => void) | null;
  reject: ((err: Error) => void) | null;
  waiting: boolean;
  expiresAt: number;
  lastUrl: string;
} = { resolve: null, reject: null, waiting: false, expiresAt: 0, lastUrl: "" };

export function submitNextdoorCode(code: string) {
  if (verificationState.waiting && verificationState.resolve) {
    verificationState.resolve(code);
    verificationState.waiting = false;
  }
}

export function getNextdoorVerificationStatus() {
  return {
    waiting: verificationState.waiting && Date.now() < verificationState.expiresAt,
    lastUrl: verificationState.lastUrl,
  };
}

function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    verificationState.resolve = resolve;
    verificationState.reject = reject;
    verificationState.waiting = true;
    verificationState.expiresAt = Date.now() + 10 * 60 * 1000;
    setTimeout(() => {
      if (verificationState.waiting) {
        verificationState.waiting = false;
        reject(new Error("Verification timed out"));
      }
    }, 10 * 60 * 1000);
  });
}

export async function scanNextdoorReal(): Promise<number> {
  const email = process.env.NEXTDOOR_EMAIL;
  const password = process.env.NEXTDOOR_PASSWORD;

  if (!email || !password) {
    console.log("[Nextdoor] No credentials — skipping");
    return 0;
  }

  if (verificationState.waiting && Date.now() < verificationState.expiresAt) {
    console.log("[Nextdoor] Waiting for verification code — skipping scan");
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

    let context: BrowserContext;
    if (fs.existsSync(SESSION_PATH)) {
      console.log("[Nextdoor] Loading saved session...");
      try {
        const saved = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
        context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          viewport: { width: 1280, height: 800 },
          storageState: saved,
        });
      } catch {
        fs.unlinkSync(SESSION_PATH);
        context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          viewport: { width: 1280, height: 800 },
        });
      }
    } else {
      context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      });
    }

    const page = await context.newPage();

    // Check if session is valid
    await page.goto("https://nextdoor.com/news_feed/", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3000);
    console.log(`[Nextdoor] Session check URL: ${page.url()}`);

    const isLoggedIn = page.url().includes("news_feed") || page.url().includes("home");

    if (!isLoggedIn) {
      console.log("[Nextdoor] Logging in...");

      // Step 1: Go to login page and enter email
      await page.goto("https://nextdoor.com/login/", { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      console.log(`[Nextdoor] Login page: ${page.url()}`);

      // Wait for email field
      await page.waitForSelector('input[type="email"], input[name="email"], #id_email', { timeout: 10000 });
      await page.fill('input[type="email"], input[name="email"], #id_email', email);
      console.log("[Nextdoor] Filled email");
      await page.waitForTimeout(800);

      // Click Continue/Next (first submit — just submits email)
      await page.click('button[type="submit"]');
      console.log("[Nextdoor] Clicked submit after email");
      await page.waitForTimeout(3000);
      console.log(`[Nextdoor] After email submit: ${page.url()}`);

      // Step 2: Wait for password field to appear
      try {
        await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 8000 });
        console.log("[Nextdoor] Password field appeared");
        await page.fill('input[type="password"], input[name="password"]', password);
        console.log("[Nextdoor] Filled password");
        await page.waitForTimeout(500);

        await page.click('button[type="submit"]');
        console.log("[Nextdoor] Clicked submit after password");
        await page.waitForTimeout(5000);
        console.log(`[Nextdoor] After password submit: ${page.url()}`);
      } catch {
        // Password might be on same page — try pressing Enter
        console.log("[Nextdoor] Password field timeout, trying Enter key");
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);
        await page.fill('input[type="password"], input[name="password"]', password);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(5000);
        console.log(`[Nextdoor] After Enter: ${page.url()}`);
      }

      const postLoginUrl = page.url();
      const pageText = (await page.textContent("body").catch(() => "")) || "";

      // Check if verification needed
      const needsVerification =
        postLoginUrl.includes("verify") ||
        postLoginUrl.includes("2fa") ||
        postLoginUrl.includes("confirmation") ||
        postLoginUrl.includes("check") ||
        pageText.toLowerCase().includes("verification code") ||
        pageText.toLowerCase().includes("we sent you a code") ||
        pageText.toLowerCase().includes("enter the code") ||
        pageText.toLowerCase().includes("check your email") ||
        pageText.toLowerCase().includes("check your phone") ||
        await page.locator('input[placeholder*="code" i], input[name="code"], input[maxlength="6"]').count() > 0;

      if (needsVerification) {
        console.log(`[Nextdoor] Verification needed. URL: ${postLoginUrl}`);
        verificationState.lastUrl = postLoginUrl;

        const code = await waitForCode();
        console.log("[Nextdoor] Got code, submitting...");

        // Try multiple ways to enter the code
        const codeSelectors = [
          'input[name="code"]',
          'input[placeholder*="code" i]',
          'input[maxlength="6"]',
          'input[maxlength="4"]',
          'input[type="tel"]',
          'input[inputmode="numeric"]',
          'input[type="text"]:visible',
          'input[type="number"]',
        ];

        let filled = false;
        for (const sel of codeSelectors) {
          try {
            const el = page.locator(sel).first();
            if (await el.count() > 0) {
              await el.click();
              await el.fill(code);
              filled = true;
              console.log(`[Nextdoor] Filled code with: ${sel}`);
              break;
            }
          } catch {}
        }

        if (!filled) {
          await page.keyboard.type(code);
          console.log("[Nextdoor] Typed code via keyboard");
        }

        await page.waitForTimeout(500);

        // Click verify/submit
        for (const sel of ['button[type="submit"]', 'button:has-text("Verify")', 'button:has-text("Continue")', 'button:has-text("Submit")', 'button:has-text("Confirm")']) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.count() > 0) {
              await btn.click();
              console.log(`[Nextdoor] Clicked: ${sel}`);
              break;
            }
          } catch {}
        }

        await page.waitForTimeout(5000);
        console.log(`[Nextdoor] Post-verification URL: ${page.url()}`);
      }

      // Final login check
      const finalUrl = page.url();
      if (finalUrl.includes("login") || finalUrl.includes("verify") || finalUrl.includes("signin")) {
        // Delete bad session if it exists
        if (fs.existsSync(SESSION_PATH)) fs.unlinkSync(SESSION_PATH);
        throw new Error(`Login failed — still on: ${finalUrl}`);
      }

      // Save session
      try {
        const sessionData = await context.storageState();
        fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true });
        fs.writeFileSync(SESSION_PATH, JSON.stringify(sessionData));
        console.log("[Nextdoor] ✓ Session saved");
      } catch (e) {
        console.log("[Nextdoor] Could not save session:", e);
      }
    }

    // Scan feed
    console.log("[Nextdoor] Scanning for leads...");
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
        const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="subject"]');
        const bodyEl = card.querySelector('p, [class*="body"], [class*="content"]');
        const linkEl = card.querySelector('a[href*="/p/"], a[href*="/posts/"]');
        const authorEl = card.querySelector('[class*="author"], [class*="name"]');
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

    console.log(`[Nextdoor] Found ${posts.length} posts`);

    for (const post of posts) {
      const fullText = `${post.title} ${post.body}`;
      const category = detectCategory(fullText);
      if (category === "other") continue;
      const requestWords = ["looking for", "need", "recommend", "hire", "help", "find", "anyone", "suggest"];
      if (!requestWords.some(w => fullText.toLowerCase().includes(w))) continue;
      if (post.url && storage.leadExistsByUrl(post.url)) continue;
      storage.createLead({
        title: post.title.slice(0, 200),
        description: post.body || post.title,
        source: "nextdoor",
        sourceUrl: post.url,
        category,
        location: storage.getSetting("city") || "Orlando, FL",
        contactName: post.author || undefined,
        status: "new",
        priority: detectPriority(fullText),
        postedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
      });
      newLeads++;
    }

    await browser.close();
    storage.updateScanRun(runRecord.id, { status: "success", leadsFound: newLeads, finishedAt: new Date().toISOString() });
    console.log(`[Nextdoor] Done — ${newLeads} new leads`);

  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    console.error("[Nextdoor] Error:", err.message);
    storage.updateScanRun(runRecord.id, { status: "failed", finishedAt: new Date().toISOString(), errorMessage: err.message });
  }

  return newLeads;
}
