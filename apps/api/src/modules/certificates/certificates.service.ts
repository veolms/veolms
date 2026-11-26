import {
  CERTIFICATE_NAME_CORRECTIONS_ALLOWED,
  certificateNameProblem,
  formatCertificateCode,
  normalizeCertificateCode,
  normalizeCertificateName,
  type CertificateCandidate,
  type CourseCertificatesResponse,
  type CourseCertificateStatus,
  type MyCertificate,
  type PublicCertificate,
  type StaffCertificate,
} from "@veolms/contracts";
import type { Database, DatabaseExecutor } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { createOutboxService } from "../../events/outbox.service.ts";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { createAcademyBrandService } from "../academy/academy-brand.service.ts";
import { createAccessService, isOpenFreeCourse } from "../access/index.ts";
import {
  canActOnCourse,
  hasAcademyPermission,
} from "../authorization/index.ts";
import { createCourseService } from "../courses/index.ts";
import { createCourseCompletionReader } from "../learning-progress/index.ts";
import { calendarDateIn, generateCertificateCode } from "./certificate-code.ts";
import { createCertificateDesignsService } from "./certificate-designs.service.ts";
import { createCertificateSettingsService } from "./certificate-settings.service.ts";
import * as repository from "./certificates.repository.ts";
import {
  CERTIFICATE_TEMPLATE,
  canPrintName,
  type CertificateRenderInput,
} from "./render/certificate-pdf.ts";
import type { CertificateRenderPool } from "./render/certificate-render-pool.ts";

/** A course needs at least this many published lessons to certify anyone. */
const MIN_LESSONS_FOR_CERTIFICATE = 3;
/** Issue dates are the academy's calendar dates (it is in India). */
const CERTIFICATE_TIME_ZONE = "Asia/Kolkata";

export interface CertificatesServiceConfig {
  WEB_URL: string;
  CERTIFICATE_LINKEDIN_ORGANIZATION_ID?: string | undefined;
}

export interface CertificateViewer {
  id: string;
  displayName: string;
}

type CourseFacts = NonNullable<
  Awaited<
    ReturnType<
      ReturnType<typeof createCourseService>["findCourseCertificateFacts"]
    >
  >
>;

function notFound(): AppError {
  return new AppError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found.");
}

function courseNotFound(): AppError {
  return new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
}

function siteHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/**
 * Course certificates: who may claim one, issuing it (once), the learner's
 * own list, name corrections, the public check, the PDF, and the staff's
 * list with revoke and restore. See README.md next to this file.
 */
