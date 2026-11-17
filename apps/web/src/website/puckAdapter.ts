import {
  SITE_PAGE_SCHEMA_VERSION,
  sitePageDocumentSchema,
  type SitePageDocument,
  type SiteSectionType,
} from "@veolms/contracts";
import type { Data } from "@puckeditor/core";
import { SECTION_LABELS } from "./sectionFields";

/**
 * Our page JSON is the source of truth; Puck only edits it. This thin
 * adapter maps a section to Puck's `{ type, props }` and back, so Puck can
 * be swapped out without touching stored pages (creator-features/40 §4.2).
 */

export interface PuckRootProps {
  title: string;
  description: string;
}

export function toPuckData(document: SitePageDocument): Data {
  const rootProps: PuckRootProps = {
    title: document.seo.title,
    description: document.seo.description,
  };
  return {
    root: { props: rootProps } as Data["root"],
    content: document.sections.map((section) => ({
      type: section.type,
      props: { id: section.id, layout: section.layout, ...section.settings },
    })),
  };
}

/** Puck's data as a page, not yet checked. */
export function fromPuckData(data: Data): unknown {
  const root = (data.root.props ?? {}) as Partial<PuckRootProps>;
  return {
    schemaVersion: SITE_PAGE_SCHEMA_VERSION,
    seo: { title: root.title ?? "", description: root.description ?? "" },
    sections: data.content.map((item) => {
      const { id, layout, ...settings } = item.props as Record<string, unknown>;
      return { id, type: item.type, layout, settings };
    }),
  };
}

const FIELD_LABELS: Record<string, string> = {
  heading: "Heading",
  subheading: "Text under the heading",
  title: "Title",
  question: "Question",
  answer: "Answer",
  quote: "Their words",
  name: "Name",
  label: "Button text",
  href: "Web address",
  src: "Image address",
};

/**
 * The page, checked, or the problems to fix in plain words ("Hero:
 * Heading is needed").
 */
export function checkPage(
  data: Data,
):
  { ok: true; document: SitePageDocument } | { ok: false; problems: string[] } {
  const candidate = fromPuckData(data);
  const parsed = sitePageDocumentSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, document: parsed.data };
  const problems = parsed.error.issues.slice(0, 5).map((issue) => {
    const [first, index] = issue.path;
    const sectionType =
      first === "sections" && typeof index === "number"
        ? (data.content[index]?.type as SiteSectionType | undefined)
        : undefined;
    const where =
      sectionType && SECTION_LABELS[sectionType]
        ? `${SECTION_LABELS[sectionType]} (section ${Number(index) + 1})`
        : first === "seo"
          ? "Search settings"
          : "Page";
    const field = [...issue.path]
      .reverse()
      .find((part): part is string => typeof part === "string");
    const fieldLabel = field ? FIELD_LABELS[field] : undefined;
    const message =
      issue.code === "too_small"
        ? "is needed"
        : issue.code === "too_big"
          ? "is too long"
          : issue.message;
    return `${where}: ${fieldLabel ?? "a field"} ${message}`;
  });
  return { ok: false, problems };
}
