import {
  BUILT_IN_COURSE_PAGE_SECTIONS,
  COURSE_PAGE_SECTION_KINDS,
  DEFAULT_COURSE_PAGE_ORDER,
  coursePageContentSchemas,
  courseSeoSchema,
  presentCoursePageSection,
  type CoursePageSection,
  type CoursePageSectionKind,
  type CourseSeo,
  type PublicCourseSalesPage,
} from "@veolms/contracts";

import type { SectionRow } from "./page-sections.repository.ts";

/**
 * From stored rows to the editor's and the public page's views. Pure: the
 * course overview uses it on cached rows.
 */

type InstructorInput = {
  name: string;
  headline: string;
  bio: string;
  avatarUrl: string | null;
} | null;

/** Every section kind, in page order, with defaults for the ones never saved. */
export function presentEditorSections(rows: readonly SectionRow[]): {
  sections: CoursePageSection[];
  seo: CourseSeo;
} {
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  const ordered = [...COURSE_PAGE_SECTION_KINDS].sort(
    (a, b) => orderOf(a, byKind) - orderOf(b, byKind),
  );
  const sections = ordered.map((kind) => {
    const row = byKind.get(kind);
    const parsed = coursePageContentSchemas[kind].safeParse(row?.content ?? {});
    const content = parsed.success
      ? parsed.data
      : coursePageContentSchemas[kind].parse({});
    const builtIn = BUILT_IN_COURSE_PAGE_SECTIONS.includes(kind);
    return {
      kind,
      // A section starts switched on, except the instructor's: it fills
      // itself from the profile, so it waits for the creator to turn it on
      // rather than appearing on every existing course page.
      isVisible: builtIn ? true : (row?.is_visible ?? kind !== "instructor"),
      content,
    } as CoursePageSection;
  });
  const seoRow = byKind.get("seo");
  const seo = courseSeoSchema.safeParse(seoRow?.content ?? {});
  return { sections, seo: seo.success ? seo.data : courseSeoSchema.parse({}) };
}

/** A kind's place: where the creator put it, else the default order. */
function orderOf(
  kind: CoursePageSectionKind,
  byKind: Map<string, SectionRow>,
): number {
  const placed = [...byKind.values()].some(
    (row) => row.kind !== "seo" && row.position > 0,
  );
  const row = byKind.get(kind);
  if (placed && row) return row.position;
  const index = DEFAULT_COURSE_PAGE_ORDER.indexOf(kind);
  return placed ? 1000 + index : index;
}

/** What the course page shows. */
export function presentPublicSalesPage(
  rows: readonly SectionRow[],
  instructor: InstructorInput,
): PublicCourseSalesPage {
  const { sections, seo } = presentEditorSections(rows);
  return {
    sections: sections
      .map((section) => presentCoursePageSection(section, instructor))
      .filter((section) => section !== null),
    seo: {
      title: seo.title.trim() || null,
      description: seo.description.trim() || null,
    },
  };
}
