import type { Page } from "playwright";
import type { ATSHandler, ATSHandlerContext } from "./types";
import type { UserProfile } from "../types";
import {
  fillOptionalText,
  fillText,
  selectValue,
  setFile,
  setToggleState,
  waitForRequiredSelector,
} from "../utils/field-filler";
import { withRetry } from "../utils/retry";

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

const globexTypeaheadRetry = {
  attempts: 3,
  initialDelayMs: 180,
  backoffMultiplier: 1.6,
} as const;

const globexSectionOpenRetry = {
  attempts: 2,
  initialDelayMs: 100,
  backoffMultiplier: 1.3,
} as const;

const globexSubmitRetry = {
  attempts: 2,
  initialDelayMs: 180,
  backoffMultiplier: 1.6,
} as const;

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

async function fillGlobexSchool(
  page: Page,
  schoolName: string,
  context: ATSHandlerContext
): Promise<void> {
  context.logStep("Globex", "Searching school with async typeahead.");
  await withRetry(
    async () => {
      const query = schoolName.slice(0, 8);
      await context.human.typeText(page, "#g-school", query);
      await context.human.pause(40, 120);

      await waitForRequiredSelector(
        page,
        "#g-school-results.open",
        6000,
        "Globex school results dropdown did not open"
      );

      const exactMatch = page.locator("#g-school-results li", { hasText: schoolName });
      if ((await exactMatch.count()) > 0) {
        context.logStep("Globex", "Exact school match found in results.");
        await exactMatch.first().click();
        return;
      }

      context.logStep(
        "Globex",
        "Exact school match not found, selecting first available result."
      );
      const fallbackOption = page.locator(
        "#g-school-results li:not(.typeahead-no-results)"
      );
      if ((await fallbackOption.count()) === 0) {
        throw new Error("No selectable school options found in Globex dropdown");
      }
      await fallbackOption.first().click();
      await context.human.pause(40, 120);
    },
    {
      ...globexTypeaheadRetry,
      scope: "Globex",
      step: "select school suggestion",
    },
    context.logStep
  );
}

async function ensureSectionOpenWithHuman(
  page: Page,
  sectionSelector: string,
  openClass: string,
  sectionName: string,
  context: ATSHandlerContext
): Promise<void> {
  await withRetry(
    async () => {
      const sectionHeader = page.locator(sectionSelector).first();
      const className = (await sectionHeader.getAttribute("class")) ?? "";
      if (!className.includes(openClass)) {
        await context.human.hoverAndClick(page, sectionSelector);
      }

      const updatedClassName = (await sectionHeader.getAttribute("class")) ?? "";
      if (!updatedClassName.includes(openClass)) {
        throw new Error(`Globex section "${sectionName}" did not open`);
      }
    },
    {
      ...globexSectionOpenRetry,
      scope: "Globex",
      step: `open ${sectionName} section`,
    },
    context.logStep
  );
}

