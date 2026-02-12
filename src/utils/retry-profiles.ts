import type { RetryOptions } from "./retry";

export type RetryProfile = Pick<
  RetryOptions,
  "attempts" | "initialDelayMs" | "backoffMultiplier"
>;

export const ACTION_PAUSE = {
  minMs: 40,
  maxMs: 120,
} as const;

export const PRE_SUBMIT_PAUSE = {
  minMs: 120,
  maxMs: 220,
} as const;

export const ACME_STEP_TRANSITION_RETRY_PROFILE: RetryProfile = {
  attempts: 2,
  initialDelayMs: 120,
  backoffMultiplier: 1.4,
};

export const SINGLE_ATTEMPT_RETRY_PROFILE: RetryProfile = {
  attempts: 1,
  initialDelayMs: 0,
  backoffMultiplier: 1,
};

export const ACME_TYPEAHEAD_RETRY_PROFILE: RetryProfile = {
  attempts: 3,
  initialDelayMs: 150,
  backoffMultiplier: 1.5,
};

export const ACME_SUBMIT_RETRY_PROFILE: RetryProfile = {
  attempts: 2,
  initialDelayMs: 180,
  backoffMultiplier: 1.6,
};

export const GLOBEX_TYPEAHEAD_RETRY_PROFILE: RetryProfile = {
  attempts: 3,
  initialDelayMs: 180,
  backoffMultiplier: 1.6,
};

export const GLOBEX_SECTION_OPEN_RETRY_PROFILE: RetryProfile = {
  attempts: 2,
  initialDelayMs: 100,
  backoffMultiplier: 1.3,
};

export const GLOBEX_SUBMIT_RETRY_PROFILE: RetryProfile = {
  attempts: 2,
  initialDelayMs: 180,
  backoffMultiplier: 1.6,
};
