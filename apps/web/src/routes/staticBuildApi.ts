const RETRY_DELAY_STEP_MS = 1_000;
const RETRY_DELAY_MAX_MS = 5_000;

// Build-time requests to the static build API are retried while it is briefly
// unreachable. In local development the API runs under `node --watch`, which
// restarts it when the web build reads files they share, so a build regularly
// meets a refused or reset connection. Nothing else retries these requests:
// React Router ignores the prerender retry options and aborts each prerender
// request after 10 seconds, so a loader must keep `retryBudgetMs` below that.
export async function fetchStaticBuildApi(url: string, retryBudgetMs: number) {
  const deadline = Date.now() + retryBudgetMs;
  for (let attempt = 1; ; attempt += 1) {
    const delay = Math.min(RETRY_DELAY_STEP_MS * attempt, RETRY_DELAY_MAX_MS);
    const canRetry = Date.now() + delay < deadline;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { accept: "application/json" },
      });
      if (response.status < 500 || !canRetry) return response;
    } catch (error) {
      if (!canRetry) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
