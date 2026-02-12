export type LogScope = string;

type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export type RunSummaryItem = {
  targetName: string;
  success: boolean;
  durationMs: number;
  confirmationId?: string;
  error?: string;
  screenshotPath?: string;
};

export interface Logger {
  step(scope: LogScope, message: string): void;
  info(scope: LogScope, message: string): void;
  success(scope: LogScope, message: string): void;
  warn(scope: LogScope, message: string): void;
  error(scope: LogScope, message: string): void;
  section(title: string): void;
  printRunSummary(summaryItems: RunSummaryItem[], totalDurationMs: number): void;
}

function currentTimeLabel(): string {
  return new Date().toISOString().slice(11, 19);
}

function formatLine(level: LogLevel, scope: LogScope, message: string): string {
  return `[${currentTimeLabel()}] [${scope}] ${level}: ${message}`;
}

function write(level: LogLevel, scope: LogScope, message: string): void {
  const line = formatLine(level, scope, message);
  if (level === "ERROR") {
    console.error(line);
    return;
  }

  console.log(line);
}

export function createLogger(): Logger {
  return {
    step(scope: LogScope, message: string): void {
      write("INFO", scope, message);
    },
    info(scope: LogScope, message: string): void {
      write("INFO", scope, message);
    },
    success(scope: LogScope, message: string): void {
      write("SUCCESS", scope, message);
    },
    warn(scope: LogScope, message: string): void {
      write("WARN", scope, message);
    },
    error(scope: LogScope, message: string): void {
      write("ERROR", scope, message);
    },
    section(title: string): void {
      console.log(`\n--- ${title} ---`);
    },
    printRunSummary(summaryItems: RunSummaryItem[], totalDurationMs: number): void {
      const successCount = summaryItems.filter((item) => item.success).length;
      const failureCount = summaryItems.length - successCount;

      console.log("\n=== Run Summary ===");
      console.log(`Targets: ${summaryItems.length}`);
      console.log(`Successes: ${successCount}`);
      console.log(`Failures: ${failureCount}`);
      console.log(`Total Duration: ${totalDurationMs}ms`);

      for (const item of summaryItems) {
        if (item.success) {
          console.log(
            `- ${item.targetName}: success (${item.durationMs}ms, confirmation=${item.confirmationId})`
          );
          continue;
        }

        console.log(
          `- ${item.targetName}: failed (${item.durationMs}ms, error=${item.error ?? "unknown"})`
        );
        if (item.screenshotPath) {
          console.log(`  screenshot=${item.screenshotPath}`);
        }
      }
    },
  };
}