export function createCertificatesService({
  database,
  services,
  config,
  renderPool,
  logger,
  courseService = createCourseService({ database, services }),
}: {
  database: Kysely<Database>;
  services: AppServices;
  config: CertificatesServiceConfig;
  renderPool: CertificateRenderPool;
  logger?: FastifyBaseLogger;
  courseService?: Pick<
    ReturnType<typeof createCourseService>,
    "findCourseCertificateFacts"
  >;
}) {
  const accessService = createAccessService();
  const completion = createCourseCompletionReader({ database });
  const brand = createAcademyBrandService({ database });
  const outbox = createOutboxService();
  const settings = createCertificateSettingsService({
    database,
    storage: services.storage,
    ...(logger ? { logger } : {}),
  });
  const designs = createCertificateDesignsService({
    database,
    storage: services.storage,
    renderPool,
    ...(logger ? { logger } : {}),
  });
  const siteOrigin = new URL(config.WEB_URL).origin;

  function verifyUrlFor(row: { site_origin: string; public_code: string }) {
    return `${row.site_origin}/certificate/${row.public_code}`;
  }

  function presentMine(row: repository.CertificateRow): MyCertificate {
    return {
      code: row.public_code,
      displayCode: formatCertificateCode(row.public_code),
      courseId: row.course_id,
      courseSlug: row.course_slug,
      courseTitle: row.course_title,
      recipientName: row.recipient_name,
      academyName: row.academy_name,
      issuedOn: row.issued_on,
      issuedAt: row.issued_at.toISOString(),
      status: row.status,
      revision: row.revision,
      verifyUrl: verifyUrlFor(row),
      nameCorrectionsLeft: Math.max(
        0,
        CERTIFICATE_NAME_CORRECTIONS_ALLOWED - row.name_corrections,
      ),
    };
  }

  function presentStaff(row: repository.StaffCertificateRow): StaffCertificate {
    return {
      id: row.id,
      code: row.public_code,
      displayCode: formatCertificateCode(row.public_code),
      learner: row.user_id
        ? {
            id: row.user_id,
            name: row.learner_name ?? row.recipient_name,
            email: row.learner_email,
          }
        : null,
      recipientName: row.recipient_name,
      issuedOn: row.issued_on,
      issuedAt: row.issued_at.toISOString(),
      status: row.status,
      revision: row.revision,
      revokedAt: row.revoked_at?.toISOString() ?? null,
      revokeReason: row.revoke_reason,
    };
  }

  /** The learner's name as their profile has it, ready to print. */
  function profileName(viewer: CertificateViewer): string {
    return normalizeCertificateName(viewer.displayName);
  }

  /** Why a profile name cannot be printed, or null. */
  function profileNameProblem(name: string): string | null {
    const problem = certificateNameProblem(name);
    if (problem) return problem;
    return canPrintName(name) ? null : "Write your name in English letters.";
  }

  /**
   * The profile name, or a refusal that sends the learner to their
   * profile: the name is never typed at claim time.
   */
  function requirePrintableProfileName(
    viewer: CertificateViewer,
    forStaff = false,
  ): string {
    const name = profileName(viewer);
    const problem = profileNameProblem(name);
    if (problem) {
      throw new AppError(
        422,
        "CERTIFICATE_PROFILE_NAME",
        forStaff
          ? `This learner's profile name ("${name}") can't be printed. ${problem} Ask them to update it in Settings > Profile.`
          : `Your profile name can't be printed on a certificate. ${problem} Update it in Settings > Profile.`,
      );
    }
    return name;
  }

  async function requireCourse(courseKey: string): Promise<CourseFacts> {
    const course = await courseService.findCourseCertificateFacts(courseKey);
    if (!course) throw courseNotFound();
    return course;
  }

  /** The course's own share, or the academy's (95 when neither is set). */
  async function thresholdOf(
    courseId: string,
  ): Promise<{ percent: number; source: "course" | "academy" }> {
    const [own, academy] = await Promise.all([
      repository.findThresholdPercent(database, courseId),
      settings.get(),
    ]);
    return own !== null
      ? { percent: own, source: "course" }
      : { percent: academy.thresholdPercent, source: "academy" };
  }

  async function thresholdFor(courseId: string): Promise<number> {
    return (await thresholdOf(courseId)).percent;
  }

  /**
   * Whether the learner may take the whole course now: a live grant to all
   * of it, or a published free course open to everyone. Someone holding
   * part of a course (a link that opens some sections) cannot be certified
   * for all of it.
   */
  async function learnsWholeCourse(
    userId: string,
    course: CourseFacts,
  ): Promise<boolean> {
    if (course.status === "published" && isOpenFreeCourse(course)) return true;
    const scope = await accessService.getAccessScope(
      database,
      userId,
      course.id,
    );
    return scope !== null && scope.sectionIds === null;
  }

  /**
   * Where the learner stands. Records the unlock the first time they are
   * seen at or above the threshold, so that later curriculum changes (new
   * lessons, a reset lesson) cannot take an unclaimed certificate away.
   */
  async function evaluate(
    executor: DatabaseExecutor,
    viewer: CertificateViewer,
    course: CourseFacts,
  ) {
    const [existing, threshold, progress, unlock] = await Promise.all([
      repository.findActiveCertificateForLearner(
        executor,
        viewer.id,
        course.id,
      ),
      thresholdFor(course.id),
      completion.getCourseCompletion(viewer.id, course.id),
      repository.findUnlock(executor, viewer.id, course.id),
    ]);
    let unlocked = Boolean(unlock);
    if (
      !existing &&
      !unlocked &&
      course.certificate_enabled &&
      progress.totalLessons >= MIN_LESSONS_FOR_CERTIFICATE &&
      progress.percent >= threshold &&
      (await learnsWholeCourse(viewer.id, course))
    ) {
      await repository.insertUnlock(
        executor,
        viewer.id,
        course.id,
        progress.percent,
      );
      unlocked = true;
    }
    const state: CourseCertificateStatus["state"] = existing
      ? "issued"
      : !course.certificate_enabled && !unlocked
        ? "disabled"
        : unlocked
          ? "unlocked"
          : "locked";
    return { state, existing, threshold, progress, unlock };
  }

  async function getCourseStatus(
    viewer: CertificateViewer,
    courseKey: string,
  ): Promise<CourseCertificateStatus> {
    const course = await requireCourse(courseKey);
    let result = await evaluate(database, viewer, course);
    if (
      result.state !== "issued" &&
      course.status !== "published" &&
      course.status !== "archived"
    ) {
      throw courseNotFound();
    }
    // Automatic issue's backstop: a learner who reached the share is given
    // the certificate when they open the course, if the progress event that
    // issues it has not done so yet.
    if (
      result.state === "unlocked" &&
      !profileNameProblem(profileName(viewer)) &&
      (await settings.get()).autoIssue
    ) {
      await issue(viewer, course, { issuedBy: null, force: false }).catch(
        (error: unknown) => {
          logger?.warn({ err: error }, "automatic certificate issue failed");
        },
      );
      result = await evaluate(database, viewer, course);
    }
    return {
      state: result.state,
      courseId: course.id,
      courseSlug: course.slug,
      courseTitle: course.title,
      thresholdPercent: result.threshold,
      progressPercent: result.progress.percent,
      completedLessons: result.progress.completedLessons,
      totalLessons: result.progress.totalLessons,
      recipientName: profileName(viewer),
      nameProblem: profileNameProblem(profileName(viewer)),
      certificate: result.existing ? presentMine(result.existing) : null,
    };
  }

  /**
   * Issues the certificate, once, to the learner's profile name (never a
   * typed name). Issues for the same learner and course take turns (an
   * advisory lock) and the partial unique index allows one active
   * certificate, so a double click, two tabs, both API servers, the
   * automatic issue and a manual one all end with the same certificate.
   *
   * `force` (staff issuing by hand): whatever the learner's progress, and
   * even when the course does not give certificates. `issuedBy` is the
   * staff member, or null for the learner's own or the automatic issue.
   */
  async function issue(
    learner: CertificateViewer,
    course: CourseFacts,
    options: { issuedBy: string | null; force: boolean },
  ): Promise<{ certificate: MyCertificate; created: boolean }> {
    const [academy, designId] = await Promise.all([
      brand.getBrand(),
      // Recorded with the certificate; downloads use the design finalised
      // at the time they are drawn.
      designs.activeDesignId(),
    ]);

    const outcome = await database.transaction().execute(async (trx) => {
      await repository.lockLearnerCourse(trx, learner.id, course.id);
      const result = await evaluate(trx, learner, course);
      if (result.existing) {
        return { id: result.existing.id, created: false };
      }
      if (!options.force && result.state !== "unlocked") {
        throw new AppError(
          409,
          "CERTIFICATE_NOT_UNLOCKED",
          result.state === "disabled"
            ? "This course does not give a certificate."
            : `Finish ${result.threshold}% of the lessons to unlock the certificate.`,
        );
      }
      // Asked only once it is unlocked: "finish the lessons" comes first.
      const recipientName = requirePrintableProfileName(
        learner,
        options.issuedBy !== null,
      );
      const now = new Date();
      // 80 random bits: two certificates drawing the same code is not a
      // case to handle (the unique index would refuse it, and the issue
      // would simply be tried again).
      const id = await repository.insertCertificate(trx, {
        publicCode: generateCertificateCode(),
        userId: learner.id,
        courseId: course.id,
        recipientName,
        courseTitle: course.title,
        courseSlug: course.slug,
        academyName: academy.name,
        siteOrigin,
        templateKey: CERTIFICATE_TEMPLATE.key,
        templateVersion: CERTIFICATE_TEMPLATE.version,
        issuedOn: calendarDateIn(now, CERTIFICATE_TIME_ZONE),
        issuedAt: now,
        issuedBy: options.issuedBy,
        designId,
        ruleSnapshot: {
          thresholdPercent: result.threshold,
          percentAtClaim: result.progress.percent,
          completedLessons: result.progress.completedLessons,
          totalLessons: result.progress.totalLessons,
          unlockedAt: result.unlock?.unlocked_at.toISOString() ?? null,
          manual: options.issuedBy !== null,
        },
      });
      if (!id) {
        // Issued by another request between the check and the insert.
        const existing = await repository.findActiveCertificateForLearner(
          trx,
          learner.id,
          course.id,
        );
        if (existing) return { id: existing.id, created: false };
        throw new Error("The certificate could not be issued.");
      }
      await repository.insertEvent(trx, {
        certificateId: id,
        type: "issued",
        actorId: options.issuedBy ?? learner.id,
        data: { manual: options.issuedBy !== null },
      });
      const row = await repository.findCertificateById(trx, id);
      // The learner is told, in the app and by email, with the link.
      await outbox.publish(trx, {
        type: "certificate.generated",
        version: 1,
        dedupeKey: `certificate.generated:${id}`,
        occurredAt: now,
        payload: {
          recipientUserId: learner.id,
          courseTitle: course.title.slice(0, 255),
          certificateId: id,
          certificateCode: row!.public_code,
        },
      });
      return { id, created: true };
    });

    const row = await repository.findCertificateById(database, outcome.id);
    if (!row) throw notFound();
    return { certificate: presentMine(row), created: outcome.created };
  }

  /** The learner claims it themself (when automatic issue is off). */
  async function claim(
    viewer: CertificateViewer,
    courseKey: string,
  ): Promise<{ certificate: MyCertificate; created: boolean }> {
    const course = await requireCourse(courseKey);
    return issue(viewer, course, { issuedBy: null, force: false });
  }

  /**
   * Called when a learner finishes a lesson (the progress event): issues
   * and emails the certificate if the academy issues them automatically
   * and the learner has now reached the share. Quietly does nothing
   * otherwise (not reached yet, already issued, a profile name that cannot
   * be printed: the learner then claims it after fixing their profile).
   */
  async function autoIssue(userId: string, courseId: string): Promise<void> {
    if (!(await settings.get()).autoIssue) return;
    const course = await courseService.findCourseCertificateFacts(courseId);
    if (!course?.certificate_enabled) return;
    const learner = await repository.findLearner(database, userId);
    if (!learner) return;
    const viewer = { id: learner.id, displayName: learner.display_name };
    if (profileNameProblem(profileName(viewer))) return;
    const result = await evaluate(database, viewer, course);
    if (result.state !== "unlocked") return;
    await issue(viewer, course, { issuedBy: null, force: false });
  }

  /**
   * Staff (`certificate.issue` on the course: administrators, and
   * instructors for their own courses) issue a learner's certificate by
   * hand, whatever their progress.
   */
  async function manualIssue(
    staffId: string,
    courseKey: string,
    userId: string,
  ): Promise<StaffCertificate> {
    const course = await requireCourseForStaff(
      staffId,
      courseKey,
      "certificate.issue",
    );
    const learner = await repository.findLearner(database, userId);
    if (!learner) {
      throw new AppError(404, "LEARNER_NOT_FOUND", "Learner not found.");
    }
    const { certificate } = await issue(
      { id: learner.id, displayName: learner.display_name },
      course,
      { issuedBy: staffId, force: true },
    );
    const row = await repository.findCertificateByCode(
      database,
      certificate.code,
    );
    return presentStaffById(row!.id);
  }

  /**
   * The course's learners staff may issue a certificate to by hand: anyone
   * enrolled in it, with how far they are and whether they hold one.
   */
  async function candidates(
    staffId: string,
    courseKey: string,
    query: string | undefined,
  ): Promise<CertificateCandidate[]> {
    const course = await requireCourseForStaff(
      staffId,
      courseKey,
      "certificate.issue",
    );
    const learners = await repository.listCourseLearners(
      database,
      course.id,
      query || undefined,
    );
    return Promise.all(
      learners.map(async (learner) => {
        const progress = await completion.getCourseCompletion(
          learner.id,
          course.id,
        );
        const name = normalizeCertificateName(learner.display_name);
        return {
          userId: learner.id,
          name: learner.display_name,
          email: learner.email,
          progressPercent: progress.percent,
          hasCertificate: learner.has_certificate,
          nameProblem: profileNameProblem(name),
        };
      }),
    );
  }

  async function listMine(userId: string): Promise<MyCertificate[]> {
    const rows = await repository.listCertificatesForUser(database, userId);
    return rows.map(presentMine);
  }

  async function requireOwnCertificate(userId: string, code: string) {
    const normalized = normalizeCertificateCode(code);
    const row = normalized
      ? await repository.findCertificateByCode(database, normalized)
      : undefined;
    if (!row || row.user_id !== userId) throw notFound();
    return row;
  }

  /**
   * The certificate takes the learner's current profile name, after they
   * corrected it in their profile (a typo, a missing surname). Allowed
   * twice; the code stays the same, so links and QR codes on copies
   * already shared keep working, and the revision goes up.
   */
  async function correctName(
    viewer: CertificateViewer,
    code: string,
  ): Promise<MyCertificate> {
    const row = await requireOwnCertificate(viewer.id, code);
    if (row.status !== "active") {
      throw new AppError(
        409,
        "CERTIFICATE_REVOKED",
        "This certificate has been revoked.",
      );
    }
    const recipientName = requirePrintableProfileName(viewer);
    if (recipientName === row.recipient_name) return presentMine(row);
    if (row.name_corrections >= CERTIFICATE_NAME_CORRECTIONS_ALLOWED) {
      throw new AppError(
        409,
        "CERTIFICATE_NAME_CORRECTIONS_USED",
        "The name has already been updated twice. Ask support to change it.",
      );
    }
    await database.transaction().execute(async (trx) => {
      await repository.updateRecipientName(trx, row.id, recipientName, true);
      await repository.insertEvent(trx, {
        certificateId: row.id,
        type: "name_corrected",
        actorId: viewer.id,
        data: { from: row.recipient_name, to: recipientName },
      });
    });
    return presentMine(
      (await repository.findCertificateById(database, row.id))!,
    );
  }

  /**
   * What anyone may see about a certificate. The same answer for a code
   * that does not exist and one that is malformed, so codes cannot be
   * probed for their shape.
   */
  async function getPublic(code: string): Promise<PublicCertificate> {
    const normalized = normalizeCertificateCode(code);
    const row = normalized
      ? await repository.findCertificateByCode(database, normalized)
      : undefined;
    if (!row) throw notFound();
    return {
      code: row.public_code,
      displayCode: formatCertificateCode(row.public_code),
      status: row.status === "active" ? "valid" : "revoked",
      // A deleted account's name is no longer shown.
      recipientName: row.user_id ? row.recipient_name : null,
      courseTitle: row.course_title,
      courseSlug: row.course_id ? row.course_slug : null,
      academyName: row.academy_name,
      issuedOn: row.issued_on,
      revokedOn: row.revoked_at
        ? calendarDateIn(row.revoked_at, CERTIFICATE_TIME_ZONE)
        : null,
      verifyUrl: verifyUrlFor(row),
      linkedInOrganizationId:
        config.CERTIFICATE_LINKEDIN_ORGANIZATION_ID ?? null,
    };
  }

  async function mayManage(
    userId: string,
    courseId: string | null,
    permission: "certificate.issue" | "certificate.revoke",
  ): Promise<boolean> {
    if (!courseId) return hasAcademyPermission(database, userId, permission);
    const course = await courseService.findCourseCertificateFacts(courseId);
    if (!course) return hasAcademyPermission(database, userId, permission);
    return canActOnCourse(database, {
      userId,
      permission,
      course: { id: course.id, creator_id: course.creator_id },
    });
  }

  /**
   * The PDF, drawn now from the certificate's snapshot. Its owner may
   * download it while it is active; staff who may see the course's
   * certificates may download any.
   */
  async function download(
    viewer: CertificateViewer,
    code: string,
  ): Promise<{ pdf: Buffer; fileName: string; etag: string }> {
    const normalized = normalizeCertificateCode(code);
    const row = normalized
      ? await repository.findCertificateByCode(database, normalized)
      : undefined;
    if (!row) throw notFound();
    const isOwner = row.user_id === viewer.id;
    if (
      !isOwner &&
      !(await mayManage(viewer.id, row.course_id, "certificate.issue"))
    ) {
      throw notFound();
    }
    if (isOwner && row.status !== "active") {
      throw new AppError(
        410,
        "CERTIFICATE_REVOKED",
        "This certificate has been revoked.",
      );
    }
    return renderRow(row);
  }

  /**
   * Draws a certificate now, on the design finalised now, with the
   * academy's signature. Nothing is stored.
   */
  async function renderRow(
    row: repository.CertificateRow,
  ): Promise<{ pdf: Buffer; fileName: string; etag: string }> {
    const displayCode = formatCertificateCode(row.public_code);
    const input: CertificateRenderInput = {
      recipientName: row.recipient_name,
      courseTitle: row.course_title,
      issuedOn: row.issued_on,
      issuedAt: row.issued_at,
      displayCode,
      verifyUrl: verifyUrlFor(row),
      verifyUrlShort: `${siteHost(row.site_origin)}/certificate/${displayCode}`,
    };
    // Drawn on the design finalised now (Platform > Certificates).
    const active = await designs.resolveActive();
    let pdf: Buffer;
    try {
      pdf = await renderPool.render(
        input,
        active.design,
        await settings.signatureBytes(),
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger?.error(
        { err: error, certificate: row.public_code },
        "certificate PDF could not be drawn",
      );
      throw new AppError(
        500,
        "CERTIFICATE_RENDER_FAILED",
        "The certificate PDF could not be prepared. Try again.",
      );
    }
    return {
      pdf,
      fileName: `${row.academy_name} Certificate - ${row.course_title} - ${row.recipient_name}.pdf`,
      etag: `"${row.public_code}-${row.revision}-${active.version}"`,
    };
  }

  /** The PDF sent with the "certificate ready" email (drawn, not stored). */
  async function pdfForEmail(
    certificateId: string,
  ): Promise<{ pdf: Buffer; fileName: string }> {
    const row = await repository.findCertificateById(database, certificateId);
    if (!row) throw notFound();
    const { pdf, fileName } = await renderRow(row);
    return { pdf, fileName };
  }

  async function requireCourseForStaff(
    userId: string,
    courseKey: string,
    permission: "certificate.issue" | "course.details.update",
  ): Promise<CourseFacts> {
    const course = await requireCourse(courseKey);
    const allowed = await canActOnCourse(database, {
      userId,
      permission,
      course: { id: course.id, creator_id: course.creator_id },
    });
    if (!allowed) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "You can't see this course's certificates.",
      );
    }
    return course;
  }

  async function listForCourse(
    userId: string,
    courseKey: string,
    query: {
      cursor?: string | undefined;
      limit: number;
      q?: string | undefined;
    },
  ): Promise<CourseCertificatesResponse> {
    const course = await requireCourseForStaff(
      userId,
      courseKey,
      "certificate.issue",
    );
    const cursor = decodeCursor(query.cursor);
    const [rows, threshold, issuedCount] = await Promise.all([
      repository.listCertificatesForCourse(database, course.id, {
        limit: query.limit + 1,
        cursor,
        query: query.q || undefined,
      }),
      thresholdOf(course.id),
      repository.countActiveCertificatesForCourse(database, course.id),
    ]);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      thresholdPercent: threshold.percent,
      thresholdSource: threshold.source,
      issuedCount,
      items: page.map(presentStaff),
      nextCursor:
        rows.length > query.limit && last
          ? `${last.issued_at.toISOString()}|${last.id}`
          : null,
    };
  }

  /**
   * The share of lessons a course asks for. Learners who already unlocked
   * or hold a certificate keep it whatever the new value.
   */
  async function setThreshold(
    userId: string,
    courseKey: string,
    thresholdPercent: number | null,
  ): Promise<{
    thresholdPercent: number;
    thresholdSource: "course" | "academy";
  }> {
    const course = await requireCourseForStaff(
      userId,
      courseKey,
      "course.details.update",
    );
    if (thresholdPercent === null) {
      await repository.deleteThresholdPercent(database, course.id);
    } else {
      await repository.upsertThresholdPercent(
        database,
        course.id,
        thresholdPercent,
      );
    }
    const threshold = await thresholdOf(course.id);
    return {
      thresholdPercent: threshold.percent,
      thresholdSource: threshold.source,
    };
  }

  async function requireManagedCertificate(
    userId: string,
    certificateId: string,
  ) {
    const row = await repository.findCertificateById(database, certificateId);
    if (!row) throw notFound();
    if (!(await mayManage(userId, row.course_id, "certificate.revoke"))) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "You can't revoke this course's certificates.",
      );
    }
    return row;
  }

  /**
   * Revoked: the public page says so (never why), and the owner can no
   * longer download it. Copies already downloaded carry a QR code that now
   * leads to that page.
   */
  async function revoke(
    userId: string,
    certificateId: string,
    reason: string,
  ): Promise<StaffCertificate> {
    const row = await requireManagedCertificate(userId, certificateId);
    if (row.status === "active") {
      await database.transaction().execute(async (trx) => {
        const at = new Date();
        await repository.markRevoked(trx, row.id, {
          revokedBy: userId,
          reason,
          at,
        });
        await repository.insertEvent(trx, {
          certificateId: row.id,
          type: "revoked",
          actorId: userId,
          data: { reason },
        });
      });
    }
    return presentStaffById(row.id);
  }

  async function restore(
    userId: string,
    certificateId: string,
  ): Promise<StaffCertificate> {
    const row = await requireManagedCertificate(userId, certificateId);
    if (row.status === "revoked") {
      await database.transaction().execute(async (trx) => {
        if (row.user_id && row.course_id) {
          await repository.lockLearnerCourse(trx, row.user_id, row.course_id);
          const other = await repository.findActiveCertificateForLearner(
            trx,
            row.user_id,
            row.course_id,
          );
          if (other) {
            throw new AppError(
              409,
              "CERTIFICATE_ALREADY_ACTIVE",
              "The learner already holds an active certificate for this course.",
            );
          }
        }
        await repository.markRestored(trx, row.id, new Date());
        await repository.insertEvent(trx, {
          certificateId: row.id,
          type: "restored",
          actorId: userId,
        });
      });
    }
    return presentStaffById(row.id);
  }

  async function presentStaffById(id: string): Promise<StaffCertificate> {
    const row = await repository.findCertificateById(database, id);
    if (!row) throw notFound();
    const [withLearner] = row.course_id
      ? await repository.listCertificatesForCourse(database, row.course_id, {
          limit: 1,
          query: row.public_code,
        })
      : [];
    return presentStaff(
      withLearner ?? { ...row, learner_name: null, learner_email: null },
    );
  }

  return {
    getCourseStatus,
    pdfForEmail,
    autoIssue,
    manualIssue,
    candidates,
    claim,
    listMine,
    correctName,
    getPublic,
    download,
    listForCourse,
    setThreshold,
    revoke,
    restore,
  };
}

export type CertificatesService = ReturnType<typeof createCertificatesService>;

function decodeCursor(
  cursor: string | undefined,
): { issuedAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  const [at, id] = cursor.split("|");
  const issuedAt = new Date(at ?? "");
  if (!id || Number.isNaN(issuedAt.getTime())) return undefined;
  return { issuedAt, id };
}
