import {
  sitePageDocumentSchema,
  type SitePageDocument,
  type SiteSection,
  type SiteSectionType,
} from "@veolms/contracts";
import { newSection, newSectionId } from "@veolms/site-render";
import type { SiteThemeId } from "@veolms/contracts";
import { SECTION_CATALOG } from "./sectionCatalog";

/**
 * The page being edited and the changes made to it. Edits are plain data
 * changes on the page document; the history keeps the documents before
 * and after, for undo and redo.
 */

export type EditablePage = SitePageDocument;

export interface PageHistory {
  past: EditablePage[];
  present: EditablePage;
  future: EditablePage[];
  /** The last typing edit, so a burst of typing is one undo step. */
  coalesce: { key: string; at: number } | null;
}

const HISTORY_LIMIT = 80;

export type PageEdit =
  | {
      type: "settings";
      sectionId: string;
      patch: Record<string, unknown>;
      /** Typing into one field merges into one undo step. */
      coalesceKey?: string;
    }
  | { type: "layout"; sectionId: string; layout: string }
  | {
      type: "add";
      sectionType: SiteSectionType;
      themeId: SiteThemeId;
      index: number;
    }
  | { type: "remove"; sectionId: string }
  | { type: "duplicate"; sectionId: string }
  | { type: "move"; sectionId: string; toIndex: number }
  | { type: "seo"; patch: Partial<EditablePage["seo"]>; coalesceKey?: string };

export type HistoryAction =
  | { type: "edit"; edit: PageEdit; at: number }
  | { type: "undo" }
  | { type: "redo" };

function applyEdit(page: EditablePage, edit: PageEdit): EditablePage {
  const sections = page.sections;
  const index = (id: string) => sections.findIndex((entry) => entry.id === id);
  switch (edit.type) {
    case "settings":
      return {
        ...page,
        sections: sections.map((entry) =>
          entry.id === edit.sectionId
            ? ({
                ...entry,
                settings: { ...entry.settings, ...edit.patch },
              } as SiteSection)
            : entry,
        ),
      };
    case "layout":
      return {
        ...page,
        sections: sections.map((entry) =>
          entry.id === edit.sectionId
            ? ({ ...entry, layout: edit.layout } as SiteSection)
            : entry,
        ),
      };
    case "add": {
      const added = newSection(edit.sectionType, edit.themeId);
      const next = [...sections];
      next.splice(Math.max(0, Math.min(edit.index, next.length)), 0, added);
      return { ...page, sections: next };
    }
    case "remove":
      return {
        ...page,
        sections: sections.filter((entry) => entry.id !== edit.sectionId),
      };
    case "duplicate": {
      const at = index(edit.sectionId);
      if (at < 0) return page;
      const copy = {
        ...structuredClone(sections[at]!),
        id: newSectionId(),
      } as SiteSection;
      const next = [...sections];
      next.splice(at + 1, 0, copy);
      return { ...page, sections: next };
    }
    case "move": {
      const from = index(edit.sectionId);
      if (from < 0) return page;
      const next = [...sections];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(edit.toIndex, next.length)), 0, moved!);
      return { ...page, sections: next };
    }
    case "seo":
      return { ...page, seo: { ...page.seo, ...edit.patch } };
  }
}

export function historyReducer(
  state: PageHistory,
  action: HistoryAction,
): PageHistory {
  switch (action.type) {
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        coalesce: null,
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
        coalesce: null,
      };
    }
    case "edit": {
      const present = applyEdit(state.present, action.edit);
      if (present === state.present) return state;
      const key =
        action.edit.type === "settings" || action.edit.type === "seo"
          ? action.edit.coalesceKey
          : undefined;
      const at = action.at;
      const merge =
        key !== undefined &&
        state.coalesce?.key === key &&
        at - state.coalesce.at < 1500;
      return {
        past: merge
          ? state.past
          : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present,
        future: [],
        coalesce: key === undefined ? null : { key, at },
      };
    }
  }
}

const FIELD_NAMES: Record<string, string> = {
  heading: "Headline",
  title: "Title",
  question: "Question",
  answer: "Answer",
  quote: "Quote",
  name: "Name",
  label: "Button text",
  href: "Web address",
  src: "Picture address",
};

/**
 * The page, checked against the same rules the API uses, or the problems
 * to fix in plain words ("Hero (section 1): Headline is needed").
 */
export function checkPage(
  page: EditablePage,
):
  | { ok: true; document: SitePageDocument }
  | { ok: false; problems: string[]; sectionIds: string[] } {
  const parsed = sitePageDocumentSchema.safeParse(page);
  if (parsed.success) return { ok: true, document: parsed.data };
  const sectionIds: string[] = [];
  const problems = parsed.error.issues.slice(0, 5).map((issue) => {
    const [first, index] = issue.path;
    const section =
      first === "sections" && typeof index === "number"
        ? page.sections[index]
        : undefined;
    if (section) sectionIds.push(section.id);
    const where = section
      ? `${SECTION_CATALOG[section.type].label} (section ${Number(index) + 1})`
      : first === "seo"
        ? "Search settings"
        : "Page";
    const field = [...issue.path]
      .reverse()
      .find((part): part is string => typeof part === "string");
    const fieldName = field ? (FIELD_NAMES[field] ?? "a field") : "a field";
    const message =
      issue.code === "too_small"
        ? "is needed"
        : issue.code === "too_big"
          ? "is too long"
          : issue.message;
    return `${where}: ${fieldName} ${message}`;
  });
  return { ok: false, problems, sectionIds };
}
