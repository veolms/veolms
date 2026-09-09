import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

try {
  if (!window.localStorage || typeof window.localStorage.clear !== "function") {
    const mock = createStorageMock();
    Object.defineProperty(window, "localStorage", { value: mock, writable: true, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: mock, writable: true, configurable: true });
  }
} catch {
  const mock = createStorageMock();
  Object.defineProperty(window, "localStorage", { value: mock, writable: true, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: mock, writable: true, configurable: true });
}

beforeEach(() => {
  try {
    window.localStorage?.clear?.();
  } catch {
    // ignore
  }
  try {
    window.sessionStorage?.clear?.();
  } catch {
    // ignore
  }
});

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: query === "(max-width: 640px)",
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  }),
});

// CodeMirror measures DOM ranges to keep the active selection in view. JSDOM
// does not implement these geometry methods, so tests provide empty geometry.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}
