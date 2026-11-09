import crypto from "node:crypto";

import {
  WORKSHOP_DEFAULT_CURRENCY,
  workshopSlugSchema,
  type CreateWorkshopRequest,
  type UpdateWorkshopRequest,
  type WorkshopAdmin,
  type WorkshopAdminListQuery,
  type WorkshopAdminListResponse,
  type WorkshopPublic,
  type WorkshopPublicListResponse,
  type WorkshopPublishCheck,
  type WorkshopRegistrationReason,
  type WorkshopSessionInput,
  type WorkshopViewer,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { config } from "../../config.ts";
import { createOutboxService } from "../../events/outbox.service.ts";
import { AppError } from "../../lib/errors.ts";
import { createAccessService } from "../access/index.ts";
import {
  decryptSecret,
  encryptSecret,
} from "../commerce/payments/gateways/crypto.helper.ts";
import { workshopCalendar } from "./workshop-calendar.ts";
import {
  workshopPublishIssues,
  workshopSlugFromTitle,
} from "./workshop-rules.ts";
import {
  presentSession,
  presentWorkshopAdmin,
  presentWorkshopListItem,
  presentWorkshopPublic,
  presentWorkshopPublicListItem,
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
  listPublic(): Promise<WorkshopPublicListResponse>;
  getPublic(slug: string): Promise<WorkshopPublic>;
  viewer(slug: string, userId: string | null): Promise<WorkshopViewer>;
  register(
    workshopId: string,
    userId: string,
  ): Promise<{ registrationId: string }>;
  unregister(workshopId: string, userId: string): Promise<void>;
  calendar(
    workshopId: string,
    userId: string,
  ): Promise<{ filename: string; ics: string }>;
}

function notFound(): AppError {
  return new AppError(404, "WORKSHOP_NOT_FOUND", "Workshop not found.");
}

export function createWorkshopsService({
  database,
}: WorkshopsServiceDependencies): WorkshopsService {
  const access = createAccessService();
  const outbox = createOutboxService();

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
    if (input.summary !== undefined) {
      patch.summary = input.summary?.trim() || null;
    }
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null;
    }
    if (input.coverMediaId !== undefined) {
      patch.cover_media_id = input.coverMediaId;
    }
    if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl;
    if (input.hostUserId !== undefined) patch.host_user_id = input.hostUserId;
    if (input.courseId !== undefined) patch.course_id = input.courseId;
    if (input.priceMinor !== undefined) patch.price_minor = input.priceMinor;
    if (input.currency !== undefined) {
      patch.currency = input.currency.toUpperCase();
    }
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

  // --- Learners ---

  async function listPublic(): Promise<WorkshopPublicListResponse> {
    const now = new Date();
    const rows = await repository.listPublicWorkshops(database, now);
    const items = rows.map((row) => presentWorkshopPublicListItem(row, now));
    return {
      upcoming: items.filter((item) => item.state !== "ended"),
      past: items.filter((item) => item.state === "ended"),
    };
  }

  async function getPublic(slug: string): Promise<WorkshopPublic> {
    const now = new Date();
    const row = await repository.findPublicBySlug(database, slug, now);
    if (!row) throw notFound();
    const sessions = await repository.listSessions(database, row.id);
    return presentWorkshopPublic(row, sessions, now);
  }

  /** Why this viewer may, or may not, register right now. */
  async function registrationReason(
    row: repository.WorkshopListRow,
    userId: string | null,
    registration: repository.WorkshopRegistrationRow | undefined,
    now: Date,
  ): Promise<WorkshopRegistrationReason> {
    if (row.status === "cancelled") return "cancelled";
    if (
      row.last_session_ends_at &&
      new Date(row.last_session_ends_at).getTime() <= now.getTime()
    ) {
      return "ended";
    }
    if (registration && !registration.cancelled_at) return "registered";
    if (!userId) return "sign_in";
    if (
      row.course_id &&
      !(await access.hasActiveAccess(database, userId, row.course_id))
    ) {
      return "course_required";
    }
    // Paid registration goes through checkout, which arrives in a later step.
    if (row.price_minor !== null && row.price_minor > 0) {
      return "payment_required";
    }
    if (
      row.capacity !== null &&
      Number(row.registration_count) >= row.capacity
    ) {
      return "full";
    }
    return "ok";
  }

  function reasonError(reason: WorkshopRegistrationReason): AppError {
    switch (reason) {
      case "sign_in":
        return new AppError(401, "AUTH_REQUIRED", "Sign in to register.");
      case "course_required":
        return new AppError(
          403,
          "WORKSHOP_COURSE_REQUIRED",
          "This workshop is for learners of its course.",
        );
      case "full":
        return new AppError(409, "WORKSHOP_FULL", "No seats are left.");
      case "payment_required":
        return new AppError(
          409,
          "WORKSHOP_PAYMENT_REQUIRED",
          "Paid registration is not available yet.",
        );
      case "ended":
        return new AppError(409, "WORKSHOP_ENDED", "This workshop has ended.");
      case "cancelled":
        return new AppError(
          409,
          "WORKSHOP_CANCELLED",
          "This workshop was cancelled.",
        );
      default:
        return new AppError(409, "WORKSHOP_REGISTERED", "Already registered.");
    }
  }

  async function viewer(
    slug: string,
    userId: string | null,
  ): Promise<WorkshopViewer> {
    const now = new Date();
    const row = await repository.findPublicBySlug(database, slug, now);
    if (!row) throw notFound();
    const registration = userId
      ? await repository.findRegistration(database, row.id, userId)
      : undefined;
    const reason = await registrationReason(row, userId, registration, now);
    const active = Boolean(registration && !registration.cancelled_at);
    return {
      registered: active,
      registeredAt:
        active && registration
          ? new Date(registration.registered_at).toISOString()
          : null,
      joinedSessionIds:
        active && registration ? registration.joined_session_ids : [],
      canRegister: reason === "ok",
      reason,
    };
  }

  async function register(
    workshopId: string,
    userId: string,
  ): Promise<{ registrationId: string }> {
    const now = new Date();
    const row = await repository.findPublicById(database, workshopId, now);
    if (!row) throw notFound();
    const existing = await repository.findRegistration(
      database,
      workshopId,
      userId,
    );
    const reason = await registrationReason(row, userId, existing, now);
    if (reason === "registered" && existing) {
      return { registrationId: existing.id };
    }
    if (reason !== "ok") throw reasonError(reason);

    const saved = await database.transaction().execute(async (trx) => {
      // Seats are counted under a lock on the workshop row, so two people
      // taking the last seat at once cannot both get it.
      await repository.lockWorkshop(trx, workshopId);
      if (row.capacity !== null) {
        const taken = await repository.countActiveRegistrations(
          trx,
          workshopId,
        );
        if (taken >= row.capacity) throw reasonError("full");
      }
      const registration = await repository.upsertRegistration(trx, {
        id: existing?.id ?? crypto.randomUUID(),
        workshopId,
        userId,
        source: "free",
        orderId: null,
        now,
      });
      const sessions = await repository.listSessions(trx, workshopId);
      const next =
        sessions.find((session) => session.ends_at.getTime() > now.getTime()) ??
        sessions[0];
      await outbox.publish(trx, {
        type: "workshop.registered",
        version: 1,
        dedupeKey: `workshop.registered:${workshopId}:${userId}:${now.getTime()}`,
        occurredAt: now,
        payload: {
          workshopId,
          workshopSlug: row.slug,
          workshopTitle: row.title,
          recipientUserId: userId,
          startsAt: next ? next.starts_at.toISOString() : null,
          endsAt: next ? next.ends_at.toISOString() : null,
          timeZone: next?.time_zone ?? null,
          sessionCount: sessions.length,
        },
      });
      return registration;
    });
    return { registrationId: saved.id };
  }

  async function unregister(workshopId: string, userId: string): Promise<void> {
    const now = new Date();
    const row = await repository.findPublicById(database, workshopId, now);
    if (!row) throw notFound();
    await repository.cancelRegistration(database, workshopId, userId, now);
  }

  async function calendar(
    workshopId: string,
    userId: string,
  ): Promise<{ filename: string; ics: string }> {
    const now = new Date();
    const row = await repository.findPublicById(database, workshopId, now);
    if (!row) throw notFound();
    const registration = await repository.findRegistration(
      database,
      workshopId,
      userId,
    );
    if (!registration || registration.cancelled_at) {
      throw new AppError(
        403,
        "WORKSHOP_NOT_REGISTERED",
        "Register first to add the workshop to your calendar.",
      );
    }
    const sessions = await repository.listSessions(database, workshopId);
    const pageUrl = new URL(
      `/workshops/${row.slug}`,
      config.WEB_URL,
    ).toString();
    return {
      filename: `${row.slug}.ics`,
      ics: workshopCalendar({
        title: row.title,
        summary: row.summary,
        pageUrl,
        uidDomain: new URL(config.WEB_URL).hostname,
        now,
        sessions: sessions.map((session) => ({
          id: session.id,
          title: session.title,
          startsAt: session.starts_at,
          endsAt: session.ends_at,
        })),
      }),
    };
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
    listPublic,
    getPublic,
    viewer,
    register,
    unregister,
    calendar,
  };
}
