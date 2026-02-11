import type { Page } from "playwright";
import type { UserProfile } from "../types";

export type PlatformId = "acme" | "globex";

export interface ATSHandlerContext {
  resumePath: string;
  logStep: (scope: string, message: string) => void;
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
