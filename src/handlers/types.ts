import type { Page } from "playwright";
import type { UserProfile } from "../types";

export type PlatformId = "acme" | "globex";

export interface HumanLikeEngine {
  pause(minMs: number, maxMs: number): Promise<void>;
  typeText(page: Page, selector: string, value: string): Promise<void>;
  hoverAndClick(page: Page, selector: string): Promise<void>;
  scrollIntoView(page: Page, selector: string): Promise<void>;
}

export interface ATSRuntimeOptions {
  features: {
    enableRetries: boolean;
    captureFailureScreenshots: boolean;
    captureTrace: boolean;
  };
  timeouts: {
    stepTransitionMs: number;
    sectionOpenMs: number;
    typeaheadMs: number;
    conditionalRevealMs: number;
    confirmationMs: number;
  };
  artifacts: {
    failureScreenshotDir: string;
    traceDir: string;
  };
}

export interface ATSHandlerContext {
  resumePath: string;
  logStep: (scope: string, message: string) => void;
  human: HumanLikeEngine;
  options: ATSRuntimeOptions;
  measureStep: <T>(
    scope: string,
    step: string,
    action: () => Promise<T>
  ) => Promise<T>;
}

export interface ATSHandler {
  platform: PlatformId;
  matches(url: string, page: Page): Promise<boolean>;
  fillForm(
    page: Page,
    profile: UserProfile,
    context: ATSHandlerContext
  ): Promise<void>;
  submit(page: Page, context: ATSHandlerContext): Promise<string>;
}
