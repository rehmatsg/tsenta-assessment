import type { Page } from "playwright";
import type { ATSHandlerContext } from "./types";
import { fillOptionalText, waitForRequiredSelector } from "../utils/field-filler";
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
  logStep: LogStep;
};

export async function fillOptionalFieldWithLogs(
  args: FillOptionalFieldWithLogsArgs
): Promise<void> {
  const { page, selector, value, scope, presentLog, skipLog, logStep } = args;

  if (value) {
    logStep(scope, presentLog);
    await fillOptionalText(page, selector, value);
    return;
  }

  logStep(scope, skipLog);
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
