import { chromium, type Page } from "playwright";
import { sampleProfile } from "./profile";
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
const runHeadless = false; // Toggle to true when you want headless runs.

const experienceToGlobex: Record<UserProfile["experienceLevel"], string> = {
  "0-1": "intern",
  "1-3": "junior",
  "3-5": "mid",
  "5-10": "senior",
  "10+": "staff",
};

const educationToGlobex: Record<UserProfile["education"], string> = {
  "high-school": "hs",
  associates: "assoc",
  bachelors: "bs",
  masters: "ms",
  phd: "phd",
};

const referralToGlobex: Record<string, string> = {
  linkedin: "linkedin",
  "company-website": "website",
  "job-board": "board",
  referral: "referral",
  university: "university",
  other: "other",
};

const profileSkillToGlobex: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  react: "react",
  nodejs: "node",
  node: "node",
  sql: "sql",
  git: "git",
  docker: "docker",
  aws: "aws",
  graphql: "graphql",
};

function detectPlatform(url: string): "acme" | "globex" | null {
  if (url.includes("/acme.html")) {
    return "acme";
  }

  if (url.includes("/globex.html")) {
    return "globex";
  }

  return null;
}

function logStep(scope: string, message: string): void {
  console.log(`[${scope}] ${message}`);
}

async function clickStepContinue(page: Page, step: number): Promise<void> {
  await page
    .locator(`.form-step[data-step="${step}"] .btn-primary`)
    .first()
    .click();
}

async function fillAcmeForm(page: Page, profile: UserProfile): Promise<string> {
  logStep("Acme", "Step 1: filling personal information fields.");
  await page.fill("#first-name", profile.firstName);
  await page.fill("#last-name", profile.lastName);
  await page.fill("#email", profile.email);
  await page.fill("#phone", profile.phone);
  await page.fill("#location", profile.location);

  if (profile.linkedIn) {
    logStep("Acme", "LinkedIn profile provided, filling optional field.");
    await page.fill("#linkedin", profile.linkedIn);
  } else {
    logStep("Acme", "LinkedIn profile not provided, skipping optional field.");
  }

  if (profile.portfolio) {
    logStep("Acme", "Portfolio/GitHub provided, filling optional field.");
    await page.fill("#portfolio", profile.portfolio);
  } else {
    logStep("Acme", "Portfolio/GitHub not provided, skipping optional field.");
  }

  logStep("Acme", "Step 1 complete, continuing to step 2.");
  await clickStepContinue(page, 1);
  await page.waitForSelector('.form-step[data-step="2"].active');

  logStep("Acme", "Step 2: uploading resume and selecting experience/education.");
  await page.setInputFiles("#resume", resumePath);
  await page.selectOption("#experience-level", profile.experienceLevel);
  await page.selectOption("#education", profile.education);

  logStep("Acme", "Selecting school using typeahead.");
  await page.fill("#school", profile.school);
  const schoolOption = page.locator("#school-dropdown li", {
    hasText: profile.school,
  });
  await schoolOption.first().click();

  let selectedAcmeSkills = 0;
  for (const skill of profile.skills) {
    const skillCheckbox = page.locator(
      `input[name="skills"][value="${skill.toLowerCase()}"]`
    );
    if ((await skillCheckbox.count()) > 0) {
      await skillCheckbox.check();
      selectedAcmeSkills += 1;
    } else {
      logStep("Acme", `Skill "${skill}" not available on form, skipping.`);
    }
  }
  logStep("Acme", `Selected ${selectedAcmeSkills} matching skills.`);

  logStep("Acme", "Step 2 complete, continuing to step 3.");
  await clickStepContinue(page, 2);
  await page.waitForSelector('.form-step[data-step="3"].active');

  logStep("Acme", "Step 3: setting work authorization and additional questions.");
  await page.check(
    `input[name="workAuth"][value="${profile.workAuthorized ? "yes" : "no"}"]`
  );

  if (profile.workAuthorized) {
    logStep("Acme", "Work authorization is yes, setting visa sponsorship response.");
    await page.waitForSelector("#visa-sponsorship-group", { state: "visible" });
    await page.check(
      `input[name="visaSponsorship"][value="${
        profile.requiresVisa ? "yes" : "no"
      }"]`
    );
  } else {
    logStep("Acme", "Work authorization is no, visa sponsorship follow-up is not shown.");
  }

  await page.fill("#start-date", profile.earliestStartDate);

  if (profile.salaryExpectation) {
    logStep("Acme", "Salary expectation provided, filling field.");
    await page.fill("#salary-expectation", profile.salaryExpectation);
  } else {
    logStep("Acme", "Salary expectation not provided, leaving optional field empty.");
  }

  await page.selectOption("#referral", profile.referralSource);
  await page.fill("#cover-letter", profile.coverLetter);

  logStep("Acme", "Step 3 complete, continuing to review step.");
  await clickStepContinue(page, 3);
  await page.waitForSelector('.form-step[data-step="4"].active');

  logStep("Acme", "Step 4: agreeing to terms and submitting application.");
  await page.check("#terms-agree");
  await page.click("#submit-btn");

  logStep("Acme", "Waiting for success confirmation.");
  await page.waitForSelector("#success-page", { state: "visible" });
  const confirmation = (await page.locator("#confirmation-id").innerText()).trim();
  logStep("Acme", `Submission completed with confirmation ID ${confirmation}.`);
  return confirmation;
}

