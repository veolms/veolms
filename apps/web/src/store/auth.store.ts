import { useSyncExternalStore } from "react";
import type { LoginResponse, UserProfileResponse } from "@veolms/contracts";

export type AuthUser = UserProfileResponse | LoginResponse["user"];

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const STORAGE_KEY = "veolms-auth-user";

function getInitialUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const initialUser = getInitialUser();

let state: AuthState = {
  user: initialUser,
  isAuthenticated: Boolean(initialUser),
  isLoading: false,
};

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

  setUser(user: AuthUser | null) {
    state = {
      ...state,
      user,
      isAuthenticated: Boolean(user),
      isLoading: false,
    };
    if (typeof window !== "undefined") {
      try {
        if (user) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
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
    state = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
    };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
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
