import type { Page } from "playwright";
import type { ATSHandler, ATSHandlerContext } from "./types";
import type { UserProfile } from "../types";
import { setFile } from "../utils/field-filler";
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
  humanCheckSelector,
  humanClickWithOptionalPause,
  humanFillValue,
  humanSelectValue,
  humanToggleState,
  withOptionalRetry,
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

const globexSectionController: SectionController<GlobexSectionId> = {
  async ensureActive(
    page: Page,
    sectionId: GlobexSectionId,
    context: ATSHandlerContext
  ): Promise<void> {
    const sectionSelector = toSectionSelector(sectionId);
    await withOptionalRetry({
      operation: async () => {
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
      retryProfile: GLOBEX_SECTION_OPEN_RETRY_PROFILE,
      scope: "Globex",
      step: toSectionOpenStepName(sectionId),
    });
  },
};

async function fillGlobexSchool(
  page: Page,
  schoolName: string,
  context: ATSHandlerContext
): Promise<void> {
  context.logStep("Globex", "Searching school with async typeahead.");
  await withOptionalRetry({
    operation: async () => {
      // Use a short query prefix so async results appear quickly, then select from results.
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
        const options = page.locator("#g-school-results li");
        const optionCount = await options.count();
        let matchingOptionSelector: string | null = null;

        for (let index = 0; index < optionCount; index += 1) {
          const optionText = (await options.nth(index).innerText()).trim();
          if (optionText.toLowerCase().includes(schoolName.toLowerCase())) {
            matchingOptionSelector = `#g-school-results li:nth-child(${index + 1})`;
            break;
          }
        }

        if (!matchingOptionSelector) {
          throw new Error("Exact school match appeared but could not resolve selector");
        }

        await humanClickWithOptionalPause(
          page,
          matchingOptionSelector,
          context,
          ACTION_PAUSE
        );
        return;
      }

      // Fallback: choose first selectable result when exact text is unavailable.
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

      await humanClickWithOptionalPause(
        page,
        "#g-school-results li:not(.typeahead-no-results)",
        context,
        ACTION_PAUSE
      );
    },
    context,
    retryProfile: GLOBEX_TYPEAHEAD_RETRY_PROFILE,
    scope: "Globex",
    step: "select school suggestion",
  });
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
        // Contact section: required identity/contact fields.
        await context.human.typeText(page, "#g-fname", profile.firstName);
        await context.human.typeText(page, "#g-lname", profile.lastName);
        await context.human.typeText(page, "#g-email", profile.email);
        await context.human.typeText(page, "#g-phone", profile.phone);
        await context.human.typeText(page, "#g-city", normalizeCity(profile.location));

        // Contact section: optional profile links.
        await fillOptionalFieldWithLogs({
          page,
          selector: "#g-linkedin",
          value: profile.linkedIn,
          scope: "Globex",
          presentLog: "LinkedIn profile provided, filling optional field.",
          skipLog: "LinkedIn profile not provided, skipping optional field.",
          context,
        });

        await fillOptionalFieldWithLogs({
          page,
          selector: "#g-website",
          value: profile.portfolio,
          scope: "Globex",
          presentLog: "Portfolio/GitHub provided, filling optional field.",
          skipLog: "Portfolio/GitHub not provided, skipping optional field.",
          context,
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
        // Qualifications section: resume + experience/education + school.
        await setFile(page, "#g-resume", context.resumePath);
        await humanSelectValue({
          page,
          selector: "#g-experience",
          value: mapExperienceLevel("globex", profile.experienceLevel),
          context,
          pauseRange: ACTION_PAUSE,
        });
        await humanSelectValue({
          page,
          selector: "#g-degree",
          value: mapEducation("globex", profile.education),
          context,
          pauseRange: ACTION_PAUSE,
        });
        await fillGlobexSchool(page, profile.school, context);

        // Qualifications section: selectable skill chips from mapped profile skills.
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
        // Additional section: work authorization toggle and dependent visa toggle.
        await humanToggleState({
          page,
          selector: "#g-work-auth-toggle",
          shouldBeActive: profile.workAuthorized,
          context,
          pauseRange: ACTION_PAUSE,
        });

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
          await humanToggleState({
            page,
            selector: "#g-visa-toggle",
            shouldBeActive: profile.requiresVisa,
            context,
            pauseRange: ACTION_PAUSE,
          });
        } else {
          context.logStep(
            "Globex",
            "Work authorization is false, visa toggle section is not applicable."
          );
        }

        // Additional section: start date (date input), salary slider, referral source, motivation.
        await humanFillValue({
          page,
          selector: "#g-start-date",
          value: profile.earliestStartDate,
          context,
          pauseRange: ACTION_PAUSE,
        });

        const salaryValue = normalizeSalary(profile.salaryExpectation);
        context.logStep("Globex", `Normalized salary for slider set to ${salaryValue}.`);
        await context.human.scrollIntoView(page, "#g-salary");
        await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);
        await page.locator("#g-salary").evaluate((el, value) => {
          const salaryInput = el as HTMLInputElement;
          salaryInput.value = value;
          salaryInput.dispatchEvent(new Event("input", { bubbles: true }));
          salaryInput.dispatchEvent(new Event("change", { bubbles: true }));
        }, salaryValue);
        await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);

        const sourceValue = mapReferralSource("globex", profile.referralSource);
        context.logStep("Globex", `Referral source mapped to "${sourceValue}".`);
        await humanSelectValue({
          page,
          selector: "#g-source",
          value: sourceValue,
          context,
          pauseRange: ACTION_PAUSE,
        });

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
      },
    });
  },
  async submit(page: Page, context: ATSHandlerContext): Promise<string> {
    context.logStep("Globex", "Checking consent and submitting application.");
    // Submit step: required consent checkbox before final submit.
    await humanCheckSelector({
      page,
      selector: "#g-consent",
      context,
      pauseRange: ACTION_PAUSE,
    });
    context.logStep("Globex", "Waiting for confirmation section.");
    await context.measureStep("Globex", "submit", async () => {
      await withOptionalRetry({
        operation: async () => {
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
        retryProfile: GLOBEX_SUBMIT_RETRY_PROFILE,
        scope: "Globex",
        step: "submit application and wait for confirmation",
      });
    });

    const reference = (await page.locator("#globex-ref").innerText()).trim();
    context.logStep("Globex", `Submission completed with reference ${reference}.`);
    return reference;
  },
};
