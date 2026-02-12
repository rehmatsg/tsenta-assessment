import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);

test.describe("Automator End-to-End", () => {
  test("submits both ATS forms successfully", async () => {
    const { stdout, stderr } = await execFileAsync("npm", ["start"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
      timeout: 240_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const output = `${stdout}\n${stderr}`;

    expect(output).toContain("Successes: 2");
    expect(output).toMatch(/ACM-[A-Z0-9-]+/);
    expect(output).toMatch(/GX-[A-Z0-9-]+/);
  });
});
