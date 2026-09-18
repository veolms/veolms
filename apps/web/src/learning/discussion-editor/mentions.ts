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

interface MentionCompletion extends Completion {
  avatarInitials: string;
  avatarUrl?: string | null;
}

/** Creates the existing CodeMirror @mention completion source. */
export function createMentionCompletionSource(
  courseId: string,
  fetchFn?: (query: string) => Promise<UserAutocompleteItem[]>,
): CompletionSource {
  const cache = new Map<string, UserAutocompleteItem[]>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceResolve: (() => void) | null = null;
  let currentRequestId = 0;

  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const match = context.matchBefore(/@([A-Za-z0-9_]*)$/);
    if (!match) return null;

    if (match.from > 0) {
      const prevChar = context.state.sliceDoc(match.from - 1, match.from);
      if (/[A-Za-z0-9_]/.test(prevChar)) return null;
    }

    const query = match.text.slice(1);
    if (!query || query.trim().length === 0) return null;

    const normalizedQuery = query.trim().toLowerCase();
    const cacheKey = `${courseId}:${normalizedQuery}`;
    if (cache.has(cacheKey)) {
      const cachedUsers = cache.get(cacheKey)!;
      return cachedUsers.length > 0
        ? buildCompletionResult(match.from, cachedUsers)
        : null;
    }

    const requestId = ++currentRequestId;
    if (debounceResolve) {
      debounceResolve();
      debounceResolve = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    await new Promise<void>((resolve) => {
      debounceResolve = resolve;
      debounceTimer = setTimeout(() => {
        debounceResolve = null;
        debounceTimer = null;
        resolve();
      }, DEBOUNCE_MS);
    });

    if (context.aborted || requestId !== currentRequestId) return null;

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

      if (context.aborted || requestId !== currentRequestId) return null;

      if (cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(cacheKey, users);
      return users.length > 0 ? buildCompletionResult(match.from, users) : null;
    } catch {
      return null;
    }
  };
}

function buildCompletionResult(
  from: number,
  users: readonly UserAutocompleteItem[],
): CompletionResult {
  const options: MentionCompletion[] = users.map((user) => {
    const displayName = user.displayName || user.username;
    return {
      label: displayName,
      displayLabel: displayName,
      detail: `@${user.username}`,
      type: "text",
      avatarInitials: getAvatarInitials(displayName, user.username),
      avatarUrl: user.avatarUrl,
      apply: `@${user.username} `,
    };
  });

  return { from, options, filter: false };
}

function getAvatarInitials(displayName: string, username: string): string {
  const words = (displayName.trim() || username.trim())
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  }
  return (words[0] || "?").slice(0, 2).toUpperCase();
}

export function mentionCompletionOptionClass(): string {
  return "cm-mention-option";
}

export function renderMentionCompletionAddon(
  completion: Completion,
): Node | null {
  const mention = completion as MentionCompletion;
  const avatar = document.createElement("span");
  avatar.className = "cm-mention-avatar";
  avatar.setAttribute("aria-hidden", "true");

  const showFallback = () => {
    avatar.textContent = mention.avatarInitials;
    avatar.classList.add("cm-mention-avatar--fallback");
  };

  if (!mention.avatarUrl) {
    showFallback();
    return avatar;
  }

  const image = document.createElement("img");
  image.src = mention.avatarUrl;
  image.alt = "";
  image.decoding = "async";
  image.addEventListener("error", showFallback, { once: true });
  avatar.append(image);
  return avatar;
}
