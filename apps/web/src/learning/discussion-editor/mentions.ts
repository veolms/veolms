import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import type { UserAutocompleteItem } from "@veolms/contracts";
import { learningInteractionsService } from "../../services/learning-interactions/learning-interactions.service";

const MAX_CACHE_SIZE = 100;
const DEBOUNCE_MS = 150;

/**
 * Creates a CodeMirror 6 completion source for @mentions.
 *
 * - Triggers when the user types '@' preceded by start of line or non-word character.
 * - Does not trigger inside email addresses or for bare '@' without query characters.
 * - Debounces requests and guards against stale async results and context abortion.
 * - Caches up to 100 courseId/query responses in-memory.
 * - Formats suggestions with Display Name and @username.
 * - Inserts plain-text '@username ' on selection.
 */
export function createMentionCompletionSource(
  courseId: string,
  fetchFn?: (query: string) => Promise<UserAutocompleteItem[]>,
): CompletionSource {
  const cache = new Map<string, UserAutocompleteItem[]>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceResolve: (() => void) | null = null;
  let currentRequestId = 0;

  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    // Match '@' followed by word characters up to the cursor
    const match = context.matchBefore(/@([A-Za-z0-9_]*)$/);
    if (!match) return null;

    // Ensure '@' is at line start or preceded by a non-word character (avoids user@example.com)
    if (match.from > 0) {
      const prevChar = context.state.sliceDoc(match.from - 1, match.from);
      if (/[A-Za-z0-9_]/.test(prevChar)) {
        return null;
      }
    }

    const query = match.text.slice(1);
    // The backend requires query length >= 1; do not send an empty search request for bare '@'
    if (!query || query.trim().length === 0) {
      return null;
    }

    const normalizedQuery = query.trim().toLowerCase();
    const cacheKey = `${courseId}:${normalizedQuery}`;

    // Return cached results synchronously or immediately if available
    if (cache.has(cacheKey)) {
      const cachedUsers = cache.get(cacheKey)!;
      if (cachedUsers.length === 0) return null;
      return buildCompletionResult(match.from, cachedUsers);
    }

    const requestId = ++currentRequestId;

    // Resolve any previous in-flight debounce promise so it completes cleanly and exits
    if (debounceResolve) {
      debounceResolve();
      debounceResolve = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Debounce network requests
    await new Promise<void>((resolve) => {
      debounceResolve = resolve;
      debounceTimer = setTimeout(() => {
        debounceResolve = null;
        debounceTimer = null;
        resolve();
      }, DEBOUNCE_MS);
    });

    // Guard against stale async results and context abortion
    if (context.aborted || requestId !== currentRequestId) {
      return null;
    }

    try {
      const users = fetchFn
        ? await fetchFn(normalizedQuery)
        : (
            await learningInteractionsService.autocompleteUsers({
              courseId,
              query: normalizedQuery,
              limit: 10,
            })
          ).users;

      // Check again after async fetch for cancellation or newer requests
      if (context.aborted || requestId !== currentRequestId) {
        return null;
      }

      // Store in bounded LRU-style cache
      if (cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(cacheKey, users);

      if (!users || users.length === 0) {
        return null;
      }

      return buildCompletionResult(match.from, users);
    } catch {
      // Autocomplete failure must NOT prevent typing or submitting
      return null;
    }
  };
}

function buildCompletionResult(
  from: number,
  users: readonly UserAutocompleteItem[],
): CompletionResult {
  const options: Completion[] = users.map((user) => ({
    label: user.displayName,
    displayLabel: user.displayName,
    detail: `@${user.username}`,
    type: "text",
    // Selecting a suggestion MUST insert '@username '
    apply: `@${user.username} `,
  }));

  return {
    from,
    options,
    filter: false, // Server has already filtered matches
  };
}
