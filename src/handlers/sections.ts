import type { Page } from "playwright";
import type { ATSHandlerContext } from "./types";

export interface SectionController<TSectionId extends string | number> {
  ensureActive(
    page: Page,
    sectionId: TSectionId,
    context: ATSHandlerContext
  ): Promise<void>;
}

type RunSectionArgs<TSectionId extends string | number> = {
  page: Page;
  sectionId: TSectionId;
  scope: string;
  enterLog?: string;
  context: ATSHandlerContext;
  controller: SectionController<TSectionId>;
  fill: () => Promise<void>;
};

export async function runSection<TSectionId extends string | number>(
  args: RunSectionArgs<TSectionId>
): Promise<void> {
  const { page, sectionId, scope, enterLog, context, controller, fill } = args;

  if (enterLog) {
    context.logStep(scope, enterLog);
  }

  await controller.ensureActive(page, sectionId, context);
  await fill();
}
