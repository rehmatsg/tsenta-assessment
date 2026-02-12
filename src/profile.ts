import type { UserProfile } from "@/types";

/**
 * Sample candidate profile.
 * Your automation should use this data to fill the application form.
 */
export const sampleProfile: UserProfile = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane.doe@email.com",
  phone: "+1 (555) 123-4567",
  location: "San Francisco, CA",
  linkedIn: "https://linkedin.com/in/janedoe",
  portfolio: "https://github.com/janedoe",
  school: "Stanford University",
  education: "bachelors",
  experienceLevel: "0-1",
  skills: ["javascript", "typescript", "react", "git"],
  workAuthorized: true,
  requiresVisa: false,
  earliestStartDate: "2026-06-01",
  salaryExpectation: "85000",
  referralSource: "linkedin",
  coverLetter:
    "I'm excited to apply for the Software Engineer role at Acme Corp. As a recent CS graduate from Stanford with experience building full-stack applications in TypeScript and React, I'm eager to contribute to a team that values clean code and user-first design. My recent internship at a YC startup gave me hands-on experience with agile development, CI/CD pipelines, and shipping features that impacted thousands of users. I'd love to bring that energy to Acme Corp.",
};
