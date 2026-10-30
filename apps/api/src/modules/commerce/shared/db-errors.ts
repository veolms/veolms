/**
 * Postgres unique_violation (23505), as raised by the pg driver.
 *
 * Pass `constraint` to ask about one unique rule only. A service that turns
 * a violation into its own error ("this slug is taken") must name the rule
 * it means: a transaction usually writes more than one unique column, and
 * every other clash would be reported under the same wrong reason.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "23505" &&
    (constraint === undefined ||
      (err as { constraint?: unknown }).constraint === constraint)
  );
}