export const globexHandler: ATSHandler = {
  platform: "globex",
  async matches(url: string, page: Page): Promise<boolean> {
    if (url.includes("/globex.html")) {
      return true;
    }

    const hasForm = (await page.locator("#globex-form").count()) > 0;
    const hasSections = (await page.locator(".application-section").count()) > 0;
    return hasForm && hasSections;
  },
  async fillForm(
    page: Page,
    profile: UserProfile,
    context: ATSHandlerContext
  ): Promise<void> {
    context.logStep("Globex", "Section contact: filling personal/contact fields.");
    await ensureSectionOpenWithHuman(
      page,
      '.application-section[data-section="contact"] .section-header',
      "open",
      "contact",
      context
    );
    await context.human.typeText(page, "#g-fname", profile.firstName);
    await context.human.typeText(page, "#g-lname", profile.lastName);
    await context.human.typeText(page, "#g-email", profile.email);
    await context.human.typeText(page, "#g-phone", profile.phone);
    await context.human.typeText(page, "#g-city", normalizeCity(profile.location));

    if (profile.linkedIn) {
      context.logStep("Globex", "LinkedIn profile provided, filling optional field.");
      await fillOptionalText(page, "#g-linkedin", profile.linkedIn);
    } else {
      context.logStep("Globex", "LinkedIn profile not provided, skipping optional field.");
    }

    if (profile.portfolio) {
      context.logStep("Globex", "Portfolio/GitHub provided, filling optional field.");
      await fillOptionalText(page, "#g-website", profile.portfolio);
    } else {
      context.logStep(
        "Globex",
        "Portfolio/GitHub not provided, skipping optional field."
      );
    }

    context.logStep(
      "Globex",
      "Section qualifications: uploading resume and selecting qualification data."
    );
    await ensureSectionOpenWithHuman(
      page,
      '.application-section[data-section="qualifications"] .section-header',
      "open",
      "qualifications",
      context
    );
    await setFile(page, "#g-resume", context.resumePath);
    await selectValue(page, "#g-experience", experienceToGlobex[profile.experienceLevel]);
    await selectValue(page, "#g-degree", educationToGlobex[profile.education]);
    await fillGlobexSchool(page, profile.school, context);

    await context.human.scrollIntoView(page, "#g-skills");
    let selectedGlobexSkills = 0;
    for (const skill of profile.skills) {
      const mappedSkill = profileSkillToGlobex[skill.toLowerCase()];
      if (!mappedSkill) {
        context.logStep(
          "Globex",
          `Skill "${skill}" has no mapping for Globex chips, skipping.`
        );
        continue;
      }

      const chip = page.locator(`#g-skills .chip[data-skill="${mappedSkill}"]`);
      if ((await chip.count()) === 0) {
        context.logStep(
          "Globex",
          `Mapped skill "${mappedSkill}" not present in UI, skipping.`
        );
        continue;
      }

      const chipClass = (await chip.getAttribute("class")) ?? "";
      if (!chipClass.includes("selected")) {
        await context.human.hoverAndClick(
          page,
          `#g-skills .chip[data-skill="${mappedSkill}"]`
        );
        selectedGlobexSkills += 1;
        await context.human.pause(40, 120);
      }
    }
    context.logStep("Globex", `Selected ${selectedGlobexSkills} matching skills.`);

    context.logStep(
      "Globex",
      "Section additional: setting authorization, compensation, source, and motivation."
    );
    await ensureSectionOpenWithHuman(
      page,
      '.application-section[data-section="additional"] .section-header',
      "open",
      "additional",
      context
    );
    await context.human.scrollIntoView(page, "#g-work-auth-toggle");
    await context.human.pause(40, 120);
    await setToggleState(page, "#g-work-auth-toggle", profile.workAuthorized);
    await context.human.pause(40, 120);

    if (profile.workAuthorized) {
      context.logStep("Globex", "Work authorization is true, evaluating visa toggle.");
      await page.waitForSelector("#g-visa-block.visible", { timeout: 2000 });
      await context.human.scrollIntoView(page, "#g-visa-toggle");
      await context.human.pause(40, 120);
      await setToggleState(page, "#g-visa-toggle", profile.requiresVisa);
      await context.human.pause(40, 120);
    } else {
      context.logStep(
        "Globex",
        "Work authorization is false, visa toggle section is not applicable."
      );
    }

    await fillText(page, "#g-start-date", profile.earliestStartDate);

    const salaryValue = normalizeSalary(profile.salaryExpectation);
    context.logStep("Globex", `Normalized salary for slider set to ${salaryValue}.`);
    await page.locator("#g-salary").evaluate((el, value) => {
      const salaryInput = el as HTMLInputElement;
      salaryInput.value = value;
      salaryInput.dispatchEvent(new Event("input", { bubbles: true }));
      salaryInput.dispatchEvent(new Event("change", { bubbles: true }));
    }, salaryValue);

    const sourceValue = referralToGlobex[profile.referralSource] ?? "other";
    context.logStep("Globex", `Referral source mapped to "${sourceValue}".`);
    await selectValue(page, "#g-source", sourceValue);

    if (sourceValue === "other") {
      context.logStep("Globex", "Referral mapped to other, filling source details.");
      await page.waitForSelector("#g-source-other-block.visible", { timeout: 2000 });
      await context.human.typeText(page, "#g-source-other", profile.referralSource);
    }

    await context.human.typeText(page, "#g-motivation", profile.coverLetter);
    await page.check("#g-consent");
  },
  async submit(page: Page, context: ATSHandlerContext): Promise<string> {
    context.logStep("Globex", "Checking consent and submitting application.");
    await page.check("#g-consent");
    context.logStep("Globex", "Waiting for confirmation section.");
    await withRetry(
      async () => {
        await context.human.scrollIntoView(page, "#globex-submit");
        await context.human.pause(120, 220);
        await context.human.hoverAndClick(page, "#globex-submit");
        await waitForRequiredSelector(
          page,
          "#globex-confirmation",
          7000,
          "Globex confirmation section did not appear after submit"
        );
      },
      {
        ...globexSubmitRetry,
        scope: "Globex",
        step: "submit application and wait for confirmation",
      },
      context.logStep
    );

    const reference = (await page.locator("#globex-ref").innerText()).trim();
    context.logStep("Globex", `Submission completed with reference ${reference}.`);
    return reference;
  },
};
