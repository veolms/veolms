import {
  BUILT_IN_COURSE_PAGE_SECTIONS,
  COURSE_PAGE_SECTION_KINDS,
  coursePageContentSchemas,
  courseSeoSchema,
  type CoursePageSectionKind,
  type CoursePageSectionsResponse,
  type UpdateCoursePageSectionRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import { getCourseAndVerifyOwner } from "../shared/courses.utils.ts";
import { presentEditorSections } from "./page-sections.present.ts";
import * as repository from "./page-sections.repository.ts";

/**
 * The course editor's "Sales page" step
 * (creator-features/39-sales-page-sections-plan.md). Every write is a
 * `/courses/:id/...` change, so the course's cache and its pre-built page
 * are refreshed by the existing hooks.
 */
export function createPageSectionsService({
  database,
}: {
  database: Kysely<Database>;
}) {
  async function verify(
    courseId: string,
    userId: string,
    roles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      database,
      courseId,
      userId,
      roles,
      "course.details.update",
    );
  }

  async function view(courseId: string): Promise<CoursePageSectionsResponse> {
    return presentEditorSections(
      await repository.listSectionRows(database, courseId),
    );
  }

  return {
    /** The stored rows, for the course overview (no permission asked). */
    async listRowsForCourse(courseId: string) {
      return await repository.listSectionRows(database, courseId);
    },

    async get(courseId: string, userId: string, roles?: readonly string[]) {
      await verify(courseId, userId, roles);
      return await view(courseId);
    },

    async update(
      courseId: string,
      kind: CoursePageSectionKind | "seo",
      request: UpdateCoursePageSectionRequest,
      userId: string,
      roles?: readonly string[],
    ): Promise<CoursePageSectionsResponse> {
      await verify(courseId, userId, roles);
      if (kind === "seo") {
        const seo = courseSeoSchema.safeParse(request.content ?? {});
        if (!seo.success) {
          throw new AppError(
            400,
            "INVALID_SEO",
            seo.error.issues[0]?.message ??
              "Check the search title and description.",
          );
        }
        await repository.upsertSection(database, courseId, "seo", {
          content: seo.data,
        });
        return await view(courseId);
      }
      const builtIn = BUILT_IN_COURSE_PAGE_SECTIONS.includes(kind);
      if (
        builtIn &&
        (request.isVisible === false || request.content !== undefined)
      ) {
        throw new AppError(
          400,
          "BUILT_IN_SECTION",
          'The curriculum and "About this course" can be moved, not hidden or edited here.',
        );
      }
      let content: Record<string, unknown> | undefined;
      if (request.content !== undefined) {
        const parsed = coursePageContentSchemas[kind].safeParse(
          request.content,
        );
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new AppError(
            400,
            "INVALID_SECTION_CONTENT",
            issue?.message &&
              !/^Invalid|^Too big|^Expected/u.test(issue.message)
              ? issue.message
              : "Some of this section is too long or not filled in correctly.",
          );
        }
        content = parsed.data as Record<string, unknown>;
      }
      await repository.upsertSection(database, courseId, kind, {
        ...(request.isVisible !== undefined
          ? { isVisible: request.isVisible }
          : {}),
        ...(content !== undefined ? { content } : {}),
      });
      return await view(courseId);
    },

    async reorder(
      courseId: string,
      kinds: readonly CoursePageSectionKind[],
      userId: string,
      roles?: readonly string[],
    ): Promise<CoursePageSectionsResponse> {
      await verify(courseId, userId, roles);
      const unique = new Set(kinds);
      if (
        unique.size !== kinds.length ||
        unique.size !== COURSE_PAGE_SECTION_KINDS.length
      ) {
        throw new AppError(
          400,
          "INVALID_ORDER",
          "Send every section once, in the new order.",
        );
      }
      await database
        .transaction()
        .execute((trx) => repository.setOrder(trx, courseId, kinds));
      return await view(courseId);
    },
  };
}

export type PageSectionsService = ReturnType<typeof createPageSectionsService>;
