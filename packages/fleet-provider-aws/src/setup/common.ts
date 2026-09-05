/**
 * Detects whether the current execution is non-interactive.
 * Checks common CLI flags (--yes, -y, --non-interactive, --force)
 * and environment variables (NON_INTERACTIVE, SETUP_NON_INTERACTIVE).
 */
export function isNonInteractive(): boolean {
  return (
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    process.argv.includes("--non-interactive") ||
    process.argv.includes("--force") ||
    process.env["NON_INTERACTIVE"] === "true" ||
    process.env["SETUP_NON_INTERACTIVE"] === "true"
  );
}
