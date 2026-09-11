import { execSync } from "node:child_process";
import type { Interface as ReadlineInterface } from "node:readline/promises";

export function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}

export function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

export function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}

export function green(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}

export function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[0m`;
}

export function cyan(s: string): string {
  return `\x1b[36m${s}\x1b[0m`;
}

export function ok(msg: string): void {
  console.log(`  ${green("✔")} ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${cyan("ℹ")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${yellow("⚠")} ${msg}`);
}

export function fail(msg: string): void {
  console.log(`  ${red("✘")} ${msg}`);
}

export function step(n: number, total: number, title: string): void {
  console.log(`\n${bold(cyan(`[${n}/${total}]`))} ${bold(title)}`);
  console.log(dim("─".repeat(52)));
}

export function banner(
  title = "VeoLMS Infrastructure Setup",
  subtitle?: string,
): void {
  const width = 56;
  const pad = (text: string) => {
    const totalSpaces = Math.max(0, width - text.length);
    const left = Math.floor(totalSpaces / 2);
    const right = totalSpaces - left;
    return " ".repeat(left) + text + " ".repeat(right);
  };

  console.log(`
${bold(cyan(`╔${"═".repeat(width)}╗`))}
${bold(cyan("║"))}${bold(pad(title))}${bold(cyan("║"))}`);
  if (subtitle) {
    console.log(`${bold(cyan("║"))}${pad(subtitle)}${bold(cyan("║"))}`);
  }
  console.log(`${bold(cyan(`╚${"═".repeat(width)}╝`))}\n`);
}

/**
 * Safely executes a shell command synchronously, returning its trimmed stdout string
 * or null if execution fails.
 */
export function execCommand(command: string): string | null {
  try {
    return execSync(command, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

/**
 * Type guard to safely check if an object implements readline.Interface.
 * Safe across Node.js versions, Windows terminals, and custom mock objects.
 */
export function isReadlineInterface(obj: unknown): obj is ReadlineInterface {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "question" in obj &&
    typeof (obj as { question?: unknown }).question === "function"
  );
}

export interface InteractiveCheckOptions {
  readonly interactive?: boolean;
  readonly nonInteractive?: boolean;
  readonly force?: boolean;
}

/**
 * Checks whether the current process is in non-interactive / headless mode.
 * Evaluates CLI flags (--yes, -y, --non-interactive, --force) and environment variables
 * (CI=true, SETUP_NON_INTERACTIVE=true, NON_INTERACTIVE=true), as well as process.stdin.isTTY.
 */
export function isNonInteractive(options?: InteractiveCheckOptions): boolean {
  if (options && typeof options === "object") {
    if (options.nonInteractive === true || options.interactive === false) {
      return true;
    }
    if (options.interactive === true) {
      return false;
    }
  }
  return (
    process.env["SETUP_NON_INTERACTIVE"] === "true" ||
    process.env["NON_INTERACTIVE"] === "true" ||
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    process.argv.includes("--non-interactive") ||
    process.argv.includes("--force")
  );
}

/**
 * Prompts user for a text response, with default value fallback and cross-platform
 * line-ending handling (CRLF on Windows, LF on Linux/macOS).
 */
export async function ask(
  rl: ReadlineInterface | undefined,
  question: string,
  defaultVal?: string,
  nonInteractive?: boolean,
): Promise<string> {
  const isNonInter = nonInteractive ?? (!rl || isNonInteractive());
  const hint = defaultVal !== undefined ? dim(` (default: ${defaultVal})`) : "";
  if (isNonInter || !rl) {
    console.log(
      `  ${bold("?")} ${question}${hint}: ${green(defaultVal ?? "")}`,
    );
    return defaultVal ?? "";
  }
  const answer = await rl.question(`  ${bold("?")} ${question}${hint}: `);
  // Normalize Windows CRLF (\r\n) and trim outer whitespace
  const trimmed = answer.replace(/\r$/, "").trim();
  return trimmed === "" && defaultVal !== undefined ? defaultVal : trimmed;
}

/**
 * Prompts user to select from a numbered list of choices, with default selection
 * and cross-platform line-ending handling.
 */
export async function askChoice<T extends string>(
  rl: ReadlineInterface | undefined,
  question: string,
  choices: ReadonlyArray<{ readonly label: string; readonly value: T }>,
  defaultIndex = 0,
  nonInteractive?: boolean,
): Promise<T> {
  console.log(`  ${bold("?")} ${question}`);
  choices.forEach((c, i) => {
    const marker = i === defaultIndex ? green("→") : " ";
    console.log(`    ${marker} ${bold(`${i + 1}.`)} ${c.label}`);
  });
  const isNonInter = nonInteractive ?? (!rl || isNonInteractive());
  if (isNonInter || !rl) {
    const chosen = choices[defaultIndex]!.value;
    console.log(`  Auto-selected: ${green(choices[defaultIndex]!.label)}`);
    return chosen;
  }
  const answer = await rl.question(
    `  Enter number ${dim(`(default: ${defaultIndex + 1})`)}: `,
  );
  const trimmed = answer.replace(/\r$/, "").trim();
  const num = trimmed === "" ? defaultIndex + 1 : parseInt(trimmed, 10);
  const choice = choices[num - 1];
  if (!choice) {
    console.log(
      `  ${yellow("⚠")} Invalid choice. Using default: ${choices[defaultIndex]!.label}`,
    );
    return choices[defaultIndex]!.value;
  }
  return choice.value;
}
