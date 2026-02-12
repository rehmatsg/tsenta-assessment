export interface RetryOptions {
  attempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  scope: string;
  step: string;
  shouldRetry?: (error: unknown) => boolean;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function computeBackoffDelay(
  initialDelayMs: number,
  backoffMultiplier: number,
  attemptIndex: number
): number {
  const safeInitialDelay = Math.max(0, initialDelayMs);
  const safeBackoff = backoffMultiplier > 0 ? backoffMultiplier : 1;
  return Math.round(safeInitialDelay * safeBackoff ** attemptIndex);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  logStep: (scope: string, message: string) => void
): Promise<T> {
  const maxAttempts = Math.max(1, options.attempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const canRetryByCount = attempt < maxAttempts;
      const canRetryByPredicate = options.shouldRetry
        ? options.shouldRetry(error)
        : true;
      const shouldRetry = canRetryByCount && canRetryByPredicate;

      if (!shouldRetry) {
        throw new Error(
          `[${options.scope}] Step "${options.step}" failed after ${attempt}/${maxAttempts} attempts: ${errorMessage}`
        );
      }

      const delayMs = computeBackoffDelay(
        options.initialDelayMs,
        options.backoffMultiplier,
        attempt - 1
      );
      logStep(
        options.scope,
        `Retrying step "${options.step}" after failed attempt ${attempt}/${maxAttempts}: ${errorMessage}. Waiting ${delayMs}ms.`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `[${options.scope}] Step "${options.step}" failed without a successful attempt.`
  );
}
