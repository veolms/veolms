/**
 * The line under "Couldn't load …" on the lesson page. "Check your
 * connection" only when the device is offline or no answer came (status
 * 0): said over a server error or a missing file, it sent learners looking
 * in the wrong place (21 Nov 2026). With nothing known, it blames no one.
 */
export function loadFailureMessage(status?: number): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You're offline. Check your internet connection and try again.";
  }
  if (status === 0) return "Check your internet connection and try again.";
  if (status === 404 || status === 410) {
    return "It's missing on our side. If this keeps happening, please report it.";
  }
  if (status !== undefined && status >= 500) {
    return "Our server hit a snag. Please try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}
