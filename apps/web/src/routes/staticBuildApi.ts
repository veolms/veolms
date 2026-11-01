const RETRY_DELAY_STEP_MS = 1_000;
const RETRY_DELAY_MAX_MS = 5_000;
// How long one try may wait for its whole answer: 4 seconds, or a third of
// the budget when that is longer (the catalogue's 90 seconds gives 30).
const ATTEMPT_TIMEOUT_MS = 4_000;
// A try is only started when it can wait at least this long.
const MIN_ATTEMPT_TIMEOUT_MS = 1_000;
// With no budget to retry in (the dev server's background refreshes), the
// one try waits as long as before.
const LONE_ATTEMPT_TIMEOUT_MS = 30_000;

/**
 * One request, its body read in full within `timeoutMs`: an answer that
 * stalls half way counts as a failed try, not as a body that fails to
 * parse after the request has returned.
 */
async function fetchWithin(url: string, timeoutMs: number) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  const body = await response.arrayBuffer();
  return new Response(body.byteLength > 0 ? body : null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// Build-time requests to the static build API are retried while it is briefly
// unreachable, slow to answer, or failing. In local development the API runs
// under `node --watch`, which restarts it when the web build reads files they
// share, so a build regularly meets a refused or reset connection; the
// deployed build has failed on one answer that took over 10 seconds. Nothing
// else retries these requests: React Router ignores the prerender retry
// options and aborts each prerender request after 10 seconds, so a loader
// must keep `retryBudgetMs` below that. Each try is cut short well inside the
// budget, so a request that hangs is tried again rather than waited on until
// React Router gives up on the whole page.
export async function fetchStaticBuildApi(url: string, retryBudgetMs: number) {
  if (retryBudgetMs <= 0) return fetchWithin(url, LONE_ATTEMPT_TIMEOUT_MS);
  const deadline = Date.now() + retryBudgetMs;
  const attemptLimit = Math.max(ATTEMPT_TIMEOUT_MS, retryBudgetMs / 3);
  for (let attempt = 1; ; attempt += 1) {
    const timeout = Math.max(
      MIN_ATTEMPT_TIMEOUT_MS,
      Math.min(attemptLimit, deadline - Date.now()),
    );
    let response: Response | undefined;
    let failure: unknown;
    try {
      response = await fetchWithin(url, timeout);
      if (response.status < 500) return response;
    } catch (error) {
      failure = error;
    }
    const delay = Math.min(RETRY_DELAY_STEP_MS * attempt, RETRY_DELAY_MAX_MS);
    if (Date.now() + delay + MIN_ATTEMPT_TIMEOUT_MS > deadline) {
      if (response) return response;
      throw failure;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
