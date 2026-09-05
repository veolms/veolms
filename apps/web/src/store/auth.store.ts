import { useSyncExternalStore } from "react";
import type { LoginResponse, UserProfileResponse } from "@veolms/contracts";

export type AuthUser = UserProfileResponse | LoginResponse["user"];

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

let state: AuthState = {
  // The session cookie and `/auth/me` are the source of truth. Persisting the
  // complete user object here made stale RBAC menus survive a reload and could
  // briefly render another account's sidebar before the session was checked.
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

  setUser(user: AuthUser | null) {
    writeGeneration += 1;
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
    () => selector(authStore.getState()),
  );
}
