import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { LinkedCourseItem } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import {
  listUserIdsAffectedByLink,
  syncLinkedCourseAccess,
} from "../../access/index.ts";
import { getCourseAndVerifyOwner } from "../shared/courses.utils.ts";
import * as linksRepo from "./links.repository.ts";

export interface LinksServiceOptions {
  database: Kysely<Database>;
}

interface Actor {
  id: string;
  roles?: readonly string[];
}

/**
 * Linked courses: a course that comes free with another. Whoever holds the
 * course holds its linked courses too, and nothing is sold for them: the
 * order names only the course bought. Adding or removing a link brings the
 * access of every learner it touches in line straight away (see
 * access/linked-course-access.ts).
 */
export function createLinksService({ database }: LinksServiceOptions) {
  function verifyManager(courseId: string, actor: Actor) {
    return getCourseAndVerifyOwner(
      database,
      courseId,
      actor.id,
      actor.roles,
      "course.pricing.update",
    );
  }

  async function listLinkedCourses(
    courseId: string,
    actor: Actor,
  ): Promise<LinkedCourseItem[]> {
    await verifyManager(courseId, actor);
    const rows = await linksRepo.listLinkedCourses(database, courseId);
    return rows.map((row) => ({
      courseId: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
    }));
  }

  async function addLinkedCourse(
    courseId: string,
    linkedCourseId: string,
    actor: Actor,
  ): Promise<LinkedCourseItem[]> {
    if (courseId === linkedCourseId) {
      throw new AppError(
        400,
        "LINKED_COURSE_SELF",
        "A course cannot be linked to itself.",
      );
    }
    await verifyManager(courseId, actor);
    // Linking hands the course out, so it takes the same right over the
    // linked course as over the one it comes with.
    await verifyManager(linkedCourseId, actor);

    await database.transaction().execute(async (trx) => {
      await linksRepo.insertCourseLink(trx, courseId, linkedCourseId);
      const userIds = await listUserIdsAffectedByLink(
        trx,
        courseId,
        linkedCourseId,
      );
      await syncLinkedCourseAccess(trx, userIds);
    });

    return listLinkedCourses(courseId, actor);
  }

  async function removeLinkedCourse(
    courseId: string,
    linkedCourseId: string,
    actor: Actor,
  ): Promise<LinkedCourseItem[]> {
    await verifyManager(courseId, actor);

    await database.transaction().execute(async (trx) => {
      const removed = await linksRepo.deleteCourseLink(
        trx,
        courseId,
        linkedCourseId,
      );
      if (!removed) {
        throw new AppError(
          404,
          "LINKED_COURSE_NOT_FOUND",
          "This course is not linked.",
        );
      }
      const userIds = await listUserIdsAffectedByLink(
        trx,
        courseId,
        linkedCourseId,
      );
      await syncLinkedCourseAccess(trx, userIds);
    });

    return listLinkedCourses(courseId, actor);
  }

  return { listLinkedCourses, addLinkedCourse, removeLinkedCourse };
}

export type LinksService = ReturnType<typeof createLinksService>;
