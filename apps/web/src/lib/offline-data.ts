import {
  getOfflineDataProvider,
  type OfflineDataProvider,
} from "@veolms/web-core";

/**
 * Whether a request failed because there was no network: the app client's
 * `ERR_NETWORK`, or `fetch` rejecting outright. A server that answered,
 * even with an error, is not a network failure.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ERR_NETWORK"
  );
}

/**
 * Runs `load`; when it fails for lack of a network, asks the registered
 * offline data provider (a plugin, e.g. offline downloads) for what it kept.
 * Without a provider, or when it has nothing, the original error stands.
 */
export async function withOfflineFallback<T>(
  load: () => Promise<T>,
  fallback: (provider: OfflineDataProvider) => Promise<unknown>,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const provider = isNetworkFailure(error) ? getOfflineDataProvider() : null;
    if (!provider) throw error;
    const kept = await fallback(provider).catch(() => null);
    if (kept === null || kept === undefined) throw error;
    return kept as T;
  }
}
