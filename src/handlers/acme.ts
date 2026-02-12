import type { Page } from "playwright";
import type { ATSHandler, ATSHandlerContext } from "./types";
import type { UserProfile } from "../types";
import {
  checkByValue,
  fillText,
  selectValue,
  setFile,
} from "../utils/field-filler";
import {
  ACME_STEP_TRANSITION_RETRY_PROFILE,
  ACME_SUBMIT_RETRY_PROFILE,
  ACME_TYPEAHEAD_RETRY_PROFILE,
  ACTION_PAUSE,
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
  withOptionalRetry,
  waitVisibleWithRetry,
} from "./shared";

type AcmeSectionId = 1 | 2 | 3 | 4;

const acmeSectionController: SectionController<AcmeSectionId> = {
  async ensureActive(
    page: Page,
    sectionId: AcmeSectionId,
    context: ATSHandlerContext
  ): Promise<void> {
    await waitVisibleWithRetry({
      page,
      selector: `.form-step[data-step="${sectionId}"].active`,
      timeoutMs: context.options.timeouts.stepTransitionMs,
      errorMessage: `Acme step ${sectionId} did not become active`,
      retryProfile: ACME_STEP_TRANSITION_RETRY_PROFILE,
      scope: "Acme",
      step: `wait for step ${sectionId}`,
      logStep: context.logStep,
      enableRetries: context.options.features.enableRetries,
    });
  },
};

async function clickStepContinue(
  page: Page,
  step: AcmeSectionId,
  context: ATSHandlerContext
): Promise<void> {
  const continueButtonSelector = `.form-step[data-step="${step}"] .btn-primary`;
  await humanClickWithOptionalPause(page, continueButtonSelector, context);
}

async function waitForActiveStep(
  page: Page,
  step: AcmeSectionId,
  context: ATSHandlerContext
): Promise<void> {
  await acmeSectionController.ensureActive(page, step, context);
}

