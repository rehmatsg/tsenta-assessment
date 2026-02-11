import type { Page } from "playwright";
import type { ATSHandler, ATSHandlerContext } from "./types";
import type { UserProfile } from "../types";
import {
  checkByValue,
  fillOptionalText,
  fillText,
  selectValue,
  setFile,
} from "../utils/field-filler";

async function clickStepContinue(page: Page, step: number): Promise<void> {
  await page
    .locator(`.form-step[data-step="${step}"] .btn-primary`)
    .first()
    .click();
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
    context.logStep("Acme", "Step 1: filling personal information fields.");
    await fillText(page, "#first-name", profile.firstName);
    await fillText(page, "#last-name", profile.lastName);
    await fillText(page, "#email", profile.email);
    await fillText(page, "#phone", profile.phone);
    await fillText(page, "#location", profile.location);

    if (profile.linkedIn) {
      context.logStep("Acme", "LinkedIn profile provided, filling optional field.");
      await fillOptionalText(page, "#linkedin", profile.linkedIn);
    } else {
      context.logStep("Acme", "LinkedIn profile not provided, skipping optional field.");
    }

    if (profile.portfolio) {
      context.logStep("Acme", "Portfolio/GitHub provided, filling optional field.");
      await fillOptionalText(page, "#portfolio", profile.portfolio);
    } else {
      context.logStep(
        "Acme",
        "Portfolio/GitHub not provided, skipping optional field."
      );
    }

    context.logStep("Acme", "Step 1 complete, continuing to step 2.");
    await clickStepContinue(page, 1);
    await page.waitForSelector('.form-step[data-step="2"].active');

    context.logStep(
      "Acme",
      "Step 2: uploading resume and selecting experience/education."
    );
    await setFile(page, "#resume", context.resumePath);
    await selectValue(page, "#experience-level", profile.experienceLevel);
    await selectValue(page, "#education", profile.education);

    context.logStep("Acme", "Selecting school using typeahead.");
    await fillText(page, "#school", profile.school);
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
        context.logStep("Acme", `Skill "${skill}" not available on form, skipping.`);
      }
    }
    context.logStep("Acme", `Selected ${selectedAcmeSkills} matching skills.`);

    context.logStep("Acme", "Step 2 complete, continuing to step 3.");
    await clickStepContinue(page, 2);
    await page.waitForSelector('.form-step[data-step="3"].active');

    context.logStep(
      "Acme",
      "Step 3: setting work authorization and additional questions."
    );
    await checkByValue(page, "workAuth", profile.workAuthorized ? "yes" : "no");

    if (profile.workAuthorized) {
      context.logStep(
        "Acme",
        "Work authorization is yes, setting visa sponsorship response."
      );
      await page.waitForSelector("#visa-sponsorship-group", { state: "visible" });
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

    await selectValue(page, "#referral", profile.referralSource);
    await fillText(page, "#cover-letter", profile.coverLetter);

    context.logStep("Acme", "Step 3 complete, continuing to review step.");
    await clickStepContinue(page, 3);
    await page.waitForSelector('.form-step[data-step="4"].active');
  },
  async submit(page: Page, context: ATSHandlerContext): Promise<string> {
    context.logStep("Acme", "Step 4: agreeing to terms and submitting application.");
    await page.check("#terms-agree");
    await page.click("#submit-btn");

    context.logStep("Acme", "Waiting for success confirmation.");
    await page.waitForSelector("#success-page", { state: "visible" });
    const confirmation = (await page.locator("#confirmation-id").innerText()).trim();
    context.logStep(
      "Acme",
      `Submission completed with confirmation ID ${confirmation}.`
    );
    return confirmation;
  },
};
