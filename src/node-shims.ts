declare module "node:fs/promises" {
  export function mkdir(
    path: string,
    options?: { recursive?: boolean }
  ): Promise<void>;
}

declare module "node:process" {
  const process: {
    env: Record<string, string | undefined>;
    argv: string[];
  };

  export default process;
}
