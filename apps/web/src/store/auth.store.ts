import { useSyncExternalStore } from "react";
import type { LoginResponse, UserProfileResponse } from "@veolms/contracts";

export type AuthUser = UserProfileResponse | LoginResponse["user"];

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthIdentityHint {
  // Display-only hint; roles and authenticated state still come from /auth/me.
  displayName: string;
}

const AUTH_IDENTITY_HINT_KEY = "veolms-auth-identity";

function readIdentityHint(): AuthIdentityHint | null {
  if (typeof window === "undefined") return null;
  try {
    const displayName = window.sessionStorage.getItem(AUTH_IDENTITY_HINT_KEY);
    return displayName?.trim() ? { displayName: displayName.trim() } : null;
  } catch {
    return null;
  }
}

function writeIdentityHint(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    const displayName = user?.displayName?.trim();
    if (displayName) {
      window.sessionStorage.setItem(AUTH_IDENTITY_HINT_KEY, displayName);
    } else {
      window.sessionStorage.removeItem(AUTH_IDENTITY_HINT_KEY);
    }
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
}

let identityHint = readIdentityHint();

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
    identityHint = user?.displayName?.trim()
      ? { displayName: user.displayName.trim() }
      : null;
    writeIdentityHint(user);
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

export function useAuthIdentityHint(): AuthIdentityHint | null {
  return useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getIdentityHint(),
    () => null,
  );
}
