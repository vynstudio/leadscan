import { chromium, type Browser, type BrowserContext } from "playwright";
import { storage } from "../storage";
import type { InsertLead } from "@shared/schema";
import { detectCategory, detectPriority } from "../keywords";
import fs from "fs";
import path from "path";

const SESSION_PATH = process.env.NEXTDOOR_SESSION_PATH || "/data/nextdoor-session.json";

// In-memory verification state
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
    verificationState.expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

    setTimeout(() => {
      if (verificationState.waiting) {
        verificationState.waiting = false;
        reject(new Error("Verification timed out — no code entered within 10 minutes"));
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

  // Don't start a new scan if we're waiting for verification
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

    // Try loading saved session first
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

    // Go straight to feed — if session is valid we're done
    console.log("[Nextdoor] Checking session...");
    await page.goto("https://nextdoor.com/news_feed/", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`[Nextdoor] URL after session check: ${currentUrl}`);

    const isLoggedIn = !currentUrl.includes("login") &&
      !currentUrl.includes("signin") &&
      !currentUrl.includes("nextdoor.com/?");

    if (!isLoggedIn) {
      console.log("[Nextdoor] Not logged in, attempting login...");

      await page.goto("https://nextdoor.com/login/", { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      console.log(`[Nextdoor] Login page URL: ${page.url()}`);

      // Fill email
      try {
        await page.waitForSelector('input[name="email"], input[type="email"], #id_email', { timeout: 8000 });
        await page.fill('input[name="email"], input[type="email"], #id_email', email);
        await page.waitForTimeout(800);
      } catch (e) {
        throw new Error(`Could not find email field. URL: ${page.url()}`);
      }

      // Click Next/Continue
      try {
        const nextBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Next"), button:has-text("Log in")').first();
        await nextBtn.click();
        await page.waitForTimeout(2000);
      } catch {}

      // Fill password if field appeared
      const pwField = page.locator('input[name="password"], input[type="password"]');
      if (await pwField.count() > 0) {
        await pwField.fill(password);
        await page.waitForTimeout(500);
        const loginBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
        await loginBtn.click();
        await page.waitForTimeout(5000);
      }

      const postLoginUrl = page.url();
      console.log(`[Nextdoor] Post-login URL: ${postLoginUrl}`);

      // Detect verification screen
      const pageText = await page.textContent("body").catch(() => "");
      const needsVerification =
        postLoginUrl.includes("verify") ||
        postLoginUrl.includes("confirmation") ||
        postLoginUrl.includes("2fa") ||
        postLoginUrl.includes("code") ||
        postLoginUrl.includes("check") ||
        (pageText || "").toLowerCase().includes("verification code") ||
        (pageText || "").toLowerCase().includes("we sent") ||
        (pageText || "").toLowerCase().includes("enter the code") ||
        await page.locator('input[placeholder*="code" i], input[placeholder*="Code"], input[name="code"]').count() > 0;

      if (needsVerification) {
        console.log(`[Nextdoor] Verification required. URL: ${postLoginUrl}`);
        verificationState.lastUrl = postLoginUrl;

        const code = await waitForCode();
        console.log("[Nextdoor] Submitting verification code...");

        // Find and fill the code input
        const codeSelectors = [
          'input[placeholder*="code" i]',
          'input[name="code"]',
          'input[type="tel"]',
          'input[type="number"]',
          'input[inputmode="numeric"]',
          'input[maxlength="6"]',
          'input[maxlength="4"]',
        ];

        let filled = false;
        for (const sel of codeSelectors) {
          try {
            const el = page.locator(sel).first();
            if (await el.count() > 0) {
              await el.fill(code);
              filled = true;
              console.log(`[Nextdoor] Filled code using selector: ${sel}`);
              break;
            }
          } catch {}
        }

        if (!filled) {
          // Last resort: type the code into whatever focused input is there
          await page.keyboard.type(code);
        }

        await page.waitForTimeout(500);

        // Submit
        const submitSelectors = [
          'button[type="submit"]',
          'button:has-text("Verify")',
          'button:has-text("Continue")',
          'button:has-text("Submit")',
          'button:has-text("Confirm")',
        ];
        for (const sel of submitSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.count() > 0) {
              await btn.click();
              console.log(`[Nextdoor] Clicked submit: ${sel}`);
              break;
            }
          } catch {}
        }

        await page.waitForTimeout(5000);
        console.log(`[Nextdoor] Post-verification URL: ${page.url()}`);
      }

      // Final check
      const finalUrl = page.url();
      if (finalUrl.includes("login") || finalUrl.includes("verify") || finalUrl.includes("signin")) {
        throw new Error(`Login failed — still on: ${finalUrl}`);
      }

      // Save session
      try {
        const sessionData = await context.storageState();
        fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true });
        fs.writeFileSync(SESSION_PATH, JSON.stringify(sessionData));
        console.log("[Nextdoor] Session saved to disk");
      } catch (e) {
        console.log("[Nextdoor] Could not save session:", e);
      }
    }

    console.log("[Nextdoor] Scanning feed...");
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
