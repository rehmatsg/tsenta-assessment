import type { Page } from "playwright";
import type { ATSHandler, ATSHandlerContext } from "./types";
import type { UserProfile } from "../types";
import { setFile } from "../utils/field-filler";
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
  humanCheckByValue,
  humanCheckSelector,
  humanClickWithOptionalPause,
  humanFillValue,
  humanSelectValue,
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
        // Step 1: core personal/contact identity fields.
        await context.human.typeText(page, "#first-name", profile.firstName);
        await context.human.typeText(page, "#last-name", profile.lastName);
        await context.human.typeText(page, "#email", profile.email);
        await context.human.typeText(page, "#phone", profile.phone);
        await context.human.typeText(page, "#location", profile.location);

        // Step 1: optional social/profile links.
        await fillOptionalFieldWithLogs({
          page,
          selector: "#linkedin",
          value: profile.linkedIn,
          scope: "Acme",
          presentLog: "LinkedIn profile provided, filling optional field.",
          skipLog: "LinkedIn profile not provided, skipping optional field.",
          context,
        });

        await fillOptionalFieldWithLogs({
          page,
          selector: "#portfolio",
          value: profile.portfolio,
          scope: "Acme",
          presentLog: "Portfolio/GitHub provided, filling optional field.",
          skipLog: "Portfolio/GitHub not provided, skipping optional field.",
          context,
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
        // Step 2: document upload + qualification dropdowns.
        await setFile(page, "#resume", context.resumePath);
        await humanSelectValue({
          page,
          selector: "#experience-level",
          value: mapExperienceLevel("acme", profile.experienceLevel),
          context,
          pauseRange: ACTION_PAUSE,
        });
        await humanSelectValue({
          page,
          selector: "#education",
          value: mapEducation("acme", profile.education),
          context,
          pauseRange: ACTION_PAUSE,
        });

        context.logStep("Acme", "Selecting school using typeahead.");
        const schoolQuery = profile.school.slice(0, 8);
        await context.human.typeText(page, "#school", schoolQuery);
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
            const schoolOptions = page.locator("#school-dropdown li");
            const optionCount = await schoolOptions.count();
            if (optionCount === 0) {
              throw new Error("No school suggestions were available to select");
            }

            await humanClickWithOptionalPause(
              page,
              "#school-dropdown li:first-child",
              context,
              ACTION_PAUSE
            );
          },
          context,
          retryProfile: ACME_TYPEAHEAD_RETRY_PROFILE,
          scope: "Acme",
          step: "select school suggestion",
        });
        await context.human.pause(ACTION_PAUSE.minMs, ACTION_PAUSE.maxMs);

        // Step 2: skill checkbox selection from mapped profile skills.
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
            await humanCheckSelector({
              page,
              selector: `input[name="skills"][value="${mappedSkill}"]`,
              context,
              pauseRange: ACTION_PAUSE,
            });
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
        // Step 3: work authorization radio questions.
        await humanCheckByValue({
          page,
          name: "workAuth",
          value: profile.workAuthorized ? "yes" : "no",
          context,
          pauseRange: ACTION_PAUSE,
        });

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
          await humanCheckByValue({
            page,
            name: "visaSponsorship",
            value: profile.requiresVisa ? "yes" : "no",
            context,
            pauseRange: ACTION_PAUSE,
          });
        } else {
          context.logStep(
            "Acme",
            "Work authorization is no, visa sponsorship follow-up is not shown."
          );
        }

        // Step 3: availability + compensation fields.
        await humanFillValue({
          page,
          selector: "#start-date",
          value: profile.earliestStartDate,
          context,
          pauseRange: ACTION_PAUSE,
        });

        if (profile.salaryExpectation) {
          context.logStep("Acme", "Salary expectation provided, filling field.");
          await context.human.typeText(
            page,
            "#salary-expectation",
            profile.salaryExpectation
          );
        } else {
          context.logStep(
            "Acme",
            "Salary expectation not provided, leaving optional field empty."
          );
        }

        // Step 3: referral source and conditional "other" details.
        const mappedReferralSource = mapReferralSource("acme", profile.referralSource);
        await humanSelectValue({
          page,
          selector: "#referral",
          value: mappedReferralSource,
          context,
          pauseRange: ACTION_PAUSE,
        });
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
        // Step 3: final free-text motivation/cover letter field.
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
        // Step 4: required consent checkbox before submit.
        await humanCheckSelector({
          page,
          selector: "#terms-agree",
          context,
          pauseRange: ACTION_PAUSE,
        });
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
