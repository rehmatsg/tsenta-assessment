import type { Page } from "playwright";
import type { ATSHandlerContext } from "./types";
import {
  checkByValue,
  selectValue,
  waitForRequiredSelector,
} from "../utils/field-filler";
import { withRetry } from "../utils/retry";
import type { RetryProfile } from "../utils/retry-profiles";

type LogStep = (scope: string, message: string) => void;

type PauseRange = {
  minMs: number;
  maxMs: number;
};

type FillOptionalFieldWithLogsArgs = {
  page: Page;
  selector: string;
  value: string | undefined;
  scope: string;
  presentLog: string;
  skipLog: string;
  context: ATSHandlerContext;
};

export async function fillOptionalFieldWithLogs(
  args: FillOptionalFieldWithLogsArgs
): Promise<void> {
  const { page, selector, value, scope, presentLog, skipLog, context } = args;

  if (value) {
    context.logStep(scope, presentLog);
    await context.human.typeText(page, selector, value);
    return;
  }

  context.logStep(scope, skipLog);
}

type WaitVisibleWithRetryArgs = {
  page: Page;
  selector: string;
  timeoutMs: number;
  errorMessage: string;
  retryProfile: RetryProfile;
  scope: string;
  step: string;
  logStep: LogStep;
  enableRetries?: boolean;
};

type WithOptionalRetryArgs<T> = {
  operation: () => Promise<T>;
  context: ATSHandlerContext;
  retryProfile: RetryProfile;
  scope: string;
  step: string;
};

export async function withOptionalRetry<T>(
  args: WithOptionalRetryArgs<T>
): Promise<T> {
  const { operation, context, retryProfile, scope, step } = args;

  if (!context.options.features.enableRetries) {
    return operation();
  }

  return withRetry(
    operation,
    {
      ...retryProfile,
      scope,
      step,
    },
    context.logStep
  );
}

export async function waitVisibleWithRetry(
  args: WaitVisibleWithRetryArgs
): Promise<void> {
  const {
    page,
    selector,
    timeoutMs,
    errorMessage,
    retryProfile,
    scope,
    step,
    logStep,
    enableRetries,
  } = args;

  if (enableRetries === false) {
    await waitForRequiredSelector(page, selector, timeoutMs, errorMessage);
    return;
  }

  await withRetry(
    () => waitForRequiredSelector(page, selector, timeoutMs, errorMessage),
    {
      ...retryProfile,
      scope,
      step,
    },
    logStep
  );
}

export async function humanClickWithOptionalPause(
  page: Page,
  selector: string,
  context: ATSHandlerContext,
  pauseRange?: PauseRange
): Promise<void> {
  await context.human.scrollIntoView(page, selector);
  await context.human.hoverAndClick(page, selector);

  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
}

type HumanCheckSelectorArgs = {
  page: Page;
  selector: string;
  context: ATSHandlerContext;
  pauseRange?: PauseRange;
};

export async function humanCheckSelector(
  args: HumanCheckSelectorArgs
): Promise<void> {
  const { page, selector, context, pauseRange } = args;
  await context.human.scrollIntoView(page, selector);
  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
  await page.check(selector);
  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
}

type HumanSelectValueArgs = {
  page: Page;
  selector: string;
  value: string;
  context: ATSHandlerContext;
  pauseRange?: PauseRange;
};

export async function humanSelectValue(
  args: HumanSelectValueArgs
): Promise<void> {
  const { page, selector, value, context, pauseRange } = args;
  await context.human.scrollIntoView(page, selector);
  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
  await selectValue(page, selector, value);
  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
}

type HumanFillValueArgs = {
  page: Page;
  selector: string;
  value: string;
  context: ATSHandlerContext;
  pauseRange?: PauseRange;
};

export async function humanFillValue(
  args: HumanFillValueArgs
): Promise<void> {
  const { page, selector, value, context, pauseRange } = args;
  await context.human.scrollIntoView(page, selector);
  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
  await page.fill(selector, value);
  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
}

type HumanCheckByValueArgs = {
  page: Page;
  name: string;
  value: string;
  context: ATSHandlerContext;
  pauseRange?: PauseRange;
};

export async function humanCheckByValue(
  args: HumanCheckByValueArgs
): Promise<void> {
  const { page, name, value, context, pauseRange } = args;
  const selector = `input[name="${name}"][value="${value}"]`;
  await context.human.scrollIntoView(page, selector);
  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
  await checkByValue(page, name, value);
  if (pauseRange) {
    await context.human.pause(pauseRange.minMs, pauseRange.maxMs);
  }
}

type HumanToggleStateArgs = {
  page: Page;
  selector: string;
  shouldBeActive: boolean;
  context: ATSHandlerContext;
  pauseRange?: PauseRange;
};

export async function humanToggleState(
  args: HumanToggleStateArgs
): Promise<void> {
  const { page, selector, shouldBeActive, context, pauseRange } = args;
  const toggle = page.locator(selector).first();
  const currentValue = await toggle.getAttribute("data-value");
  const isActive = currentValue === "true";

  if (isActive !== shouldBeActive) {
    await humanClickWithOptionalPause(page, selector, context, pauseRange);
  }
}
