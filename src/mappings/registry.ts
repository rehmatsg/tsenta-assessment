import type { PlatformId } from "../handlers/types";
import type { UserProfile } from "../types";

type ExperienceLevelMap = Record<UserProfile["experienceLevel"], string>;
type EducationMap = Record<UserProfile["education"], string>;

type PlatformMappingRegistry = {
  experienceLevel: ExperienceLevelMap;
  education: EducationMap;
  referralSource: Record<string, string>;
  skill: Record<string, string>;
};

export const mappingRegistry: Record<PlatformId, PlatformMappingRegistry> = {
  acme: {
    experienceLevel: {
      "0-1": "0-1",
      "1-3": "1-3",
      "3-5": "3-5",
      "5-10": "5-10",
      "10+": "10+",
    },
    education: {
      "high-school": "high-school",
      associates: "associates",
      bachelors: "bachelors",
      masters: "masters",
      phd: "phd",
    },
    referralSource: {},
    skill: {},
  },
  globex: {
    experienceLevel: {
      "0-1": "intern",
      "1-3": "junior",
      "3-5": "mid",
      "5-10": "senior",
      "10+": "staff",
    },
    education: {
      "high-school": "hs",
      associates: "assoc",
      bachelors: "bs",
      masters: "ms",
      phd: "phd",
    },
    referralSource: {
      linkedin: "linkedin",
      "company-website": "website",
      "job-board": "board",
      referral: "referral",
      university: "university",
      other: "other",
    },
    skill: {
      javascript: "js",
      typescript: "ts",
      python: "py",
      react: "react",
      nodejs: "node",
      node: "node",
      sql: "sql",
      git: "git",
      docker: "docker",
      aws: "aws",
      graphql: "graphql",
    },
  },
};

export function mapExperienceLevel(
  platform: PlatformId,
  value: UserProfile["experienceLevel"]
): string {
  return mappingRegistry[platform].experienceLevel[value];
}

export function mapEducation(
  platform: PlatformId,
  value: UserProfile["education"]
): string {
  return mappingRegistry[platform].education[value];
}

export function mapReferralSource(platform: PlatformId, value: string): string {
  if (platform === "acme") {
    return value;
  }

  const normalizedValue = value.toLowerCase();
  return mappingRegistry.globex.referralSource[normalizedValue] ?? "other";
}

export function mapSkill(platform: PlatformId, rawSkill: string): string | null {
  const normalizedSkill = rawSkill.toLowerCase();

  if (platform === "acme") {
    return normalizedSkill;
  }

  return mappingRegistry.globex.skill[normalizedSkill] ?? null;
}
