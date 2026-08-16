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
  const [value, setValue] = useState<T>(() => {
    try {
      const storage = getSessionStorage();
      const savedValue =
        storage?.getItem(key) ??
        legacyKeys
          .map((legacyKey) => storage?.getItem(legacyKey))
          .find((candidate) => candidate !== null && candidate !== undefined);
      if (savedValue === null || savedValue === undefined) return initialValue;
      const parsedValue: unknown = JSON.parse(savedValue);
      if (isValid && !isValid(parsedValue)) return initialValue;
      return parsedValue as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const storage = getSessionStorage();
      storage?.setItem(key, JSON.stringify(value));
      legacyKeys.forEach((legacyKey) => storage?.removeItem(legacyKey));
    } catch {
      // Drafts remain usable in memory when browser storage is unavailable.
    }
  }, [key, legacyKeys, value]);

  return [value, setValue];
}

export const isStoredString = (value: unknown): value is string =>
  typeof value === "string";

export const isStoredBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
