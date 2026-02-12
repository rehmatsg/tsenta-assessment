import type { Page } from "playwright";
import type { ATSHandler, ATSHandlerContext } from "./types";
import type { UserProfile } from "../types";
import { fillText, selectValue, setFile, setToggleState } from "../utils/field-filler";
import { withRetry } from "../utils/retry";
import {
  ACTION_PAUSE,
  GLOBEX_SECTION_OPEN_RETRY_PROFILE,
  GLOBEX_SUBMIT_RETRY_PROFILE,
  GLOBEX_TYPEAHEAD_RETRY_PROFILE,
  PRE_SUBMIT_PAUSE,
  SINGLE_ATTEMPT_RETRY_PROFILE,
} from "../utils/retry-profiles";
import {
  mapEducation,
  mapExperienceLevel,
  mapReferralSource,
  mapSkill,
} from "../mappings/registry";
import { runSection, type SectionController } from "./sections";
import {
  fillOptionalFieldWithLogs,
  humanClickWithOptionalPause,
  waitVisibleWithRetry,
} from "./shared";

type GlobexSectionId = "contact" | "qualifications" | "additional";

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

function toSectionSelector(sectionId: GlobexSectionId): string {
  return `.application-section[data-section="${sectionId}"] .section-header`;
}

function toSectionOpenStepName(sectionId: GlobexSectionId): string {
  return `open ${sectionId} section`;
}

function resolveGlobexTypeaheadTimeoutMs(context: ATSHandlerContext): number {
  return Math.max(context.options.timeouts.typeaheadMs, 6000);
}

function resolveGlobexConfirmationTimeoutMs(context: ATSHandlerContext): number {
  return Math.max(context.options.timeouts.confirmationMs, 7000);
}

async function withOptionalGlobexRetry<T>(
  operation: () => Promise<T>,
  context: ATSHandlerContext,
  retryProfile: {
    attempts: number;
    initialDelayMs: number;
    backoffMultiplier: number;
  },
  step: string
): Promise<T> {
  if (!context.options.features.enableRetries) {
    return operation();
  }

  return withRetry(
    operation,
    {
      ...retryProfile,
      scope: "Globex",
      step,
    },
    context.logStep
  );
}

const globexSectionController: SectionController<GlobexSectionId> = {
  async ensureActive(
    page: Page,
    sectionId: GlobexSectionId,
    context: ATSHandlerContext
  ): Promise<void> {
    const sectionSelector = toSectionSelector(sectionId);
    await withOptionalGlobexRetry(
      async () => {
        const sectionHeader = page.locator(sectionSelector).first();
        const className = (await sectionHeader.getAttribute("class")) ?? "";
        if (!className.includes("open")) {
          await humanClickWithOptionalPause(
            page,
            sectionSelector,
            context,
            ACTION_PAUSE
          );
        }

        await waitVisibleWithRetry({
          page,
          selector: `${sectionSelector}.open`,
          timeoutMs: context.options.timeouts.sectionOpenMs,
          errorMessage: `Globex section "${sectionId}" did not open`,
          retryProfile: SINGLE_ATTEMPT_RETRY_PROFILE,
          scope: "Globex",
          step: `verify ${sectionId} section is open`,
          logStep: context.logStep,
          enableRetries: context.options.features.enableRetries,
        });
      },
      context,
      GLOBEX_SECTION_OPEN_RETRY_PROFILE,
      toSectionOpenStepName(sectionId)
    );
  },
};

