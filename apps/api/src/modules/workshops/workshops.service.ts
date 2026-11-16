import crypto from "node:crypto";

import {
  WORKSHOP_DEFAULT_CURRENCY,
  WORKSHOP_REGISTRANTS_PAGE_SIZE,
  workshopSessionState,
  workshopSlugSchema,
  type CreateWorkshopRequest,
  type UpdateWorkshopRequest,
  type WorkshopAdmin,
  type WorkshopAdminListQuery,
  type WorkshopAdminListResponse,
  type HeroVideoPlayback,
  type WorkshopPublic,
  type WorkshopPublicListResponse,
  type WorkshopPublishCheck,
  type WorkshopRegistrationReason,
  type WorkshopSessionInput,
  type WorkshopViewer,
  type WorkshopStandingsResponse,
  type WorkshopRegistrant,
  type ImportWorkshopRegistrantsRequest,
  type ImportWorkshopRegistrantsResponse,
  type WorkshopRegistrantsResponse,
  type VideoPlaybackToken,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { config } from "../../config.ts";
import { createOutboxService } from "../../events/outbox.service.ts";
import { AppError } from "../../lib/errors.ts";
import { createAccessService } from "../access/index.ts";
import * as orderRepo from "../commerce/orders/order.repository.ts";
import { createRefundService } from "../commerce/refunds/refund.service.ts";
import type { AuthorizationService } from "../authorization/authorization.service.ts";
import type { PaymentGateways } from "@veolms/contracts";
import type {
  MediaService,
  VideoAssetForPlayback,
} from "../media/media.service.ts";
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
import { createRegistration } from "./workshop-orders.ts";
import type { WorkshopCourseLessons } from "./workshop-course-lessons.ts";
import { audienceOf, lessonPathOf } from "./workshop-links.ts";

export interface WorkshopsServiceDependencies {
  database: Kysely<Database>;
  mediaService: Pick<
    MediaService,
    | "getMediaAsset"
    | "getMediaAssets"
    | "getVideoAssetPlayback"
    | "getVideoAssetPlaybackToken"
  >;
  authorization: Pick<AuthorizationService, "check">;
  /** For refunding paid registrations when a workshop is cancelled. */
  paymentGateways: PaymentGateways;
  /** Publishes a course workshop's recording as a course lesson. */
  courseLessons?: WorkshopCourseLessons;
  /**
   * Creates a student account for an email with none and returns its id;
   * null when the email belongs to a deleted account. Optional: without it
   * a CSV import only registers people who already have an account.
   */
  createStudentAccount?: (
    input: { email: string; displayName: string },
    actorUserId: string,
  ) => Promise<string | null>;
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
  /** First publish of a course workshop tells its learners; `announce` tells everyone. */
  publish(
    workshopId: string,
    options?: { announce?: boolean },
  ): Promise<WorkshopAdmin>;
  unpublish(workshopId: string): Promise<WorkshopAdmin>;
  cancel(
    workshopId: string,
    reason: string,
    options?: { refundPaid?: boolean; actorUserId?: string },
  ): Promise<WorkshopAdmin>;
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
  /** The meeting link to send a registrant to, or an error saying why not. */
  join(workshopId: string, sessionId: string, userId: string): Promise<string>;
  /** Attach (or clear) a session's recording; registrants are told once it is ready. */
  setRecording(
    workshopId: string,
    sessionId: string,
    mediaId: string | null,
    actor: { id: string; roles: readonly string[] },
    options?: { sectionId?: string | null },
  ): Promise<WorkshopAdmin>;
  /** A course workshop's course sections, for the recording's section picker. */
  listCourseSections(
    workshopId: string,
  ): Promise<{ id: string; title: string }[]>;
  /** Marks recordings the media pipeline has finished; returns how many. */
  markReadyRecordings(now: Date): Promise<number>;
  recordingPlayback(
    workshopId: string,
    sessionId: string,
    userId: string,
  ): Promise<HeroVideoPlayback>;
  recordingPlaybackToken(
    workshopId: string,
    sessionId: string,
    userId: string,
  ): Promise<VideoPlaybackToken>;
  listRegistrants(
    workshopId: string,
    query?: { page?: number; search?: string },
  ): Promise<WorkshopRegistrantsResponse>;
  registrantsCsv(
    workshopId: string,
  ): Promise<{ filename: string; csv: string }>;
  /** Register the account with this email (source admin); 404 when none. */
  addRegistrant(
    workshopId: string,
    email: string,
  ): Promise<WorkshopRegistrantsResponse>;
  removeRegistrant(
    workshopId: string,
    userId: string,
  ): Promise<WorkshopRegistrantsResponse>;
  importRegistrants(
    workshopId: string,
    input: ImportWorkshopRegistrantsRequest,
    actorUserId: string,
  ): Promise<ImportWorkshopRegistrantsResponse>;
  standings(userId: string): Promise<WorkshopStandingsResponse>;
}

/** Did a session that registrants already knew change its time? */
function sessionsMoved(
  before: readonly repository.WorkshopSessionRow[],
  after: readonly repository.SessionWrite[],
): boolean {
  const previous = new Map(before.map((session) => [session.id, session]));
  return after.some((write) => {
    const old = previous.get(write.id);
    return (
      old !== undefined &&
      (old.starts_at.getTime() !== write.starts_at.getTime() ||
        old.ends_at.getTime() !== write.ends_at.getTime())
    );
  });
}

interface Membership {
  /** Their registration row, if any and not cancelled. */
  registration: repository.WorkshopRegistrationRow | undefined;
  /** In the audience: may join, watch, and is told about it. */
  eligible: boolean;
  /** Said "I'm not going". */
  declined: boolean;
  via: "everyone" | "course" | "paid" | "added" | null;
}

function notFound(): AppError {
  return new AppError(404, "WORKSHOP_NOT_FOUND", "Workshop not found.");
}

/** The buyer's welcome, saved whole (message and button together). */
function welcomeColumns(
  welcome: NonNullable<UpdateWorkshopRequest["welcome"]>,
) {
  return {
    welcome_message: welcome.message,
    welcome_link_label: welcome.linkLabel,
    welcome_link_url: welcome.linkUrl,
  };
}

export function createWorkshopsService({
  database,
  mediaService,
  authorization,
  paymentGateways,
  createStudentAccount,
  courseLessons,
}: WorkshopsServiceDependencies): WorkshopsService {
  const access = createAccessService();
  const outbox = createOutboxService();
  const refunds = createRefundService({ database, paymentGateways });

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
        presentSession(session, joinUrlOf(session), now, row.course_slug),
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
    // Invited = the audience, less those not going: every learner, the
    // course's learners, or the seats sold (plus anyone staff added).
    const audiences = rows.map((row) => audienceOf(row));
    const [learnerTotal, courseLearners] = await Promise.all([
      audiences.includes("everyone")
        ? repository.countAllLearners(database)
        : Promise.resolve(0),
      repository.countCourseLearners(
        database,
        rows.flatMap((row) => (row.course_id ? [row.course_id] : [])),
      ),
    ]);
    const items = rows.map((row, index) => {
      const audience = audiences[index];
      const base =
        audience === "everyone"
          ? learnerTotal
          : audience === "course"
            ? (courseLearners.get(row.course_id!) ?? 0)
            : Number(row.registration_count);
      const invited = Math.max(0, base - Number(row.declined_count));
      return presentWorkshopListItem(row, invited);
    });
    return { items, counts };
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
        ...(input.welcome ? welcomeColumns(input.welcome) : {}),
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
    if (input.welcome !== undefined)
      Object.assign(patch, welcomeColumns(input.welcome));

    await database.transaction().execute(async (trx) => {
      if (Object.keys(patch).length > 0 || input.sessions) {
        await repository.updateWorkshop(trx, workshopId, patch, now);
      }
      if (input.sessions) {
        const before = await repository.listSessions(trx, workshopId);
        const known = new Set(before.map((session) => session.id));
        const writes = toSessionWrites(input.sessions, known);
        await repository.replaceSessions(trx, workshopId, writes, now);
        // Registrants planned around the old times: a published
        // workshop whose sessions moved tells them once per save.
        if (existing.status === "published" && sessionsMoved(before, writes)) {
          const next =
            writes.find((write) => write.ends_at.getTime() > now.getTime()) ??
            writes[0];
          await outbox.publish(trx, {
            type: "workshop.updated",
            version: 1,
            dedupeKey: `workshop.updated:${workshopId}:rescheduled:${now.getTime()}`,
            occurredAt: now,
            payload: {
              workshopId,
              workshopSlug: existing.slug,
              workshopTitle: patch.title ?? existing.title,
              change: "rescheduled",
              reason: null,
              refunding: false,
              startsAt: next ? next.starts_at.toISOString() : null,
              endsAt: next ? next.ends_at.toISOString() : null,
              timeZone: next?.time_zone ?? null,
            },
          });
        }
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

  async function publish(
    workshopId: string,
    options: { announce?: boolean } = {},
  ): Promise<WorkshopAdmin> {
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
    // Told once, on the first publish: a course workshop to its learners
    // (who are in without registering), an open one to everyone when asked.
    // Told once, on the first publish: a course workshop's learners and,
    // for a free open workshop, every learner, each with the calendar
    // invitation. A paid workshop is announced only when asked.
    const kind = audienceOf(row);
    const audience = row.published_at
      ? null
      : kind === "course"
        ? "course"
        : kind === "everyone" || options.announce
          ? "all"
          : null;
    await database.transaction().execute(async (trx) => {
      await repository.updateWorkshop(
        trx,
        workshopId,
        { status: "published", published_at: row.published_at ?? now },
        now,
      );
      if (!audience) return;
      const sessions = await repository.listSessions(trx, workshopId);
      const next =
        sessions.find((session) => session.ends_at.getTime() > now.getTime()) ??
        sessions[0];
      await outbox.publish(trx, {
        type: "workshop.announced",
        version: 1,
        dedupeKey: `workshop.announced:${workshopId}`,
        occurredAt: now,
        payload: {
          workshopId,
          workshopSlug: row.slug,
          workshopTitle: row.title,
          audience,
          courseTitle: row.course_title ?? null,
          priceMinor: row.price_minor,
          currency: row.currency,
          startsAt: next ? next.starts_at.toISOString() : null,
          endsAt: next ? next.ends_at.toISOString() : null,
          timeZone: next?.time_zone ?? null,
        },
      });
    });
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
    options: { refundPaid?: boolean; actorUserId?: string } = {},
  ): Promise<WorkshopAdmin> {
    const row = await load(workshopId);
    if (row.status !== "cancelled") {
      const now = new Date();
      const wasPublished = row.status === "published";
      await database.transaction().execute(async (trx) => {
        await repository.updateWorkshop(
          trx,
          workshopId,
          {
            status: "cancelled",
            cancelled_at: now,
            cancel_reason: reason.trim(),
          },
          now,
        );
        // A draft has no registrants to tell.
        if (!wasPublished) return;
        await outbox.publish(trx, {
          type: "workshop.updated",
          version: 1,
          dedupeKey: `workshop.updated:${workshopId}:cancelled:${now.getTime()}`,
          occurredAt: now,
          payload: {
            workshopId,
            workshopSlug: row.slug,
            workshopTitle: row.title,
            change: "cancelled",
            reason: reason.trim(),
            refunding: Boolean(options.refundPaid),
            startsAt: null,
            endsAt: null,
            timeZone: null,
          },
        });
      });
      if (options.refundPaid && options.actorUserId) {
        await refundPaidRegistrations(workshopId, options.actorUserId);
      }
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

  async function registrationReason(
    row: repository.WorkshopListRow,
    userId: string | null,
    member: Membership | null,
    now: Date,
  ): Promise<WorkshopRegistrationReason> {
    if (row.status === "cancelled") return "cancelled";
    if (
      row.last_session_ends_at &&
      new Date(row.last_session_ends_at).getTime() <= now.getTime()
    ) {
      return "ended";
    }
    if (!userId) return "sign_in";
    if (member?.eligible) return member.declined ? "declined" : "registered";
    const audience = audienceOf(row);
    if (audience === "course") return "course_required";
    if (row.capacity !== null && Number(row.seats_taken) >= row.capacity) {
      return "full";
    }
    return "payment_required";
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
      case "declined":
        return new AppError(
          409,
          "WORKSHOP_DECLINED",
          "You said you're not going.",
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

  /**
   * Where a learner stands with a workshop. Nobody registers: everyone in
   * its audience is in (every learner, its course's learners, or those who
   * bought a seat), and so is anyone staff added. "I'm not going" keeps
   * them eligible to join but stops the reminders and notices.
   */
  async function membership(
    row: {
      id: string;
      course_id: string | null;
      price_minor: number | null;
    },
    userId: string,
  ): Promise<Membership> {
    const registration = await repository.findRegistration(
      database,
      row.id,
      userId,
    );
    const active =
      registration && !registration.cancelled_at ? registration : undefined;
    const declined = Boolean(active?.declined_at);
    const audience = audienceOf(row);
    let via: Membership["via"] = null;
    if (active && active.source === "order") via = "paid";
    else if (
      active &&
      (active.source === "admin" || active.source === "free")
    ) {
      via = audience === "everyone" ? "everyone" : "added";
    } else if (audience === "everyone") via = "everyone";
    else if (
      audience === "course" &&
      row.course_id &&
      (await access.hasActiveAccess(database, userId, row.course_id))
    ) {
      via = "course";
    }
    return { registration: active, eligible: via !== null, declined, via };
  }

  /** May join: anyone in the audience, whether or not they said they'd come. */
  async function attends(
    row: { id: string; course_id: string | null; price_minor: number | null },
    userId: string,
  ): Promise<Membership | null> {
    const member = await membership(row, userId);
    return member.eligible ? member : null;
  }

  async function viewer(
    slug: string,
    userId: string | null,
  ): Promise<WorkshopViewer> {
    const now = new Date();
    const row = await repository.findPublicBySlug(database, slug, now);
    if (!row) throw notFound();
    const member = userId ? await membership(row, userId) : null;
    const reason = await registrationReason(row, userId, member, now);
    const canWatch = userId
      ? await canWatchRecordings(row, userId, member?.registration)
      : false;
    const joinable = member?.eligible
      ? (await repository.listSessions(database, row.id))
          .filter((session) => {
            const state = workshopSessionState(
              session.starts_at,
              session.ends_at,
              now,
            );
            return state === "join_open" || state === "live";
          })
          .map((session) => ({
            sessionId: session.id,
            passcode: session.passcode,
          }))
      : [];
    const registration = member?.registration;
    return {
      registered: Boolean(member?.eligible && !member.declined),
      registeredAt: registration
        ? new Date(registration.registered_at).toISOString()
        : null,
      joinedSessionIds: registration ? registration.joined_session_ids : [],
      viaCourse: member?.via === "course",
      canRegister: reason === "declined",
      reason,
      joinable,
      canWatchRecordings: canWatch,
      audience: audienceOf(row),
      declined: Boolean(member?.declined),
    };
  }

  /** The learner's standing with every listed workshop, for the agenda. */
  async function standings(userId: string): Promise<WorkshopStandingsResponse> {
    const now = new Date();
    const rows = await repository.listPublicWorkshops(database, now);
    const items = await Promise.all(
      rows.map(async (row) => {
        const member = await membership(row, userId);
        return {
          workshopId: row.id,
          attending: member.eligible && !member.declined,
          declined: member.declined,
          via: member.via,
        };
      }),
    );
    return { items };
  }

  /** "Count me in again": undoes "I'm not going". */
  async function register(
    workshopId: string,
    userId: string,
  ): Promise<{ registrationId: string }> {
    const now = new Date();
    const row = await repository.findPublicById(database, workshopId, now);
    if (!row) throw notFound();
    const member = await membership(row, userId);
    if (!member.eligible) {
      throw reasonError(await registrationReason(row, userId, member, now));
    }
    if (member.registration) {
      if (member.declined) {
        await repository.setDeclined(database, workshopId, userId, null);
      }
      return { registrationId: member.registration.id };
    }
    const saved = await database.transaction().execute(
      async (trx) =>
        await createRegistration(trx, {
          workshop: row,
          userId,
          source: member.via === "course" ? "course" : "free",
          orderId: null,
          notify: false,
          now,
        }),
    );
    return { registrationId: saved.id };
  }

  /** "I'm not going": no more reminders or notices about this workshop. */
  async function unregister(workshopId: string, userId: string): Promise<void> {
    const now = new Date();
    const row = await repository.findPublicById(database, workshopId, now);
    if (!row) throw notFound();
    const member = await membership(row, userId);
    if (!member.eligible) return;
    if (member.registration) {
      await repository.setDeclined(database, workshopId, userId, now);
      return;
    }
    await database.transaction().execute(async (trx) => {
      await createRegistration(trx, {
        workshop: row,
        userId,
        source: member.via === "course" ? "course" : "free",
        orderId: null,
        notify: false,
        now,
      });
      await repository.setDeclined(trx, workshopId, userId, now);
    });
  }

  async function calendar(
    workshopId: string,
    userId: string,
  ): Promise<{ filename: string; ics: string }> {
    const now = new Date();
    const row = await repository.findPublicById(database, workshopId, now);
    if (!row) throw notFound();
    if (!(await attends(row, userId))) {
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

  /**
   * Where the Join button sends a registrant: the session's meeting link,
   * once its window is open (15 minutes before the start until the end).
   * The click is remembered on the registration as attendance.
   */
  async function join(
    workshopId: string,
    sessionId: string,
    userId: string,
  ): Promise<string> {
    const now = new Date();
    const row = await repository.findPublicById(database, workshopId, now);
    if (!row) throw notFound();
    const session = await repository.findSession(
      database,
      workshopId,
      sessionId,
    );
    if (!session) throw notFound();
    const attendance = await attends(row, userId);
    if (!attendance) {
      throw new AppError(
        403,
        "WORKSHOP_NOT_REGISTERED",
        "Register first to join this session.",
      );
    }
    const state = workshopSessionState(session.starts_at, session.ends_at, now);
    if (state === "upcoming") {
      throw new AppError(
        409,
        "WORKSHOP_JOIN_NOT_OPEN",
        "Joining opens 15 minutes before the session starts.",
      );
    }
    if (state === "ended") {
      throw new AppError(
        409,
        "WORKSHOP_SESSION_ENDED",
        "This session has ended.",
      );
    }
    const url = joinUrlOf(session);
    if (!url) {
      throw new AppError(
        409,
        "WORKSHOP_JOIN_LINK_MISSING",
        "The meeting link is not set yet. Please check back shortly.",
      );
    }
    if (!attendance.registration) {
      // A course learner: noted now, so their attendance shows in the
      // registrants table. It takes no seat and sends no confirmation.
      await database.transaction().execute(async (trx) => {
        await createRegistration(trx, {
          workshop: row,
          userId,
          source: attendance.via === "course" ? "course" : "free",
          orderId: null,
          notify: false,
          now,
        });
      });
    }
    await repository.recordJoin(database, workshopId, userId, sessionId);
    return url;
  }

  /**
   * Cancelling a paid workshop: every registration bought through checkout
   * is refunded through the normal refund flow, one order at a time, and
   * the refund itself cancels the registration. An order the gateway
   * cannot refund (a manual transfer, a gateway no longer set up) is left
   * for staff to settle by hand from the orders page.
   */
  async function refundPaidRegistrations(
    workshopId: string,
    actorUserId: string,
  ): Promise<void> {
    const paid = await repository.listPaidRegistrations(database, workshopId);
    for (const registration of paid) {
      const items = await orderRepo.listOrderItems(
        database,
        registration.order_id,
      );
      const line = items.find(
        (item) =>
          item.item_type === "workshop" && item.workshop_id === workshopId,
      );
      try {
        await refunds.processRefund(
          actorUserId,
          {
            orderId: registration.order_id,
            ...(line ? { orderItemId: line.id } : {}),
            reason: "Workshop cancelled",
            preserveAccess: false,
            idempotencyKey: `workshop-cancel:${workshopId}:${registration.order_id}`,
          },
          { initiatedBy: "staff" },
        );
      } catch {
        // Left for staff; the registration still shows as paid.
      }
    }
  }

  // --- Registrants ---

  function presentRegistrant(
    row: repository.WorkshopRegistrantRow,
  ): WorkshopRegistrant {
    return {
      registrationId: row.registration_id,
      userId: row.user_id,
      name: row.display_name,
      username: row.username,
      email: row.email,
      avatarUrl: row.avatar_data_url,
      source: row.source,
      orderId: row.order_id,
      registeredAt: new Date(row.registered_at).toISOString(),
      joinedSessionIds: row.joined_session_ids,
      declinedAt: row.declined_at
        ? new Date(row.declined_at).toISOString()
        : null,
    };
  }

  async function listRegistrants(
    workshopId: string,
    query: { page?: number; search?: string } = {},
  ): Promise<WorkshopRegistrantsResponse> {
    await load(workshopId);
    const page = Math.max(1, query.page ?? 1);
    const { rows, total } = await repository.listRegistrantsPage(
      database,
      workshopId,
      {
        offset: (page - 1) * WORKSHOP_REGISTRANTS_PAGE_SIZE,
        limit: WORKSHOP_REGISTRANTS_PAGE_SIZE,
        ...(query.search ? { search: query.search } : {}),
      },
    );
    return { items: rows.map(presentRegistrant), total };
  }

  /** The registrants as a spreadsheet: one row each, sessions as columns. */
  async function registrantsCsv(
    workshopId: string,
  ): Promise<{ filename: string; csv: string }> {
    const row = await load(workshopId);
    const [registrants, sessions] = await Promise.all([
      repository.listRegistrants(database, workshopId),
      repository.listSessions(database, workshopId),
    ]);
    const cell = (value: string | null | undefined): string => {
      const text = value ?? "";
      return /[",\r\n]/.test(text)
        ? '"' + text.replace(/"/g, '""') + '"'
        : text;
    };
    const sourceLabel = {
      free: "Free",
      order: "Paid",
      admin: "Added by staff",
      course: "Course learner",
    };
    const header = [
      "Name",
      "Username",
      "Email",
      "Registered at",
      "How",
      "Order",
      ...sessions.map(
        (session, index) =>
          "Joined " + (session.title ?? "session " + (index + 1)),
      ),
    ];
    const lines = registrants.map((registrant) =>
      [
        registrant.display_name,
        registrant.username ?? "",
        registrant.email ?? "",
        new Date(registrant.registered_at).toISOString(),
        sourceLabel[registrant.source],
        registrant.order_id ?? "",
        ...sessions.map((session) =>
          registrant.joined_session_ids.includes(session.id) ? "yes" : "no",
        ),
      ]
        .map(cell)
        .join(","),
    );
    return {
      filename: row.slug + "-registrants.csv",
      csv: [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n",
    };
  }

  /**
   * Staff add someone by the email of their account: a guest speaker, a
   * learner who paid elsewhere. Seats are not counted for them, and they
   * get the same confirmation as anyone registering.
   */
  async function addRegistrant(
    workshopId: string,
    email: string,
  ): Promise<WorkshopRegistrantsResponse> {
    const row = await load(workshopId);
    if (row.status === "cancelled") throw reasonError("cancelled");
    const userId = await repository.findUserIdByEmail(database, email);
    if (!userId) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "No account has that email. They need to sign up first.",
      );
    }
    const existing = await repository.findRegistration(
      database,
      workshopId,
      userId,
    );
    if (!existing || existing.cancelled_at) {
      await database.transaction().execute(async (trx) => {
        await createRegistration(trx, {
          workshop: row,
          userId,
          source: "admin",
          orderId: null,
          ...(existing ? { existingId: existing.id } : {}),
          now: new Date(),
        });
      });
    }
    return await listRegistrants(workshopId);
  }

  /**
   * Registers a list of people at once, from a spreadsheet: existing
   * accounts are registered; an email with no account gets a student
   * account first (they sign in with an emailed code, like everyone), when
   * `createAccounts` allows. Seats are not counted, as for one added by hand.
   */
  async function importRegistrants(
    workshopId: string,
    input: ImportWorkshopRegistrantsRequest,
    actorUserId: string,
  ): Promise<ImportWorkshopRegistrantsResponse> {
    const row = await load(workshopId);
    if (row.status === "cancelled") throw reasonError("cancelled");
    const createAccounts = input.createAccounts !== false;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    const skipped: ImportWorkshopRegistrantsResponse["skipped"] = [];
    let added = 0;
    let accountsCreated = 0;
    let alreadyRegistered = 0;

    for (const [index, entry] of input.rows.entries()) {
      const rowNumber = index + 1;
      const email = entry.email.trim().toLowerCase();
      if (!emailPattern.test(email)) {
        skipped.push({
          row: rowNumber,
          email: entry.email,
          reason: "invalid_email",
        });
        continue;
      }
      if (seen.has(email)) {
        skipped.push({ row: rowNumber, email, reason: "duplicate" });
        continue;
      }
      seen.add(email);

      let userId = await repository.findUserIdByEmail(database, email);
      if (!userId) {
        if (!createAccounts || !createStudentAccount) {
          skipped.push({ row: rowNumber, email, reason: "no_account" });
          continue;
        }
        const created = await createStudentAccount(
          { email, displayName: entry.name?.trim() || email.split("@")[0]! },
          actorUserId,
        );
        if (!created) {
          // The email belongs to a deleted account, which is not revived here.
          skipped.push({ row: rowNumber, email, reason: "deleted_account" });
          continue;
        }
        userId = created;
        accountsCreated += 1;
      }

      const existing = await repository.findRegistration(
        database,
        workshopId,
        userId,
      );
      if (existing && !existing.cancelled_at) {
        alreadyRegistered += 1;
        continue;
      }
      await database.transaction().execute(async (trx) => {
        await createRegistration(trx, {
          workshop: row,
          userId: userId!,
          source: "admin",
          orderId: null,
          ...(existing ? { existingId: existing.id } : {}),
          now: new Date(),
        });
      });
      added += 1;
    }

    const { items } = await listRegistrants(workshopId);
    return { added, accountsCreated, alreadyRegistered, skipped, items };
  }

  /** Takes a seat back. A paid seat is refunded from the orders page, not here. */
  async function removeRegistrant(
    workshopId: string,
    userId: string,
  ): Promise<WorkshopRegistrantsResponse> {
    await load(workshopId);
    await repository.cancelRegistration(
      database,
      workshopId,
      userId,
      new Date(),
    );
    return await listRegistrants(workshopId);
  }

  // --- Recordings ---

  /** Registrants, the linked course's learners and staff may watch. */
  async function canWatchRecordings(
    row: repository.WorkshopListRow,
    userId: string,
    registration: repository.WorkshopRegistrationRow | undefined,
  ): Promise<boolean> {
    if (audienceOf(row) === "everyone") return true;
    if (registration && !registration.cancelled_at) return true;
    if (
      row.course_id &&
      (await access.hasActiveAccess(database, userId, row.course_id))
    ) {
      return true;
    }
    const staff = await authorization.check({
      userId,
      permission: "workshop.read",
    });
    return staff.allowed;
  }

  async function setRecording(
    workshopId: string,
    sessionId: string,
    mediaId: string | null,
    actor: { id: string; roles: readonly string[] },
    options: { sectionId?: string | null } = {},
  ): Promise<WorkshopAdmin> {
    const now = new Date();
    const row = await load(workshopId);
    const session = await repository.findSession(
      database,
      workshopId,
      sessionId,
    );
    if (!session) throw notFound();
    if (mediaId === null) {
      // The course lesson, if any, stays in the course: it is removed from
      // the course editor like any other lesson.
      await repository.setSessionRecording(
        database,
        sessionId,
        null,
        null,
        now,
        null,
      );
      return await getAdmin(workshopId);
    }
    const asset = await mediaService.getMediaAsset(mediaId);
    if (!asset || asset.type !== "video") {
      throw new AppError(
        400,
        "WORKSHOP_RECORDING_INVALID",
        "The recording must be a video upload or import.",
      );
    }
    if (asset.status === "failed") {
      throw new AppError(
        400,
        "WORKSHOP_RECORDING_FAILED",
        "That video could not be processed. Upload or import it again.",
      );
    }
    const ready = asset.status === "ready";
    // A course workshop's recording is published as a lesson of the course,
    // beside its other lessons; the workshop page links to it.
    let lessonId: string | null = null;
    if (row.course_id) {
      if (!courseLessons) {
        throw new AppError(
          503,
          "WORKSHOP_COURSE_LESSONS_UNAVAILABLE",
          "Course lessons cannot be created here.",
        );
      }
      lessonId = await courseLessons.publishRecording({
        courseId: row.course_id,
        sectionId: options.sectionId ?? null,
        title: session.title ? `${row.title} — ${session.title}` : row.title,
        mediaId,
        existingLessonId: session.recording_lesson_id ?? null,
        actor,
      });
    }
    await database.transaction().execute(async (trx) => {
      await repository.setSessionRecording(
        trx,
        sessionId,
        mediaId,
        ready ? now : null,
        now,
        lessonId,
      );
      if (ready) {
        await publishRecordingReady(
          trx,
          row,
          session,
          mediaId,
          now,
          lessonPathOf(row.course_slug, lessonId),
        );
      }
    });
    return await getAdmin(workshopId);
  }

  async function publishRecordingReady(
    trx: Parameters<typeof outbox.publish>[0],
    workshop: { id: string; slug: string; title: string; status: string },
    session: { id: string; title: string | null },
    mediaId: string,
    now: Date,
    lessonPath: string | null = null,
  ): Promise<void> {
    // A draft has nobody to tell yet.
    if (workshop.status === "draft") return;
    await outbox.publish(trx, {
      type: "workshop.recording_ready",
      version: 1,
      dedupeKey: `workshop.recording_ready:${session.id}:${mediaId}`,
      occurredAt: now,
      payload: {
        workshopId: workshop.id,
        workshopSlug: workshop.slug,
        workshopTitle: workshop.title,
        sessionId: session.id,
        sessionTitle: session.title,
        mediaId,
        lessonPath,
      },
    });
  }

  /**
   * Recordings attached while still processing: once the media pipeline
   * reports them ready, mark them so and tell the registrants. Called by
   * the workshop worker every minute.
   */
  async function markReadyRecordings(now: Date): Promise<number> {
    const waiting = await repository.listSessionsAwaitingRecording(database);
    if (waiting.length === 0) return 0;
    const assets = await mediaService.getMediaAssets(
      waiting.map((row) => row.recording_media_id),
    );
    const statusById = new Map(
      assets.map((asset) => [asset.id, asset.status] as const),
    );
    let marked = 0;
    for (const row of waiting) {
      if (statusById.get(row.recording_media_id) !== "ready") continue;
      await database.transaction().execute(async (trx) => {
        const changed = await repository.markRecordingReady(
          trx,
          row.session_id,
          row.recording_media_id,
          now,
        );
        if (!changed) return;
        marked += 1;
        await publishRecordingReady(
          trx,
          {
            id: row.workshop_id,
            slug: row.slug,
            title: row.title,
            status: row.status,
          },
          { id: row.session_id, title: row.session_title },
          row.recording_media_id,
          now,
          lessonPathOf(row.course_slug, row.recording_lesson_id),
        );
      });
    }
    return marked;
  }

  async function recordingMedia(
    workshopId: string,
    sessionId: string,
    userId: string,
  ): Promise<{ media: VideoAssetForPlayback; title: string }> {
    const now = new Date();
    const row = await repository.findPublicById(database, workshopId, now);
    if (!row) throw notFound();
    const session = await repository.findSession(
      database,
      workshopId,
      sessionId,
    );
    if (!session?.recording_media_id || !session.recording_ready_at) {
      throw new AppError(
        404,
        "WORKSHOP_RECORDING_NOT_FOUND",
        "This session has no recording yet.",
      );
    }
    const registration = await repository.findRegistration(
      database,
      workshopId,
      userId,
    );
    if (!(await canWatchRecordings(row, userId, registration))) {
      throw new AppError(
        403,
        "WORKSHOP_NOT_REGISTERED",
        "Recordings are for the workshop's registrants.",
      );
    }
    const asset = await mediaService.getMediaAsset(session.recording_media_id);
    if (!asset) {
      throw new AppError(
        404,
        "WORKSHOP_RECORDING_NOT_FOUND",
        "The recording is no longer available.",
      );
    }
    return {
      media: {
        id: asset.id,
        type: asset.type,
        status: asset.status,
        storageKey: asset.storage_key,
        durationSeconds: asset.duration_seconds,
      },
      title: session.title ? `${row.title} — ${session.title}` : row.title,
    };
  }

  async function recordingPlayback(
    workshopId: string,
    sessionId: string,
    userId: string,
  ): Promise<HeroVideoPlayback> {
    const { media, title } = await recordingMedia(
      workshopId,
      sessionId,
      userId,
    );
    return await mediaService.getVideoAssetPlayback(media, {
      mediaKey: `workshop-recording-${sessionId}`,
      title,
    });
  }

  async function recordingPlaybackToken(
    workshopId: string,
    sessionId: string,
    userId: string,
  ): Promise<VideoPlaybackToken> {
    const { media } = await recordingMedia(workshopId, sessionId, userId);
    return await mediaService.getVideoAssetPlaybackToken(media);
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
    join,
    setRecording,
    markReadyRecordings,
    recordingPlayback,
    recordingPlaybackToken,
    listRegistrants,
    registrantsCsv,
    addRegistrant,
    removeRegistrant,
    importRegistrants,
    standings,
    async listCourseSections(workshopId: string) {
      const row = await load(workshopId);
      if (!row.course_id || !courseLessons) return [];
      return await courseLessons.listSections(row.course_id);
    },
  };
}
