import { useSyncExternalStore } from "react";
import { readSessionPresence, writeSessionPresence } from "./sessionPresence";
import type { LoginResponse, UserProfileResponse } from "@veolms/contracts";

export type AuthUser = UserProfileResponse | LoginResponse["user"];

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthIdentityHint {
  // Identity hints are only for display and locating UI preferences. Roles
  // and authenticated state still come from `/auth/me`.
  displayName: string;
  userId?: string;
  username?: string;
  /** A hosted picture address only; pictures embedded as data are skipped. */
  avatarUrl?: string;
}

const MAX_HINT_AVATAR_URL_LENGTH = 2_000;

function readOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readHostedAvatarUrl(value: unknown): string | undefined {
  const url = readOptionalText(value);
  return url &&
    url.length <= MAX_HINT_AVATAR_URL_LENGTH &&
    /^https?:\/\//i.test(url)
    ? url
    : undefined;
}

function createIdentityHint(source: {
  displayName?: unknown;
  userId?: unknown;
  username?: unknown;
  avatarUrl?: unknown;
}): AuthIdentityHint | null {
  const displayName = readOptionalText(source.displayName);
  if (!displayName) return null;
  const userId = readOptionalText(source.userId);
  const username = readOptionalText(source.username);
  const avatarUrl = readHostedAvatarUrl(source.avatarUrl);
  return {
    displayName,
    ...(userId ? { userId } : {}),
    ...(username ? { username } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function createIdentityHintFromUser(
  user: AuthUser | null,
): AuthIdentityHint | null {
  if (!user) return null;
  const fields = user as {
    username?: unknown;
    avatarDataUrl?: unknown;
  };
  return createIdentityHint({
    displayName: user.displayName,
    userId: user.id,
    username: fields.username,
    avatarUrl: fields.avatarDataUrl,
  });
}

const AUTH_IDENTITY_HINT_KEY = "veolms-auth-identity";

function readIdentityHint(): AuthIdentityHint | null {
  if (typeof window === "undefined") return null;
  try {
    const savedHint = window.sessionStorage.getItem(AUTH_IDENTITY_HINT_KEY);
    if (!savedHint?.trim()) return null;

    try {
      const parsed: unknown = JSON.parse(savedHint);
      if (parsed && typeof parsed === "object") {
        const hint = createIdentityHint(parsed as Record<string, unknown>);
        if (hint) return hint;
      }
    } catch {
      // Support the display-name-only value written by older app versions.
    }

    return { displayName: savedHint.trim() };
  } catch {
    return null;
  }
}

function writeIdentityHint(hint: AuthIdentityHint | null) {
  if (typeof window === "undefined") return;
  writeSessionPresence(hint !== null);
  try {
    if (hint) {
      window.sessionStorage.setItem(
        AUTH_IDENTITY_HINT_KEY,
        JSON.stringify(hint),
      );
    } else {
      window.sessionStorage.removeItem(AUTH_IDENTITY_HINT_KEY);
    }
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
}

let identityHint = readIdentityHint();
// Captured once at startup: whether this browser looked signed in before the
// session check ran.
const sessionPresentAtBoot = readSessionPresence();

let state: AuthState = {
  // The session cookie and `/auth/me` are the source of truth. Persisting the
  // complete user object here made stale RBAC menus survive a reload and could
  // briefly render another account's sidebar before the session was checked.
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

const serverState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

let writeGeneration = 0;

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export const authStore = {
  getState(): AuthState {
    return state;
  },

  getWriteGeneration(): number {
    return writeGeneration;
  },

  getIdentityHint(): AuthIdentityHint | null {
    return identityHint;
  },

  hasSessionHint(): boolean {
    return identityHint !== null;
  },

  setUser(user: AuthUser | null) {
    writeGeneration += 1;
    identityHint = createIdentityHintFromUser(user);
    writeIdentityHint(identityHint);
    state = {
      ...state,
      user,
      isAuthenticated: Boolean(user),
      isLoading: false,
    };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("veolms-auth-user");
      } catch {
        // ignore storage errors
      }
    }
    notify();
  },

  setLoading(isLoading: boolean) {
    state = {
      ...state,
      isLoading,
    };
    notify();
  },

  clearAuth() {
    writeGeneration += 1;
    identityHint = null;
    writeIdentityHint(null);
    state = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
    };
    if (typeof window !== "undefined") {
      try {
        // Remove the legacy cache so older builds cannot reintroduce stale
        // user/role/menu state if the account is opened again.
        window.localStorage.removeItem("veolms-auth-user");
      } catch {
        // ignore storage errors
      }
    }
    notify();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useAuthStore<T = AuthState>(
  selector: (s: AuthState) => T = (s) => s as unknown as T,
): T {
  return useSyncExternalStore(
    authStore.subscribe,
    () => selector(authStore.getState()),
    () => selector(serverState),
  );
}

/**
 * Whether this browser looked signed in when the page started. False during
 * hydration so the first client render matches the prerendered guest markup.
 */
export function useSessionPresentAtBoot(): boolean {
  return useSyncExternalStore(
    authStore.subscribe,
    () => sessionPresentAtBoot,
    () => false,
  );
}

export function useAuthIdentityHint(): AuthIdentityHint | null {
  return useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getIdentityHint(),
    () => null,
  );
}
