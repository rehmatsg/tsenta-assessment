import { mkdir } from "node:fs/promises";
import process from "node:process";
import { chromium, type Page } from "playwright";
import { acmeHandler } from "./handlers/acme";
import { globexHandler } from "./handlers/globex";
import { sampleProfile } from "./profile";
import {
  LOW_OVERHEAD_PROFILE_NAME,
  createHumanLikeEngine,
} from "./utils/human-like";
import { createLogger, type RunSummaryItem } from "./utils/logger";
import type {
  ATSHandler,
  ATSHandlerContext,
  ATSRuntimeOptions,
  PlatformId,
} from "./handlers/types";
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
const runHeadless = resolveRunHeadless(); // Defaults to headless; use --headful to override.
const defaultRuntimeOptions: ATSRuntimeOptions = {
  features: {
    enableRetries: true,
    captureFailureScreenshots: true,
  },
  timeouts: {
    stepTransitionMs: 3000,
    sectionOpenMs: 2000,
    typeaheadMs: 3000,
    conditionalRevealMs: 2000,
    confirmationMs: 6000,
  },
  artifacts: {
    failureScreenshotDir: failureArtifactsDir,
  },
};

const handlers: ATSHandler[] = [acmeHandler, globexHandler];
const logger = createLogger();

function logStep(scope: string, message: string): void {
  logger.step(scope, message);
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

function buildFailureScreenshotPath(scope: string, artifactsDir: string): string {
  const scopeSlug = toScopeSlug(scope);
  return `${artifactsDir}/${scopeSlug}-${Date.now()}.png`;
}

function readHumanSeed(): string | undefined {
  const seed = process.env.HUMAN_SEED;
  return seed && seed.trim() ? seed.trim() : undefined;
}

function resolveRunHeadless(): boolean {
  const args = process.argv;
  const npmHeadfulFlag = process.env.npm_config_headful === "true";
  const hasHeadfulFlag = args.includes("--headful") || npmHeadfulFlag;
  const hasHeadlessFlag = args.includes("--headless");

  if (hasHeadlessFlag) {
    return true;
  }

  if (hasHeadfulFlag) {
    return false;
  }

  return true;
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
  const runtimeOptions = defaultRuntimeOptions;
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
      options: runtimeOptions,
    };

    await handler.fillForm(page, profile, handlerContext);
    const confirmationId = (await handler.submit(page, handlerContext)).trim();

    logger.success(scope, "Application flow finished successfully.");
    return {
      success: true,
      confirmationId,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    let screenshotPath: string | undefined;
    if (page && runtimeOptions.features.captureFailureScreenshots) {
      try {
        await mkdir(runtimeOptions.artifacts.failureScreenshotDir, {
          recursive: true,
        });
        const candidatePath = buildFailureScreenshotPath(
          scope,
          runtimeOptions.artifacts.failureScreenshotDir
        );
        await page.screenshot({ path: candidatePath, fullPage: true });
        screenshotPath = candidatePath;
        logger.info(scope, `Captured failure screenshot: ${candidatePath}`);
      } catch (screenshotError) {
        const screenshotMessage =
          screenshotError instanceof Error
            ? screenshotError.message
            : String(screenshotError);
        logger.warn(scope, `Failed to capture screenshot: ${screenshotMessage}`);
      }
    }

    logger.error(scope, `Application flow failed: ${errorMessage}`);
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

// ── Entry point ──────────────────────────────────────────────
async function main() {
  const runStartTime = Date.now();
  const targets = [
    { name: "Acme Corp", url: `${BASE_URL}/acme.html` },
    { name: "Globex Corporation", url: `${BASE_URL}/globex.html` },
  ];
  const summaryItems: RunSummaryItem[] = [];

  for (const target of targets) {
    logger.section(`Applying to ${target.name}`);

    try {
      const result = await applyToJob(target.url, sampleProfile);

      if (result.success) {
        logger.success("Runner", `${target.name}: application submitted.`);
        logger.info("Runner", `${target.name}: confirmation ${result.confirmationId}`);
        logger.info("Runner", `${target.name}: duration ${result.durationMs}ms`);
        summaryItems.push({
          targetName: target.name,
          success: true,
          durationMs: result.durationMs,
          confirmationId: result.confirmationId,
        });
      } else {
        logger.error("Runner", `${target.name}: failed - ${result.error}`);
        if (result.screenshotPath) {
          logger.warn("Runner", `${target.name}: screenshot ${result.screenshotPath}`);
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
      const fatalErrorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Runner", `${target.name}: fatal error - ${fatalErrorMessage}`);
      summaryItems.push({
        targetName: target.name,
        success: false,
        durationMs: 0,
        error: fatalErrorMessage,
      });
    }
  }

  const totalDurationMs = Date.now() - runStartTime;
  logger.printRunSummary(summaryItems, totalDurationMs);
}

main();
