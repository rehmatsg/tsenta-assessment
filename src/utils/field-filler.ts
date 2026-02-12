import type { Page } from "playwright";

export async function fillText(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await page.fill(selector, value);
}

export async function fillOptionalText(
  page: Page,
  selector: string,
  value: string | undefined,
  onSkip?: () => void
): Promise<void> {
  if (value) {
    await page.fill(selector, value);
    return;
  }

  if (onSkip) {
    onSkip();
  }
}

export async function selectValue(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await page.selectOption(selector, value);
}

export async function setFile(
  page: Page,
  selector: string,
  filePath: string
): Promise<void> {
  await page.setInputFiles(selector, filePath);
}

export async function checkByValue(
  page: Page,
  name: string,
  value: string
): Promise<void> {
  await page.check(`input[name="${name}"][value="${value}"]`);
}

export async function ensureSectionOpen(
  page: Page,
  sectionSelector: string,
  openClass: string
): Promise<void> {
  const sectionHeader = page.locator(sectionSelector);
  const className = (await sectionHeader.getAttribute("class")) ?? "";
  if (!className.includes(openClass)) {
    await sectionHeader.click();
  }
}

export async function setToggleState(
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

export async function waitForRequiredSelector(
  page: Page,
  selector: string,
  timeoutMs: number,
  errorMessage: string
): Promise<void> {
  try {
    await page.waitForSelector(selector, { state: "visible", timeout: timeoutMs });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`${errorMessage}. ${details}`);
  }
}
