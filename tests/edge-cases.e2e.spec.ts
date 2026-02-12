import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "playwright";
import { acmeHandler } from "@/handlers/acme";
import { globexHandler } from "@/handlers/globex";
import type {
  ATSHandler,
  ATSHandlerContext,
  ATSRuntimeOptions,
  HumanLikeEngine,
} from "@/handlers/types";
import { sampleProfile } from "@/profile";
import type { UserProfile } from "@/types";

const baseUrl = "http://localhost:3939";

const runtimeOptions: ATSRuntimeOptions = {
  features: {
    enableRetries: true,
    captureFailureScreenshots: false,
    captureVideo: false,
  },
  timeouts: {
    stepTransitionMs: 3000,
    sectionOpenMs: 2000,
    typeaheadMs: 3000,
    conditionalRevealMs: 2000,
    confirmationMs: 6000,
  },
  artifacts: {
    failureScreenshotDir: "artifacts/failures",
    videoDir: "artifacts/videos",
  },
};

function createFastHuman(): HumanLikeEngine {
  return {
    async pause(): Promise<void> {
      return;
    },
    async typeText(page, selector, value): Promise<void> {
      await page.locator(selector).first().fill(value);
    },
    async hoverAndClick(page, selector): Promise<void> {
      await page.locator(selector).first().click();
    },
    async scrollIntoView(page, selector): Promise<void> {
      await page.locator(selector).first().scrollIntoViewIfNeeded();
    },
  };
}

async function runWithProfile(args: {
  browser: Browser;
  url: string;
  handler: ATSHandler;
  profile: UserProfile;
  beforeSubmit?: (context: {
    page: Page;
    logs: string[];
  }) => Promise<void>;
}): Promise<{ confirmation: string; logs: string[] }> {
  const { browser, url, handler, profile, beforeSubmit } = args;
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  const logs: string[] = [];

  const handlerContext: ATSHandlerContext = {
    resumePath: path.join(process.cwd(), "fixtures/sample-resume.pdf"),
    logStep: (scope: string, message: string): void => {
      logs.push(`[${scope}] ${message}`);
    },
    human: createFastHuman(),
    options: runtimeOptions,
    measureStep: async <T>(scope: string, step: string, action: () => Promise<T>) => {
      logs.push(`[${scope}] Start: ${step}.`);
      const result = await action();
      logs.push(`[${scope}] Done: ${step}.`);
      return result;
    },
  };

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await handler.fillForm(page, profile, handlerContext);

    if (beforeSubmit) {
      await beforeSubmit({ page, logs });
    }

    const confirmation = await handler.submit(page, handlerContext);
    return { confirmation, logs };
  } finally {
    await browserContext.close();
  }
}

test.describe("ATS edge-case coverage", () => {
  test("Acme fills referral details when referral maps to other", async ({
    browser,
  }) => {
    const profile: UserProfile = {
      ...sampleProfile,
      referralSource: "friend-from-meetup",
    };

    const result = await runWithProfile({
      browser,
      url: `${baseUrl}/acme.html`,
      handler: acmeHandler,
      profile,
      beforeSubmit: async ({ page }) => {
        await expect(page.locator("#referral")).toHaveValue("other");
        await expect(page.locator("#referral-other")).toHaveValue(
          "friend-from-meetup"
        );
      },
    });

    expect(result.confirmation).toMatch(/^ACM-/);
    expect(
      result.logs.some((entry) =>
        entry.includes("Referral source is other, filling additional referral details.")
      )
    ).toBe(true);
  });

  test("Globex keeps submission safe when skills contain unknown values", async ({
    browser,
  }) => {
    const profile: UserProfile = {
      ...sampleProfile,
      skills: [...sampleProfile.skills, "fortran"],
    };

    const result = await runWithProfile({
      browser,
      url: `${baseUrl}/globex.html`,
      handler: globexHandler,
      profile,
    });

    expect(result.confirmation).toMatch(/^GX-/);
    expect(
      result.logs.some((entry) =>
        entry.includes('Skill "fortran" has no mapping for Globex chips, skipping.')
      )
    ).toBe(true);
  });

  test("Globex falls back to first school result when exact match is unavailable", async ({
    browser,
  }) => {
    const profile: UserProfile = {
      ...sampleProfile,
      school: "Stanford University School of Engineering",
    };

    const result = await runWithProfile({
      browser,
      url: `${baseUrl}/globex.html`,
      handler: globexHandler,
      profile,
    });

    expect(result.confirmation).toMatch(/^GX-/);
    expect(
      result.logs.some((entry) =>
        entry.includes(
          "Exact school match not found, selecting first available result."
        )
      )
    ).toBe(true);
  });
});