async function ensureGlobexSectionOpen(
  page: Page,
  sectionName: string
): Promise<void> {
  const header = page.locator(
    `.application-section[data-section="${sectionName}"] .section-header`
  );

  const className = (await header.getAttribute("class")) ?? "";
  if (!className.includes("open")) {
    await header.click();
  }
}

async function setGlobexToggle(
  page: Page,
  selector: string,
  shouldBeActive: boolean
): Promise<void> {
  const toggle = page.locator(selector);
  const currentValue = await toggle.getAttribute("data-value");
  const isActive = currentValue === "true";

  if (isActive !== shouldBeActive) {
    await toggle.click();
  }
}

function normalizeCity(location: string): string {
  const [city] = location.split(",");
  return city?.trim() || location.trim();
}

function normalizeSalary(rawSalary?: string): string {
  const defaultSalary = 80000;
  const parsedSalary = Number.parseInt(rawSalary ?? "", 10);
  const baseSalary = Number.isNaN(parsedSalary) ? defaultSalary : parsedSalary;
  const boundedSalary = Math.max(30000, Math.min(200000, baseSalary));
  const steppedSalary = Math.round(boundedSalary / 5000) * 5000;
  return String(steppedSalary);
}

async function fillGlobexSchool(page: Page, schoolName: string): Promise<void> {
  logStep("Globex", "Searching school with async typeahead.");
  const query = schoolName.slice(0, 8);
  await page.fill("#g-school", query);

  await page.waitForSelector("#g-school-results.open", { timeout: 6000 });

  const exactMatch = page.locator("#g-school-results li", { hasText: schoolName });
  if ((await exactMatch.count()) > 0) {
    logStep("Globex", "Exact school match found in results.");
    await exactMatch.first().click();
    return;
  }

  logStep("Globex", "Exact school match not found, selecting first available result.");
  const fallbackOption = page.locator(
    "#g-school-results li:not(.typeahead-no-results)"
  );
  await fallbackOption.first().click();
}

