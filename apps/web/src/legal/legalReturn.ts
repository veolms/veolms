import { useEffect } from "react";

import { LEGAL_PAGES } from "./legalPages";

/**
 * Where the legal pages' Back button returns: the last app page the reader
 * was on before them. Kept per tab, with its place in the tab's history, so
 * Back leaves the legal pages in one step however many of them were read.
 */
const STORAGE_KEY = "veolms-legal-return";
const LEGAL_PATHS: ReadonlySet<string> = new Set(
  LEGAL_PAGES.map((page) => page.path),
);

export interface LegalReturn {
  path: string;
  /** React Router's position in the history for that page, when known. */
  index: number | null;
}

function historyIndex(): number | null {
  const index = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof index === "number" ? index : null;
}

/** Remembers every app page that is not a legal page (called by the root). */
export function useRememberAppPage(pathname: string, search: string) {
  useEffect(() => {
    if (LEGAL_PATHS.has(pathname)) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ path: `${pathname}${search}`, index: historyIndex() }),
      );
    } catch {
      // Storage refused (private mode): Back falls back to the home page.
    }
  }, [pathname, search]);
}

function readLegalReturn(): LegalReturn | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<LegalReturn> | null;
    if (!value || typeof value.path !== "string") return null;
    if (!value.path.startsWith("/") || value.path.startsWith("//")) return null;
    return {
      path: value.path,
      index: typeof value.index === "number" ? value.index : null,
    };
  } catch {
    return null;
  }
}

/**
 * Leaves the legal pages: back through the history to the app page they
 * were opened from, or to that page anew, or home when there is none.
 */
export function leaveLegalPages(navigate: {
  (delta: number): void;
  (path: string): void;
}) {
  const target = readLegalReturn();
  const current = historyIndex();
  if (target?.index !== null && target && current !== null) {
    if (current > target.index) {
      navigate(target.index - current);
      return;
    }
  }
  navigate(target?.path ?? "/");
}
