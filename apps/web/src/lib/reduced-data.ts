/**
 * Whether the visitor's connection asks the page to fetch only what they
 * ask for: data saver is on, or the connection is 2G. Things fetched ahead
 * of time on a guess (a lesson preloaded on hover, a course's whole
 * curriculum) are skipped then; what the visitor clicks is still fetched.
 */
export function prefersReducedData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return (
    Boolean(connection?.saveData) ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g"
  );
}
