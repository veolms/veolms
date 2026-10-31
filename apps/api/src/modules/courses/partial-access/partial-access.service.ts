import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  CreatePartialAccessRequest,
  PartialAccessListResponse,
  PartialAccessOffer,
  UpdatePartialAccessRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import { ADMIN_ROLE } from "../../auth/index.ts";
import {
  listUserIdsAffectedByLink,
  syncLinkedCourseAccess,
} from "../../access/index.ts";
import { upsertPricing } from "../configuration/configuration.repository.ts";
import { findCourseBySlugIncludingDeleted } from "../course/course.repository.ts";
import { getCourseAndVerifyOwner, slugify } from "../shared/courses.utils.ts";
import * as partialRepo from "./partial-access.repository.ts";

interface Actor {
  id: string;
  roles?: readonly string[];
}

/**
 * Partial access: part of a course sold on its own. Each one is an unlisted
 * course (see `courses.unlisted`) linked to the course with the sections it
 * opens (`course_links.section_ids`), so buying it, being given it, a
 * refund and a revoke all run through the ordinary order and grant paths,
 * and the link sync hands its learners the course with those sections open.
 * It is managed here, from the course it opens, and nowhere else.
 */
export function createPartialAccessService({
  database,
}: {
  database: Kysely<Database>;
}) {
  function verifyManager(courseId: string, actor: Actor) {
    return getCourseAndVerifyOwner(
      database,
      courseId,
      actor.id,
      actor.roles,
      "course.pricing.update",
    );
  }

  /** The chosen sections, checked against the course and put in its order. */
  async function resolveSectionIds(
    courseId: string,
    sectionIds: readonly string[],
  ): Promise<string[]> {
    const courseSections = await partialRepo.listSectionIds(database, courseId);
    const chosen = new Set(sectionIds);
    const unknown = [...chosen].filter((id) => !courseSections.includes(id));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        "PARTIAL_ACCESS_SECTION_NOT_FOUND",
        "Choose sections of this course only.",
      );
    }
    return courseSections.filter((id) => chosen.has(id));
  }

  async function uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || "partial-access";
    let slug = base;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (!(await findCourseBySlugIncludingDeleted(database, slug)))
        return slug;
      slug = `${base}-${crypto.randomBytes(3).toString("hex")}`;
    }
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * Stores the part's selling price. It has no marked price of its own:
   * pages show it against the whole course's price (see `findSellingPrice`),
   * so it is sold in the whole course's currency.
   */
  async function writePricing(
    database_: Kysely<Database>,
    courseId: string,
    salePrice: number,
    currency: string,
  ) {
    const now = new Date();
    await upsertPricing(database_, {
      id: crypto.randomUUID(),
      course_id: courseId,
      // Free exactly when it sells for nothing, as every course's pricing.
      pricing_type: salePrice === 0 ? "free" : "paid",
      price: salePrice,
      currency,
      sale_price: salePrice,
      created_at: now,
      updated_at: now,
    });
  }

  async function listPartialAccess(
    courseId: string,
    actor: Actor,
  ): Promise<PartialAccessListResponse> {
    const course = await verifyManager(courseId, actor);
    const [rows, sections, whole] = await Promise.all([
      partialRepo.listPartialAccessCourses(database, courseId),
      partialRepo.listSections(database, courseId),
      partialRepo.findSellingPrice(database, courseId),
    ]);
    const sectionOrder = sections.map((section) => section.id);
    const items = rows.map((row) => {
      // A whole-course link opens every section there is now.
      const opened = row.section_ids ? new Set(row.section_ids) : null;
      return {
        courseId: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        price: whole.amount,
        salePrice: Number(row.sale_price ?? 0),
        currency: row.currency ?? "INR",
        sectionIds: sectionOrder.filter((id) => !opened || opened.has(id)),
        onSale: row.status === "published",
        offerPath: offerPath(course.slug, row.slug),
        learnerCount: Number(row.learner_count ?? 0),
        orderCount: Number(row.order_count ?? 0),
      };
    });
    return {
      items,
      sections,
      coursePrice: whole.amount,
      courseCurrency: whole.currency,
    };
  }

  async function createPartialAccess(
    courseId: string,
    input: CreatePartialAccessRequest,
    actor: Actor,
  ): Promise<PartialAccessListResponse> {
    const course = await verifyManager(courseId, actor);
    const sectionIds = await resolveSectionIds(courseId, input.sectionIds);
    const slug = await uniqueSlug(input.title);

    await database.transaction().execute(async (trx) => {
      const partialCourseId = crypto.randomUUID();
      await partialRepo.insertUnlistedCourse(trx, {
        id: partialCourseId,
        slug,
        title: input.title,
        creator_id: course.creator_id ?? actor.id,
        created_at: new Date(),
      });
      const { currency } = await partialRepo.findSellingPrice(trx, courseId);
      await writePricing(trx, partialCourseId, input.salePrice, currency);
      await partialRepo.insertPartialAccessLink(
        trx,
        partialCourseId,
        courseId,
        sectionIds,
      );
      if (input.onSale) {
        await partialRepo.setOnSale(trx, partialCourseId, true);
      }
    });

    return listPartialAccess(courseId, actor);
  }

  async function findOwnLink(courseId: string, partialCourseId: string) {
    const link = await partialRepo.findPartialAccessLink(
      database,
      courseId,
      partialCourseId,
    );
    if (!link) {
      throw new AppError(
        404,
        "PARTIAL_ACCESS_NOT_FOUND",
        "This partial access is not part of the course.",
      );
    }
    return link;
  }

  async function updatePartialAccess(
    courseId: string,
    partialCourseId: string,
    input: UpdatePartialAccessRequest,
    actor: Actor,
  ): Promise<PartialAccessListResponse> {
    await verifyManager(courseId, actor);
    await findOwnLink(courseId, partialCourseId);
    const sectionIds = input.sectionIds
      ? await resolveSectionIds(courseId, input.sectionIds)
      : undefined;

    await database.transaction().execute(async (trx) => {
      if (input.title !== undefined) {
        // Orders keep the title they were placed under.
        await partialRepo.updateCourseTitle(trx, partialCourseId, input.title);
      }
      if (input.salePrice !== undefined) {
        const { currency } = await partialRepo.findSellingPrice(trx, courseId);
        await writePricing(trx, partialCourseId, input.salePrice, currency);
      }
      if (input.onSale !== undefined) {
        await partialRepo.setOnSale(trx, partialCourseId, input.onSale);
      }
      if (sectionIds) {
        await partialRepo.updatePartialAccessSections(
          trx,
          partialCourseId,
          courseId,
          sectionIds,
        );
        // Every learner holding it gets the new sections straight away.
        const userIds = await listUserIdsAffectedByLink(
          trx,
          partialCourseId,
          courseId,
        );
        await syncLinkedCourseAccess(trx, userIds);
      }
    });

    return listPartialAccess(courseId, actor);
  }

  async function deletePartialAccess(
    courseId: string,
    partialCourseId: string,
    actor: Actor,
  ): Promise<PartialAccessListResponse> {
    await verifyManager(courseId, actor);
    await findOwnLink(courseId, partialCourseId);
    // Its orders and invoices name it, and its learners hold the course
    // through it: such a one is kept.
    if (await partialRepo.hasLearnersOrOrders(database, partialCourseId)) {
      throw new AppError(
        409,
        "PARTIAL_ACCESS_IN_USE",
        "Learners or orders already have this partial access, so it is kept.",
      );
    }
    await partialRepo.deleteUnlistedCourse(database, partialCourseId);
    return listPartialAccess(courseId, actor);
  }

  /**
   * A part of a course as its link's page shows it, to anyone: its price
   * and the sections it opens. Not found unless the course is published.
   */
  async function getOffer(
    courseIdOrSlug: string,
    offerSlug: string,
  ): Promise<PartialAccessOffer> {
    const course = await partialRepo.findPublishedCourseByIdOrSlug(
      database,
      courseIdOrSlug,
    );
    const offer = course
      ? await partialRepo.findOfferBySlug(database, course.id, offerSlug)
      : undefined;
    if (!course || !offer) {
      throw new AppError(
        404,
        "PARTIAL_ACCESS_NOT_FOUND",
        "This offer does not exist.",
      );
    }
    const [sectionOrder, whole] = await Promise.all([
      partialRepo.listSectionIds(database, course.id),
      partialRepo.findSellingPrice(database, course.id),
    ]);
    const opened = offer.section_ids ? new Set(offer.section_ids) : null;
    return {
      courseId: offer.id,
      slug: offer.slug,
      title: offer.title,
      price: whole.amount,
      salePrice: Number(offer.sale_price ?? 0),
      currency: offer.currency ?? "INR",
      sectionIds: sectionOrder.filter((id) => !opened || opened.has(id)),
      onSale: offer.status === "published",
    };
  }

  /**
   * Every partial access a coupon may name: all of them for an admin,
   * those of the actor's own courses otherwise (a coupon may only name
   * courses its creator owns).
   */
  async function listOptions(actor: Actor) {
    const isAdmin = Boolean(
      actor.roles?.some((role) => role.toLowerCase() === ADMIN_ROLE),
    );
    const rows = await partialRepo.listAllPartialAccess(
      database,
      isAdmin ? undefined : actor.id,
    );
    return {
      items: rows.map((row) => ({
        courseId: row.id,
        title: row.title,
        courseTitle: row.course_title,
      })),
    };
  }

  return {
    listPartialAccess,
    createPartialAccess,
    updatePartialAccess,
    deletePartialAccess,
    getOffer,
    listOptions,
  };
}

/** Where a part of a course is sold: the course's page, naming the part. */
export function offerPath(courseSlug: string, offerSlug: string): string {
  return `/courses/${encodeURIComponent(courseSlug)}/overview?access=${encodeURIComponent(offerSlug)}`;
}

export type PartialAccessService = ReturnType<
  typeof createPartialAccessService
>;
