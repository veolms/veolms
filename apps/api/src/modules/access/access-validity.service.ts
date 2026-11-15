import type {
  CourseValidityResponse,
  ExtendCourseAccessRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { createOutboxService } from "../../events/outbox.service.ts";
import { AppError } from "../../lib/errors.ts";
import { addAccessPeriod, extensionBase } from "@veolms/contracts";
import { syncLinkedCourseAccess } from "./linked-course-access.ts";

/**
 * Staff extend one learner's access to one course (Students → Extend
 * validity): by days, months or years added to the current end date, or to
 * lifetime. Both the grant (what the player checks) and the enrolment (what
 * My Courses and the student page read) change, together.
 *
 * The extension is also kept on the grant (`extended_until`,
 * `extended_lifetime`): a linked course's end is worked out again from the
 * courses that link it at every sync, which would otherwise undo it.
 */
export function createAccessValidityService({
  database,
}: {
  database: Kysely<Database>;
}) {
  const outbox = createOutboxService();

  async function extendCourseAccess(
    staffId: string,
    userId: string,
    courseId: string,
    body: ExtendCourseAccessRequest,
  ): Promise<CourseValidityResponse> {
    const now = new Date();
    return await database.transaction().execute(async (trx) => {
      const grant = await trx
        .selectFrom("access_grants")
        .select(["id", "status", "valid_until"])
        .where("user_id", "=", userId)
        .where("course_id", "=", courseId)
        .forUpdate()
        .executeTakeFirst();
      if (!grant) {
        throw new AppError(
          404,
          "COURSE_ACCESS_NOT_FOUND",
          "This learner was never enrolled in this course.",
        );
      }
      // Access staff took away comes back with Restore, as it was; a
      // suspended account is dealt with on its own.
      if (grant.status === "revoked" || grant.status === "suspended") {
        throw new AppError(
          409,
          "COURSE_ACCESS_NOT_EXTENDABLE",
          grant.status === "revoked"
            ? "This access was revoked. Restore it before extending it."
            : "This access is suspended and cannot be extended.",
        );
      }
      const previous = grant.valid_until ? new Date(grant.valid_until) : null;
      const lifetimeNow = grant.status === "active" && previous === null;
      if (lifetimeNow) {
        throw new AppError(
          409,
          "COURSE_ACCESS_LIFETIME",
          "This learner already has lifetime access to this course.",
        );
      }

      const next =
        body.kind === "lifetime"
          ? null
          : addAccessPeriod(
              extensionBase(previous, now),
              body.amount,
              body.unit,
            );

      await trx
        .updateTable("access_grants")
        .set({
          status: "active",
          valid_until: next,
          extended_until: next,
          extended_lifetime: next === null,
          extended_at: now,
          extended_by: staffId,
          updated_at: now,
        })
        .where("id", "=", grant.id)
        .execute();
      await trx
        .updateTable("enrollments")
        .set({ status: "active", access_expires_at: next, updated_at: now })
        .where("user_id", "=", userId)
        .where("course_id", "=", courseId)
        .where("status", "<>", "revoked")
        .execute();
      // Courses linked to this one follow it; a linked course keeps the
      // extension it was given.
      await syncLinkedCourseAccess(trx, [userId]);

      const after = await trx
        .selectFrom("access_grants as g")
        .innerJoin("courses as c", "c.id", "g.course_id")
        .leftJoin("enrollments as e", (join) =>
          join
            .onRef("e.user_id", "=", "g.user_id")
            .onRef("e.course_id", "=", "g.course_id"),
        )
        .select([
          "g.status",
          "g.valid_until",
          "g.valid_from",
          "e.access_starts_at",
          "c.title as course_title",
          "c.slug as course_slug",
        ])
        .where("g.id", "=", grant.id)
        .executeTakeFirstOrThrow();
      const validUntil = after.valid_until
        ? new Date(after.valid_until).toISOString()
        : null;

      if (body.notify ?? true) {
        await outbox.publish(trx, {
          type: "access.validity_extended",
          version: 1,
          dedupeKey: `access.validity_extended:${grant.id}:${now.getTime()}`,
          occurredAt: now,
          payload: {
            recipientUserId: userId,
            courseId,
            courseTitle: after.course_title.slice(0, 255),
            courseSlug: after.course_slug,
            validUntil,
          },
        });
      }

      return {
        userId,
        courseId,
        status: after.status,
        accessStartsAt: new Date(
          after.access_starts_at ?? after.valid_from,
        ).toISOString(),
        previousValidUntil: previous ? previous.toISOString() : null,
        validUntil,
      };
    });
  }

  return { extendCourseAccess };
}

export type AccessValidityService = ReturnType<
  typeof createAccessValidityService
>;
