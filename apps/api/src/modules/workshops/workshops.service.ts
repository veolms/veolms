import crypto from "node:crypto";

import {
  WORKSHOP_DEFAULT_CURRENCY,
  workshopSlugSchema,
  type CreateWorkshopRequest,
  type UpdateWorkshopRequest,
  type WorkshopAdmin,
  type WorkshopAdminListQuery,
  type WorkshopAdminListResponse,
  type WorkshopPublishCheck,
  type WorkshopSessionInput,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import {
  decryptSecret,
  encryptSecret,
} from "../commerce/payments/gateways/crypto.helper.ts";
import {
  workshopPublishIssues,
  workshopSlugFromTitle,
} from "./workshop-rules.ts";
import {
  presentSession,
  presentWorkshopAdmin,
  presentWorkshopListItem,
} from "./workshops.presenter.ts";
import * as repository from "./workshops.repository.ts";

export interface WorkshopsServiceDependencies {
  database: Kysely<Database>;
}

export interface WorkshopsService {
  list(query: WorkshopAdminListQuery): Promise<WorkshopAdminListResponse>;
  getAdmin(workshopId: string): Promise<WorkshopAdmin>;
  create(
    actorUserId: string,
    input: CreateWorkshopRequest,
  ): Promise<WorkshopAdmin>;
  update(
    workshopId: string,
    input: UpdateWorkshopRequest,
  ): Promise<WorkshopAdmin>;
  publishCheck(workshopId: string): Promise<WorkshopPublishCheck>;
  publish(workshopId: string): Promise<WorkshopAdmin>;
  unpublish(workshopId: string): Promise<WorkshopAdmin>;
  cancel(workshopId: string, reason: string): Promise<WorkshopAdmin>;
  remove(workshopId: string): Promise<void>;
}

function notFound(): AppError {
  return new AppError(404, "WORKSHOP_NOT_FOUND", "Workshop not found.");
}

export function createWorkshopsService({
  database,
}: WorkshopsServiceDependencies): WorkshopsService {
  async function load(workshopId: string) {
    const row = await repository.findWorkshopById(database, workshopId);
    if (!row) throw notFound();
    return row;
  }

  /** A slug nobody else has: the title's, then title-2, title-3, ... */
  async function uniqueSlug(title: string): Promise<string> {
    const base = workshopSlugFromTitle(title) || "workshop";
    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const candidate = attempt === 1 ? base : `${base}-${attempt}`;
      if (
        workshopSlugSchema.safeParse(candidate).success &&
        !(await repository.slugTaken(database, candidate))
      ) {
        return candidate;
      }
    }
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  async function assertHost(userId: string): Promise<void> {
    if (!(await repository.userExists(database, userId))) {
      throw new AppError(
        400,
        "WORKSHOP_HOST_UNKNOWN",
        "The host must be an existing account.",
      );
    }
  }

  async function assertCourse(courseId: string): Promise<void> {
    if (!(await repository.courseExists(database, courseId))) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }
  }

  function toSessionWrites(
    inputs: readonly WorkshopSessionInput[],
    knownIds: ReadonlySet<string>,
  ): repository.SessionWrite[] {
    return inputs.map((session) => ({
      // An id that is not one of this workshop's sessions becomes a new row:
      // a request cannot take over another workshop's session.
      id:
        session.id && knownIds.has(session.id)
          ? session.id
          : crypto.randomUUID(),
      title: session.title?.trim() || null,
      starts_at: new Date(session.startsAt),
      ends_at: new Date(session.endsAt),
      time_zone: session.timeZone,
      join_url_encrypted: session.joinUrl
        ? encryptSecret(session.joinUrl)
        : null,
      passcode: session.passcode?.trim() || null,
    }));
  }

  function joinUrlOf(row: repository.WorkshopSessionRow): string | null {
    if (!row.join_url_encrypted) return null;
    try {
      return decryptSecret(row.join_url_encrypted);
    } catch {
      return null;
    }
  }

  async function getAdmin(workshopId: string): Promise<WorkshopAdmin> {
    const row = await load(workshopId);
    const now = new Date();
    const sessions = await repository.listSessions(database, workshopId);
    return presentWorkshopAdmin(
      row,
      sessions.map((session) =>
        presentSession(session, joinUrlOf(session), now),
      ),
    );
  }

  async function list(
    query: WorkshopAdminListQuery,
  ): Promise<WorkshopAdminListResponse> {
    const now = new Date();
    const [rows, counts] = await Promise.all([
      repository.listAdminWorkshops(database, {
        tab: query.tab,
        search: query.search,
        now,
      }),
      repository.countAdminTabs(database, now),
    ]);
    return { items: rows.map(presentWorkshopListItem), counts };
  }

  async function create(
    actorUserId: string,
    input: CreateWorkshopRequest,
  ): Promise<WorkshopAdmin> {
    const hostUserId = input.hostUserId ?? actorUserId;
    await assertHost(hostUserId);
    if (input.courseId) await assertCourse(input.courseId);
    if (input.slug && (await repository.slugTaken(database, input.slug))) {
      throw new AppError(
        409,
        "WORKSHOP_SLUG_TAKEN",
        "Another workshop already uses this address.",
      );
    }
    const slug = input.slug ?? (await uniqueSlug(input.title));
    const id = crypto.randomUUID();
    const now = new Date();

    await database.transaction().execute(async (trx) => {
      await repository.insertWorkshop(trx, {
        id,
        slug,
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        description: input.description?.trim() || null,
        cover_media_id: input.coverMediaId ?? null,
        cover_url: input.coverUrl ?? null,
        host_user_id: hostUserId,
        course_id: input.courseId ?? null,
        price_minor: input.priceMinor ?? null,
        currency: (input.currency ?? WORKSHOP_DEFAULT_CURRENCY).toUpperCase(),
        capacity: input.capacity ?? null,
        resources: input.resources ?? [],
        created_by: actorUserId,
      });
      if (input.sessions?.length) {
        await repository.replaceSessions(
          trx,
          id,
          toSessionWrites(input.sessions, new Set()),
          now,
        );
      }
    });
    return await getAdmin(id);
  }

  async function update(
    workshopId: string,
    input: UpdateWorkshopRequest,
  ): Promise<WorkshopAdmin> {
    const existing = await load(workshopId);
    if (input.hostUserId) await assertHost(input.hostUserId);
    if (input.courseId) await assertCourse(input.courseId);
    if (input.slug !== undefined && input.slug !== existing.slug) {
      if (existing.status !== "draft") {
        throw new AppError(
          409,
          "WORKSHOP_SLUG_LOCKED",
          "The address of a published workshop cannot change; learners may have shared it.",
        );
      }
      if (await repository.slugTaken(database, input.slug, workshopId)) {
        throw new AppError(
          409,
          "WORKSHOP_SLUG_TAKEN",
          "Another workshop already uses this address.",
        );
      }
    }

    const now = new Date();
    const patch: repository.WorkshopPatch = {};
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.slug !== undefined) patch.slug = input.slug;
    if (input.summary !== undefined)
      patch.summary = input.summary?.trim() || null;
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null;
    }
    if (input.coverMediaId !== undefined)
      patch.cover_media_id = input.coverMediaId;
    if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl;
    if (input.hostUserId !== undefined) patch.host_user_id = input.hostUserId;
    if (input.courseId !== undefined) patch.course_id = input.courseId;
    if (input.priceMinor !== undefined) patch.price_minor = input.priceMinor;
    if (input.currency !== undefined)
      patch.currency = input.currency.toUpperCase();
    if (input.capacity !== undefined) patch.capacity = input.capacity;
    if (input.resources !== undefined) patch.resources = input.resources;

    await database.transaction().execute(async (trx) => {
      if (Object.keys(patch).length > 0 || input.sessions) {
        await repository.updateWorkshop(trx, workshopId, patch, now);
      }
      if (input.sessions) {
        const known = await repository.listSessionIds(trx, workshopId);
        await repository.replaceSessions(
          trx,
          workshopId,
          toSessionWrites(input.sessions, known),
          now,
        );
      }
    });
    return await getAdmin(workshopId);
  }

  async function issuesFor(workshopId: string): Promise<WorkshopPublishCheck> {
    const row = await load(workshopId);
    const sessions = await repository.listSessions(database, workshopId);
    const issues = workshopPublishIssues(
      {
        title: row.title,
        summary: row.summary,
        priceMinor: row.price_minor,
        currency: row.currency,
      },
      sessions.map((session) => ({
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        joinUrl: session.join_url_encrypted,
      })),
    );
    return { canPublish: issues.length === 0, issues };
  }

  async function publish(workshopId: string): Promise<WorkshopAdmin> {
    const row = await load(workshopId);
    if (row.status === "published") return await getAdmin(workshopId);
    if (row.status === "cancelled") {
      throw new AppError(
        409,
        "WORKSHOP_CANCELLED",
        "A cancelled workshop cannot be published again. Create a new one.",
      );
    }
    const check = await issuesFor(workshopId);
    if (!check.canPublish) {
      throw new AppError(
        400,
        "WORKSHOP_NOT_READY",
        check.issues.map((issue) => issue.message).join(" "),
      );
    }
    const now = new Date();
    await repository.updateWorkshop(
      database,
      workshopId,
      { status: "published", published_at: row.published_at ?? now },
      now,
    );
    return await getAdmin(workshopId);
  }

  async function unpublish(workshopId: string): Promise<WorkshopAdmin> {
    const row = await load(workshopId);
    if (row.status === "published") {
      await repository.updateWorkshop(
        database,
        workshopId,
        { status: "draft" },
        new Date(),
      );
    }
    return await getAdmin(workshopId);
  }

  async function cancel(
    workshopId: string,
    reason: string,
  ): Promise<WorkshopAdmin> {
    const row = await load(workshopId);
    if (row.status !== "cancelled") {
      const now = new Date();
      await repository.updateWorkshop(
        database,
        workshopId,
        {
          status: "cancelled",
          cancelled_at: now,
          cancel_reason: reason.trim(),
        },
        now,
      );
    }
    return await getAdmin(workshopId);
  }

  async function remove(workshopId: string): Promise<void> {
    const row = await load(workshopId);
    if (row.status === "published") {
      throw new AppError(
        409,
        "WORKSHOP_PUBLISHED",
        "Unpublish or cancel the workshop before deleting it.",
      );
    }
    await repository.updateWorkshop(
      database,
      workshopId,
      { deleted_at: new Date() },
      new Date(),
    );
  }

  return {
    list,
    getAdmin,
    create,
    update,
    publishCheck: issuesFor,
    publish,
    unpublish,
    cancel,
    remove,
  };
}
