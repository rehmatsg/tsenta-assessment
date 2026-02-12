import { chromium, type Page } from "playwright";
import { acmeHandler } from "./handlers/acme";
import { globexHandler } from "./handlers/globex";
import { sampleProfile } from "./profile";
import {
  LOW_OVERHEAD_PROFILE_NAME,
  createHumanLikeEngine,
} from "./utils/human-like";
import type { ATSHandler, ATSHandlerContext, PlatformId } from "./handlers/types";
import type { ApplicationResult, UserProfile } from "./types";

/**
 * ============================================================
 * TSENTA TAKE-HOME ASSESSMENT - ATS Form Automator
 * ============================================================
 *
 * Your task: Build an automation system that can fill out job
 * application forms across MULTIPLE ATS platforms using Playwright.
 *
 * There are two mock forms to automate:
 *
 *   1. Acme Corp    → http://localhost:3939/acme.html
 *      Multi-step form with progress bar, typeahead, checkboxes,
 *      radio buttons, conditional fields, file upload
 *
 *   2. Globex Corp  → http://localhost:3939/globex.html
 *      Single-page accordion form with toggle switches, chip
 *      selectors, salary slider, datalist, different selectors
 *
 * Your code should handle BOTH forms with a shared architecture.
 * Read the README for full instructions and evaluation criteria.
 */

const BASE_URL = "http://localhost:3939";
const resumePath = "fixtures/sample-resume.pdf";
const failureArtifactsDir = "artifacts/failures";
const runHeadless = false; // Toggle to true when you want headless runs.

const handlers: ATSHandler[] = [acmeHandler, globexHandler];

function logStep(scope: string, message: string): void {
  console.log(`[${scope}] ${message}`);
}

function platformToScope(platform: PlatformId): string {
  return platform === "acme" ? "Acme" : "Globex";
}

function inferScopeFromUrl(url: string): string {
  if (url.includes("/acme.html")) {
    return "Acme";
  }

  if (url.includes("/globex.html")) {
    return "Globex";
  }

  return "Automator";
}

function toScopeSlug(scope: string): string {
  const normalized = scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "automator";
}

function buildFailureScreenshotPath(scope: string): string {
  const scopeSlug = toScopeSlug(scope);
  return `${failureArtifactsDir}/${scopeSlug}-${Date.now()}.png`;
}

function readHumanSeed(): string | undefined {
  const runtimeProcess = (
    globalThis as {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process;
  const seed = runtimeProcess?.env?.HUMAN_SEED;
  return seed && seed.trim() ? seed.trim() : undefined;
}

async function detectHandler(url: string, page: Page): Promise<ATSHandler | null> {
  for (const handler of handlers) {
    if (await handler.matches(url, page)) {
      return handler;
    }
  }

  return null;
}

async function applyToJob(
  url: string,
  profile: UserProfile
): Promise<ApplicationResult> {
  const startTime = Date.now();
  let scope = inferScopeFromUrl(url);
  const baseSeed = readHumanSeed();
  const scopedSeed = baseSeed ? `${baseSeed}:${url}` : undefined;
  const human = createHumanLikeEngine(scopedSeed);
  let page: Page | null = null;

  logStep(scope, `Launching browser in ${runHeadless ? "headless" : "headed"} mode.`);
  logStep(
    scope,
    `Human-like profile: ${LOW_OVERHEAD_PROFILE_NAME}, seed mode: ${
      scopedSeed ? "seeded" : "random"
    }.`
  );
  const browser = await chromium.launch({ headless: runHeadless });

  try {
    const browserContext = await browser.newContext();
    page = await browserContext.newPage();
    logStep(scope, `Navigating to ${url}.`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const handler = await detectHandler(url, page);
    if (!handler) {
      throw new Error(`Unsupported ATS URL: ${url}`);
    }

    scope = platformToScope(handler.platform);
    const handlerContext: ATSHandlerContext = {
      resumePath,
      logStep,
      human,
    };

    await handler.fillForm(page, profile, handlerContext);
    const confirmationId = (await handler.submit(page, handlerContext)).trim();

    logStep(scope, "Application flow finished successfully.");
    return {
      success: true,
      confirmationId,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    let screenshotPath: string | undefined;
    if (page) {
      const candidatePath = buildFailureScreenshotPath(scope);
      try {
        await page.screenshot({ path: candidatePath, fullPage: true });
        screenshotPath = candidatePath;
        logStep(scope, `Captured failure screenshot: ${candidatePath}`);
      } catch (screenshotError) {
        const screenshotMessage =
          screenshotError instanceof Error
            ? screenshotError.message
            : String(screenshotError);
        logStep(scope, `Failed to capture screenshot: ${screenshotMessage}`);
      }
    }

    logStep(scope, `Application flow failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      screenshotPath,
      durationMs: Date.now() - startTime,
    };
  } finally {
    await browser.close();
  }
}

type RunSummaryItem = {
  targetName: string;
  success: boolean;
  durationMs: number;
  confirmationId?: string;
  error?: string;
  screenshotPath?: string;
};

function printRunSummary(
  summaryItems: RunSummaryItem[],
  totalDurationMs: number
): void {
  const successCount = summaryItems.filter((item) => item.success).length;
  const failureCount = summaryItems.length - successCount;

  console.log("\n=== Run Summary ===");
  console.log(`Targets: ${summaryItems.length}`);
  console.log(`Successes: ${successCount}`);
  console.log(`Failures: ${failureCount}`);
  console.log(`Total Duration: ${totalDurationMs}ms`);

  for (const item of summaryItems) {
    if (item.success) {
      console.log(
        `- ${item.targetName}: success (${item.durationMs}ms, confirmation=${item.confirmationId})`
      );
      continue;
    }

    console.log(
      `- ${item.targetName}: failed (${item.durationMs}ms, error=${item.error ?? "unknown"})`
    );
    if (item.screenshotPath) {
      console.log(`  screenshot=${item.screenshotPath}`);
    }
  }
}

// ── Entry point ──────────────────────────────────────────────
async function main() {
  const runStartTime = Date.now();
  const targets = [
    { name: "Acme Corp", url: `${BASE_URL}/acme.html` },
    { name: "Globex Corporation", url: `${BASE_URL}/globex.html` },
  ];
  const summaryItems: RunSummaryItem[] = [];

  for (const target of targets) {
    console.log(`\n--- Applying to ${target.name} ---`);

    try {
      const result = await applyToJob(target.url, sampleProfile);

      if (result.success) {
        console.log(`  Application submitted!`);
        console.log(`  Confirmation: ${result.confirmationId}`);
        console.log(`  Duration: ${result.durationMs}ms`);
        summaryItems.push({
          targetName: target.name,
          success: true,
          durationMs: result.durationMs,
          confirmationId: result.confirmationId,
        });
      } else {
        console.error(`  Failed: ${result.error}`);
        if (result.screenshotPath) {
          console.error(`  Screenshot: ${result.screenshotPath}`);
        }
        summaryItems.push({
          targetName: target.name,
          success: false,
          durationMs: result.durationMs,
          error: result.error,
          screenshotPath: result.screenshotPath,
        });
      }
    } catch (err) {
      console.error(`  Fatal error:`, err);
      summaryItems.push({
        targetName: target.name,
        success: false,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totalDurationMs = Date.now() - runStartTime;
  printRunSummary(summaryItems, totalDurationMs);
}

main();