async function fillGlobexSchool(
  page: Page,
  schoolName: string,
  context: ATSHandlerContext
): Promise<void> {
  context.logStep("Globex", "Searching school with async typeahead.");
  await withOptionalGlobexRetry(
    async () => {
      const query = schoolName.slice(0, 8);
      await context.human.typeText(page, "#g-school", query);
      await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);

      await waitVisibleWithRetry({
        page,
        selector: "#g-school-results.open",
        timeoutMs: resolveGlobexTypeaheadTimeoutMs(context),
        errorMessage: "Globex school results dropdown did not open",
        retryProfile: SINGLE_ATTEMPT_RETRY_PROFILE,
        scope: "Globex",
        step: "wait for school results dropdown",
        logStep: context.logStep,
        enableRetries: context.options.features.enableRetries,
      });

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
      await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);
    },
    context,
    GLOBEX_TYPEAHEAD_RETRY_PROFILE,
    "select school suggestion"
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
    await runSection({
      page,
      sectionId: "contact",
      scope: "Globex",
      enterLog: "Section contact: filling personal/contact fields.",
      context,
      controller: globexSectionController,
      fill: async () => {
        await context.human.typeText(page, "#g-fname", profile.firstName);
        await context.human.typeText(page, "#g-lname", profile.lastName);
        await context.human.typeText(page, "#g-email", profile.email);
        await context.human.typeText(page, "#g-phone", profile.phone);
        await context.human.typeText(page, "#g-city", normalizeCity(profile.location));

        await fillOptionalFieldWithLogs({
          page,
          selector: "#g-linkedin",
          value: profile.linkedIn,
          scope: "Globex",
          presentLog: "LinkedIn profile provided, filling optional field.",
          skipLog: "LinkedIn profile not provided, skipping optional field.",
          logStep: context.logStep,
        });

        await fillOptionalFieldWithLogs({
          page,
          selector: "#g-website",
          value: profile.portfolio,
          scope: "Globex",
          presentLog: "Portfolio/GitHub provided, filling optional field.",
          skipLog: "Portfolio/GitHub not provided, skipping optional field.",
          logStep: context.logStep,
        });
      },
    });

    await runSection({
      page,
      sectionId: "qualifications",
      scope: "Globex",
      enterLog: "Section qualifications: uploading resume and selecting qualification data.",
      context,
      controller: globexSectionController,
      fill: async () => {
        await setFile(page, "#g-resume", context.resumePath);
        await selectValue(
          page,
          "#g-experience",
          mapExperienceLevel("globex", profile.experienceLevel)
        );
        await selectValue(page, "#g-degree", mapEducation("globex", profile.education));
        await fillGlobexSchool(page, profile.school, context);

        await context.human.scrollIntoView(page, "#g-skills");
        let selectedGlobexSkills = 0;
        for (const skill of profile.skills) {
          const mappedSkill = mapSkill("globex", skill);
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
            await humanClickWithOptionalPause(
              page,
              `#g-skills .chip[data-skill="${mappedSkill}"]`,
              context,
              ACTION_PAUSE
            );
            selectedGlobexSkills += 1;
          }
        }
        context.logStep("Globex", `Selected ${selectedGlobexSkills} matching skills.`);
      },
    });

    await runSection({
      page,
      sectionId: "additional",
      scope: "Globex",
      enterLog: "Section additional: setting authorization, compensation, source, and motivation.",
      context,
      controller: globexSectionController,
      fill: async () => {
        await context.human.scrollIntoView(page, "#g-work-auth-toggle");
        await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);
        await setToggleState(page, "#g-work-auth-toggle", profile.workAuthorized);
        await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);

        if (profile.workAuthorized) {
          context.logStep("Globex", "Work authorization is true, evaluating visa toggle.");
          await waitVisibleWithRetry({
            page,
            selector: "#g-visa-block.visible",
            timeoutMs: context.options.timeouts.conditionalRevealMs,
            errorMessage: "Globex visa block did not become visible",
            retryProfile: SINGLE_ATTEMPT_RETRY_PROFILE,
            scope: "Globex",
            step: "wait for visa block",
            logStep: context.logStep,
            enableRetries: context.options.features.enableRetries,
          });
          await context.human.scrollIntoView(page, "#g-visa-toggle");
          await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);
          await setToggleState(page, "#g-visa-toggle", profile.requiresVisa);
          await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);
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

        const sourceValue = mapReferralSource("globex", profile.referralSource);
        context.logStep("Globex", `Referral source mapped to "${sourceValue}".`);
        await selectValue(page, "#g-source", sourceValue);

        if (sourceValue === "other") {
          context.logStep("Globex", "Referral mapped to other, filling source details.");
          await waitVisibleWithRetry({
            page,
            selector: "#g-source-other-block.visible",
            timeoutMs: context.options.timeouts.conditionalRevealMs,
            errorMessage: "Globex source-other block did not become visible",
            retryProfile: SINGLE_ATTEMPT_RETRY_PROFILE,
            scope: "Globex",
            step: "wait for source-other block",
            logStep: context.logStep,
            enableRetries: context.options.features.enableRetries,
          });
          await context.human.typeText(page, "#g-source-other", profile.referralSource);
        }

        await context.human.typeText(page, "#g-motivation", profile.coverLetter);
        await page.check("#g-consent");
      },
    });
  },
  async submit(page: Page, context: ATSHandlerContext): Promise<string> {
    context.logStep("Globex", "Checking consent and submitting application.");
    await page.check("#g-consent");
    context.logStep("Globex", "Waiting for confirmation section.");
    await withOptionalGlobexRetry(
      async () => {
        await context.human.scrollIntoView(page, "#globex-submit");
        await context.human.pause(PRE_SUBMIT_PAUSE.minMs, PRE_SUBMIT_PAUSE.maxMs);
        await humanClickWithOptionalPause(page, "#globex-submit", context);
        await waitVisibleWithRetry({
          page,
          selector: "#globex-confirmation",
          timeoutMs: resolveGlobexConfirmationTimeoutMs(context),
          errorMessage: "Globex confirmation section did not appear after submit",
          retryProfile: SINGLE_ATTEMPT_RETRY_PROFILE,
          scope: "Globex",
          step: "wait for confirmation section",
          logStep: context.logStep,
          enableRetries: context.options.features.enableRetries,
        });
      },
      context,
      GLOBEX_SUBMIT_RETRY_PROFILE,
      "submit application and wait for confirmation"
    );

    const reference = (await page.locator("#globex-ref").innerText()).trim();
    context.logStep("Globex", `Submission completed with reference ${reference}.`);
    return reference;
  },
};