async function fillGlobexForm(page: Page, profile: UserProfile): Promise<string> {
  logStep("Globex", "Section contact: filling personal/contact fields.");
  await ensureGlobexSectionOpen(page, "contact");
  await page.fill("#g-fname", profile.firstName);
  await page.fill("#g-lname", profile.lastName);
  await page.fill("#g-email", profile.email);
  await page.fill("#g-phone", profile.phone);
  await page.fill("#g-city", normalizeCity(profile.location));

  if (profile.linkedIn) {
    logStep("Globex", "LinkedIn profile provided, filling optional field.");
    await page.fill("#g-linkedin", profile.linkedIn);
  } else {
    logStep("Globex", "LinkedIn profile not provided, skipping optional field.");
  }

  if (profile.portfolio) {
    logStep("Globex", "Portfolio/GitHub provided, filling optional field.");
    await page.fill("#g-website", profile.portfolio);
  } else {
    logStep("Globex", "Portfolio/GitHub not provided, skipping optional field.");
  }

  logStep("Globex", "Section qualifications: uploading resume and selecting qualification data.");
  await ensureGlobexSectionOpen(page, "qualifications");
  await page.setInputFiles("#g-resume", resumePath);
  await page.selectOption("#g-experience", experienceToGlobex[profile.experienceLevel]);
  await page.selectOption("#g-degree", educationToGlobex[profile.education]);
  await fillGlobexSchool(page, profile.school);

  let selectedGlobexSkills = 0;
  for (const skill of profile.skills) {
    const mappedSkill = profileSkillToGlobex[skill.toLowerCase()];
    if (!mappedSkill) {
      logStep("Globex", `Skill "${skill}" has no mapping for Globex chips, skipping.`);
      continue;
    }

    const chip = page.locator(`#g-skills .chip[data-skill="${mappedSkill}"]`);
    if ((await chip.count()) === 0) {
      logStep("Globex", `Mapped skill "${mappedSkill}" not present in UI, skipping.`);
      continue;
    }

    const chipClass = (await chip.getAttribute("class")) ?? "";
    if (!chipClass.includes("selected")) {
      await chip.click();
      selectedGlobexSkills += 1;
    }
  }
  logStep("Globex", `Selected ${selectedGlobexSkills} matching skills.`);

  logStep("Globex", "Section additional: setting authorization, compensation, source, and motivation.");
  await ensureGlobexSectionOpen(page, "additional");
  await setGlobexToggle(page, "#g-work-auth-toggle", profile.workAuthorized);

  if (profile.workAuthorized) {
    logStep("Globex", "Work authorization is true, evaluating visa toggle.");
    await page.waitForSelector("#g-visa-block.visible", { timeout: 2000 });
    await setGlobexToggle(page, "#g-visa-toggle", profile.requiresVisa);
  } else {
    logStep("Globex", "Work authorization is false, visa toggle section is not applicable.");
  }

  await page.fill("#g-start-date", profile.earliestStartDate);

  const salaryValue = normalizeSalary(profile.salaryExpectation);
  logStep("Globex", `Normalized salary for slider set to ${salaryValue}.`);
  await page.locator("#g-salary").evaluate((el, value) => {
    const salaryInput = el as HTMLInputElement;
    salaryInput.value = value;
    salaryInput.dispatchEvent(new Event("input", { bubbles: true }));
    salaryInput.dispatchEvent(new Event("change", { bubbles: true }));
  }, salaryValue);

  const sourceValue = referralToGlobex[profile.referralSource] ?? "other";
  logStep("Globex", `Referral source mapped to "${sourceValue}".`);
  await page.selectOption("#g-source", sourceValue);

  if (sourceValue === "other") {
    logStep("Globex", "Referral mapped to other, filling source details.");
    await page.waitForSelector("#g-source-other-block.visible", { timeout: 2000 });
    await page.fill("#g-source-other", profile.referralSource);
  }

  await page.fill("#g-motivation", profile.coverLetter);

  logStep("Globex", "Checking consent and submitting application.");
  await page.check("#g-consent");
  await page.click("#globex-submit");
  logStep("Globex", "Waiting for confirmation section.");
  await page.waitForSelector("#globex-confirmation", { state: "visible" });

  const reference = (await page.locator("#globex-ref").innerText()).trim();
  logStep("Globex", `Submission completed with reference ${reference}.`);
  return reference;
}

async function applyToJob(
  url: string,
  profile: UserProfile
): Promise<ApplicationResult> {
  const startTime = Date.now();
  const platform = detectPlatform(url);
  if (!platform) {
    return {
      success: false,
      error: `Unsupported ATS URL: ${url}`,
      durationMs: Date.now() - startTime,
    };
  }

  logStep(
    platform === "acme" ? "Acme" : "Globex",
    `Launching browser in ${runHeadless ? "headless" : "headed"} mode.`
  );
  const browser = await chromium.launch({ headless: runHeadless });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    logStep(platform === "acme" ? "Acme" : "Globex", `Navigating to ${url}.`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    let confirmationId = "";
    if (platform === "acme") {
      confirmationId = (await fillAcmeForm(page, profile)).trim();
    } else {
      confirmationId = (await fillGlobexForm(page, profile)).trim();
    }

    logStep(platform === "acme" ? "Acme" : "Globex", "Application flow finished successfully.");
    return {
      success: true,
      confirmationId,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logStep(platform === "acme" ? "Acme" : "Globex", `Application flow failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  } finally {
    await browser.close();
  }
}

// ── Entry point ──────────────────────────────────────────────
async function main() {
  const targets = [
    { name: "Acme Corp", url: `${BASE_URL}/acme.html` },
    { name: "Globex Corporation", url: `${BASE_URL}/globex.html` },
  ];

  for (const target of targets) {
    console.log(`\n--- Applying to ${target.name} ---`);

    try {
      const result = await applyToJob(target.url, sampleProfile);

      if (result.success) {
        console.log(`  Application submitted!`);
        console.log(`  Confirmation: ${result.confirmationId}`);
        console.log(`  Duration: ${result.durationMs}ms`);
      } else {
        console.error(`  Failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`  Fatal error:`, err);
    }
  }
}

main();
