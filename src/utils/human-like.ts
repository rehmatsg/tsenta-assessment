import type { Locator, Page } from "playwright";
import type { HumanLikeEngine } from "../handlers/types";

export const LOW_OVERHEAD_PROFILE_NAME = "low-overhead";

export const humanDelayProfile = {
  actionPauseMinMs: 120,
  actionPauseMaxMs: 320,
  hoverDwellMinMs: 90,
  hoverDwellMaxMs: 220,
  letterTypeMinMs: 55,
  letterTypeMaxMs: 140,
  digitTypeMinMs: 70,
  digitTypeMaxMs: 170,
  symbolTypeMinMs: 85,
  symbolTypeMaxMs: 210,
  preSubmitPauseMinMs: 350,
  preSubmitPauseMaxMs: 800,
} as const;

export function hashStringToUint32(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createXorshift32(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function toDelay(minMs: number, maxMs: number, random: () => number): number {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  if (min === max) {
    return min;
  }

  const rawValue = min + random() * (max - min);
  return Math.round(rawValue);
}

function resolveTypeDelay(character: string, random: () => number): number {
  if (/[a-z]/i.test(character)) {
    return toDelay(
      humanDelayProfile.letterTypeMinMs,
      humanDelayProfile.letterTypeMaxMs,
      random
    );
  }

  if (/[0-9]/.test(character)) {
    return toDelay(
      humanDelayProfile.digitTypeMinMs,
      humanDelayProfile.digitTypeMaxMs,
      random
    );
  }

  return toDelay(
    humanDelayProfile.symbolTypeMinMs,
    humanDelayProfile.symbolTypeMaxMs,
    random
  );
}

async function smoothScrollIntoView(locator: Locator): Promise<void> {
  await locator.evaluate((element) => {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  });

  // Give the browser time to render the smooth animation.
  await new Promise((resolve) => setTimeout(resolve, 180));
}

export function createHumanLikeEngine(seed?: string): HumanLikeEngine {
  const random = seed
    ? createXorshift32(hashStringToUint32(seed))
    : Math.random;

  return {
    async pause(minMs: number, maxMs: number): Promise<void> {
      const delayMs = toDelay(minMs, maxMs, random);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    },
    async scrollIntoView(page: Page, selector: string): Promise<void> {
      await smoothScrollIntoView(page.locator(selector).first());
    },
    async hoverAndClick(page: Page, selector: string): Promise<void> {
      const locator = page.locator(selector).first();
      await smoothScrollIntoView(locator);
      await locator.hover();
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          toDelay(
            humanDelayProfile.hoverDwellMinMs,
            humanDelayProfile.hoverDwellMaxMs,
            random
          )
        )
      );
      await locator.click();
    },
    async typeText(page: Page, selector: string, value: string): Promise<void> {
      const locator = page.locator(selector).first();
      await smoothScrollIntoView(locator);
      await locator.fill("");

      if (!value) {
        return;
      }

      for (const character of value) {
        await locator.pressSequentially(character, {
          delay: resolveTypeDelay(character, random),
        });
      }
    },
  };
}
