/**
 * Browser storage that belongs to one account.
 *
 * An entry kept under a plain key is the whole browser's: on a shared
 * browser the next account to sign in reads what the last one left. The
 * entries here are kept under the account's id instead, in the shape the
 * learning-progress store uses (`veolms-learning-progress-v1:<user>:...`).
 */
const ACCOUNT_STORAGE_PREFIX = "veolms-account-v1";

type AccountStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The account's own key for an entry that used to be kept under `key`. */
export function accountScopedStorageKey(
  accountId: string,
  key: string,
): string {
  return `${ACCOUNT_STORAGE_PREFIX}:${encodeURIComponent(accountId)}:${key}`;
}

/**
 * Reads the account's entry for `key`.
 *
 * An entry saved before entries were per account still sits under the plain
 * key. The first account to read it takes it over: it is moved, not copied,
 * so whoever signs in next finds nothing there. That is the best that can
 * be done for it, since the old entry does not say whose it was, and it
 * keeps the writer (the usual first reader) from losing their text.
 *
 * Returns null when there is nothing saved or storage cannot be used. When
 * the move cannot be written the old entry is left where it was.
 */
export function readAccountScopedItem(
  storage: AccountStorage,
  accountId: string,
  key: string,
): string | null {
  try {
    const scopedKey = accountScopedStorageKey(accountId, key);
    const saved = storage.getItem(scopedKey);
    if (saved !== null) return saved;

    const unscoped = storage.getItem(key);
    if (unscoped === null) return null;
    storage.setItem(scopedKey, unscoped);
    storage.removeItem(key);
    return unscoped;
  } catch {
    // Storage can be full, or unavailable in privacy-restricted contexts.
    return null;
  }
}
