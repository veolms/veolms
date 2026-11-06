import type { ReactNode } from "react";

/**
 * One legal or company page: its words, from the ProCodrr website's own
 * pages, and what its head and "On this page" list need.
 */
export interface LegalDocument {
  path: string;
  /** The document title (the browser tab). */
  title: string;
  description: string;
  heading: string;
  /** "Effective date: …", as the page states it. */
  effective?: string;
  intro: ReactNode;
  /** The page's sections, in order: each one's element id and heading. */
  sections: readonly { id: string; title: string }[];
  body: ReactNode;
}
