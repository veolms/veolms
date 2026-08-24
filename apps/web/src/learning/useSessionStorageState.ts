import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

type StoredStateValidator<T> = (value: unknown) => value is T;
const NO_LEGACY_KEYS: readonly string[] = [];

const getSessionStorage = () =>
  typeof window === "undefined" ? null : window.sessionStorage;

export function useSessionStorageState<T>(
  key: string,
  initialValue: T,
  isValid?: StoredStateValidator<T>,
  legacyKeys: readonly string[] = NO_LEGACY_KEYS,
): [T, Dispatch<SetStateAction<T>>] {
  // The server cannot see sessionStorage. Use the same deterministic value for
  // SSR and the browser's first render, then restore the tab-local value after
  // hydration. Reading storage in the initializer caused React to discard the
  // prerender whenever a draft or search value already existed.
  const [value, setValue] = useState<T>(initialValue);
  const [storageReadyKey, setStorageReadyKey] = useState<string | null>(null);

  useEffect(() => {
    setStorageReadyKey(null);
    try {
      const storage = getSessionStorage();
      const savedValue =
        storage?.getItem(key) ??
        legacyKeys
          .map((legacyKey) => storage?.getItem(legacyKey))
          .find((candidate) => candidate !== null && candidate !== undefined);
      if (savedValue === null || savedValue === undefined) {
        setValue(initialValue);
        setStorageReadyKey(key);
        return;
      }
      const parsedValue: unknown = JSON.parse(savedValue);
      setValue(isValid && !isValid(parsedValue) ? initialValue : (parsedValue as T));
    } catch {
      setValue(initialValue);
    }
    setStorageReadyKey(key);
    // `initialValue` is the server snapshot for this keyed state. Consumers
    // pass stable primitives or module constants; key changes intentionally
    // trigger a fresh storage read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (storageReadyKey !== key) return;
    try {
      const storage = getSessionStorage();
      storage?.setItem(key, JSON.stringify(value));
      legacyKeys.forEach((legacyKey) => storage?.removeItem(legacyKey));
    } catch {
      // Drafts remain usable in memory when browser storage is unavailable.
    }
  }, [key, legacyKeys, storageReadyKey, value]);

  return [value, setValue];
}

export const isStoredString = (value: unknown): value is string =>
  typeof value === "string";

export const isStoredBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