export const acmeHandler: ATSHandler = {
  platform: "acme",
  async matches(url: string, page: Page): Promise<boolean> {
    if (url.includes("/acme.html")) {
      return true;
    }

    const hasApplicationForm =
      (await page.locator("#application-form").count()) > 0;
    const hasProgressBar = (await page.locator(".progress-bar").count()) > 0;
    return hasApplicationForm && hasProgressBar;
  },
  async fillForm(
    page: Page,
    profile: UserProfile,
    context: ATSHandlerContext
  ): Promise<void> {
    await runSection({
      page,
      sectionId: 1,
      scope: "Acme",
      enterLog: "Step 1: filling personal information fields.",
      context,
      controller: acmeSectionController,
      fill: async () => {
        await context.human.typeText(page, "#first-name", profile.firstName);
        await context.human.typeText(page, "#last-name", profile.lastName);
        await context.human.typeText(page, "#email", profile.email);
        await context.human.typeText(page, "#phone", profile.phone);
        await context.human.typeText(page, "#location", profile.location);

        await fillOptionalFieldWithLogs({
          page,
          selector: "#linkedin",
          value: profile.linkedIn,
          scope: "Acme",
          presentLog: "LinkedIn profile provided, filling optional field.",
          skipLog: "LinkedIn profile not provided, skipping optional field.",
          logStep: context.logStep,
        });

        await fillOptionalFieldWithLogs({
          page,
          selector: "#portfolio",
          value: profile.portfolio,
          scope: "Acme",
          presentLog: "Portfolio/GitHub provided, filling optional field.",
          skipLog: "Portfolio/GitHub not provided, skipping optional field.",
          logStep: context.logStep,
        });
      },
    });

    context.logStep("Acme", "Step 1 complete, continuing to step 2.");
    await clickStepContinue(page, 1, context);
    await waitForActiveStep(page, 2, context);
    await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);

    context.logStep(
      "Acme",
      "Step 2: uploading resume and selecting experience/education."
    );
    await runSection({
      page,
      sectionId: 2,
      scope: "Acme",
      context,
      controller: acmeSectionController,
      fill: async () => {
        await setFile(page, "#resume", context.resumePath);
        await selectValue(
          page,
          "#experience-level",
          mapExperienceLevel("acme", profile.experienceLevel)
        );
        await selectValue(page, "#education", mapEducation("acme", profile.education));

        context.logStep("Acme", "Selecting school using typeahead.");
        await context.human.typeText(page, "#school", profile.school);
        await waitVisibleWithRetry({
          page,
          selector: "#school-dropdown li",
          timeoutMs: context.options.timeouts.typeaheadMs,
          errorMessage: "Acme school suggestions did not appear",
          retryProfile: ACME_TYPEAHEAD_RETRY_PROFILE,
          scope: "Acme",
          step: "wait for school suggestions",
          logStep: context.logStep,
          enableRetries: context.options.features.enableRetries,
        });

        await withOptionalRetry({
          operation: async () => {
            const schoolOption = page.locator("#school-dropdown li", {
              hasText: profile.school,
            });
            if ((await schoolOption.count()) === 0) {
              throw new Error(`No school suggestion matched "${profile.school}"`);
            }
            await schoolOption.first().click();
          },
          context,
          retryProfile: ACME_TYPEAHEAD_RETRY_PROFILE,
          scope: "Acme",
          step: "select school suggestion",
        });
        await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);

        let selectedAcmeSkills = 0;
        for (const skill of profile.skills) {
          const mappedSkill = mapSkill("acme", skill);
          if (!mappedSkill) {
            context.logStep("Acme", `Skill "${skill}" not available on form, skipping.`);
            continue;
          }

          const skillCheckbox = page.locator(
            `input[name="skills"][value="${mappedSkill}"]`
          );
          if ((await skillCheckbox.count()) > 0) {
            await skillCheckbox.check();
            selectedAcmeSkills += 1;
          } else {
            context.logStep("Acme", `Skill "${skill}" not available on form, skipping.`);
          }
        }
        context.logStep("Acme", `Selected ${selectedAcmeSkills} matching skills.`);
      },
    });

    context.logStep("Acme", "Step 2 complete, continuing to step 3.");
    await clickStepContinue(page, 2, context);
    await waitForActiveStep(page, 3, context);
    await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);

    context.logStep(
      "Acme",
      "Step 3: setting work authorization and additional questions."
    );
    await runSection({
      page,
      sectionId: 3,
      scope: "Acme",
      context,
      controller: acmeSectionController,
      fill: async () => {
        await checkByValue(page, "workAuth", profile.workAuthorized ? "yes" : "no");

        if (profile.workAuthorized) {
          context.logStep(
            "Acme",
            "Work authorization is yes, setting visa sponsorship response."
          );
          await waitVisibleWithRetry({
            page,
            selector: "#visa-sponsorship-group",
            timeoutMs: context.options.timeouts.conditionalRevealMs,
            errorMessage: "Acme visa sponsorship follow-up did not become visible",
            retryProfile: SINGLE_ATTEMPT_RETRY_PROFILE,
            scope: "Acme",
            step: "wait for visa sponsorship follow-up",
            logStep: context.logStep,
            enableRetries: context.options.features.enableRetries,
          });
          await checkByValue(
            page,
            "visaSponsorship",
            profile.requiresVisa ? "yes" : "no"
          );
        } else {
          context.logStep(
            "Acme",
            "Work authorization is no, visa sponsorship follow-up is not shown."
          );
        }

        await fillText(page, "#start-date", profile.earliestStartDate);

        if (profile.salaryExpectation) {
          context.logStep("Acme", "Salary expectation provided, filling field.");
          await fillText(page, "#salary-expectation", profile.salaryExpectation);
        } else {
          context.logStep(
            "Acme",
            "Salary expectation not provided, leaving optional field empty."
          );
        }

        const mappedReferralSource = mapReferralSource("acme", profile.referralSource);
        await selectValue(page, "#referral", mappedReferralSource);
        if (mappedReferralSource === "other") {
          context.logStep(
            "Acme",
            "Referral source is other, filling additional referral details."
          );
          await waitVisibleWithRetry({
            page,
            selector: "#referral-other-group",
            timeoutMs: context.options.timeouts.conditionalRevealMs,
            errorMessage: "Acme referral other field did not become visible",
            retryProfile: SINGLE_ATTEMPT_RETRY_PROFILE,
            scope: "Acme",
            step: "wait for referral other details field",
            logStep: context.logStep,
            enableRetries: context.options.features.enableRetries,
          });
          const referralDetails =
            profile.referralSource.trim().toLowerCase() === "other"
              ? "Other source"
              : profile.referralSource;
          await context.human.typeText(page, "#referral-other", referralDetails);
        }

        context.logStep(
          "Acme",
          "Skipping optional demographics section because profile has no demographic data."
        );
        await context.human.typeText(page, "#cover-letter", profile.coverLetter);
      },
    });

    context.logStep("Acme", "Step 3 complete, continuing to review step.");
    await clickStepContinue(page, 3, context);
    await waitForActiveStep(page, 4, context);
    await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);
  },
  async submit(page: Page, context: ATSHandlerContext): Promise<string> {
    await runSection({
      page,
      sectionId: 4,
      scope: "Acme",
      enterLog: "Step 4: agreeing to terms and submitting application.",
      context,
      controller: acmeSectionController,
      fill: async () => {
        await page.check("#terms-agree");
        context.logStep("Acme", "Waiting for success confirmation.");
        await withOptionalRetry({
          operation: async () => {
            await context.human.pause(
              PRE_SUBMIT_PAUSE.minMs,
              PRE_SUBMIT_PAUSE.maxMs
            );
            await humanClickWithOptionalPause(page, "#submit-btn", context);
            await waitVisibleWithRetry({
              page,
              selector: "#success-page",
              timeoutMs: context.options.timeouts.confirmationMs,
              errorMessage: "Acme success page did not appear after submit",
              retryProfile: SINGLE_ATTEMPT_RETRY_PROFILE,
              scope: "Acme",
              step: "wait for success page",
              logStep: context.logStep,
              enableRetries: context.options.features.enableRetries,
            });
          },
          context,
          retryProfile: ACME_SUBMIT_RETRY_PROFILE,
          scope: "Acme",
          step: "submit application and wait for success",
        });
      },
    });

    const confirmation = (await page.locator("#confirmation-id").innerText()).trim();
    context.logStep(
      "Acme",
      `Submission completed with confirmation ID ${confirmation}.`
    );
    return confirmation;
  },
};
