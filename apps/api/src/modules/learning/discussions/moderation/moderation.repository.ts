import type {
  Database,
  DatabaseExecutor,
  LearningAuditLogTable,
  LearningReportTable,
  LearningSuspensionTable,
} from "@veolms/database";
import type {
  EngagementTargetType,
  ListAuditLogsQuery,
  ListReportsQuery,
  ReportReason,
  ReportStatus,
  SuspensionScope,
} from "@veolms/contracts";
import type { Selectable, SelectQueryBuilder } from "kysely";
import { sql } from "kysely";
import {
  authorRoleSql,
  createdAtIdDescSql,
  type DiscussionListCursor,
} from "../shared/discussion.utils.ts";

export type LearningReportRow = Selectable<LearningReportTable>;
export type LearningSuspensionRow = Selectable<LearningSuspensionTable>;
export type LearningAuditLogRow = Selectable<LearningAuditLogTable>;

// Kysely represents a `"learning_reports as rep"` aliased query with the
// alias added as its own entry on the DB generic, not the bare table name.
type ReportsAliasedDB = Database & { rep: LearningReportTable };

export interface ReportRowWithReporter {
  id: string;
  reporterId: string;
  targetType: EngagementTargetType;
  targetId: string;
  courseId: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reviewedByUserId: string | null;
  actionTaken: string | null;
  createdAt: Date;
  updatedAt: Date;
  reporterName: string | null;
  reporterUsername: string | null;
  reporterEmail: string | null;
  authorRole: string | null;
}

export interface AuditLogRowWithActor {
  id: string;
  academyId: string;
  courseId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: unknown | null;
  ipAddress: string | null;
  createdAt: Date;
  actorName: string | null;
  actorUsername: string | null;
  actorEmail: string | null;
  authorRole: string | null;
}

export interface ModerationRepository {
  createReport(
    db: DatabaseExecutor,
    report: {
      id: string;
      reporterId: string;
      targetType: EngagementTargetType;
      targetId: string;
      courseId?: string | null;
      reason: ReportReason;
      details?: string;
    },
  ): Promise<void>;

  findPendingReport(
    db: DatabaseExecutor,
    reporterId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<LearningReportRow | null>;

  listReports(
    db: DatabaseExecutor,
    options: ListReportsQuery & { pageCursor?: DiscussionListCursor },
  ): Promise<ReportRowWithReporter[]>;

  countReports(
    db: DatabaseExecutor,
    options: ListReportsQuery,
  ): Promise<number>;

  updateReportStatus(
    db: DatabaseExecutor,
    reportId: string,
    status: ReportStatus,
    reviewedByUserId: string,
    actionTaken?: string,
  ): Promise<void>;

  createSuspension(
    db: DatabaseExecutor,
    suspension: {
      id: string;
      academyId: string;
      courseId?: string | null;
      userId: string;
      suspendedByUserId?: string | null;
      scope: SuspensionScope;
      reason: string;
      expiresAt: Date | null;
    },
  ): Promise<void>;

  deactivateSuspension(
    db: DatabaseExecutor,
    userId: string,
    courseId?: string | null,
  ): Promise<number>;

  getActiveSuspension(
    db: DatabaseExecutor,
    userId: string,
    courseId?: string | null,
  ): Promise<LearningSuspensionRow | null>;

  createAuditLog(
    db: DatabaseExecutor,
    log: {
      id: string;
      academyId: string;
      courseId?: string | null;
      actorUserId?: string | null;
      action: string;
      targetType: string;
      targetId: string;
      details?: Record<string, unknown> | null;
      ipAddress?: string | null;
    },
  ): Promise<void>;

  listAuditLogs(
    db: DatabaseExecutor,
    academyId: string,
    options: ListAuditLogsQuery & { pageCursor?: DiscussionListCursor },
  ): Promise<AuditLogRowWithActor[]>;
}

function applyReportFilters<O>(
  query: SelectQueryBuilder<ReportsAliasedDB, "rep", O>,
  options: ListReportsQuery,
): SelectQueryBuilder<ReportsAliasedDB, "rep", O> {
  let q = query;
  if (options.courseId) {
    q = q.where("rep.course_id", "=", options.courseId);
  }

  if (options.status) {
    q = q.where("rep.status", "=", options.status);
  }

  if (options.targetType) {
    q = q.where("rep.target_type", "=", options.targetType);
  }

  return q;
}

export function createModerationRepository(): ModerationRepository {
  return {
    async createReport(db, report) {
      await db
        .insertInto("learning_reports")
        .values({
          id: report.id,
          reporter_id: report.reporterId,
          target_type: report.targetType,
          target_id: report.targetId,
          course_id: report.courseId || null,
          reason: report.reason,
          details: report.details || null,
          status: "pending",
        })
        .execute();
    },

    async findPendingReport(db, reporterId, targetType, targetId) {
      const row = await db
        .selectFrom("learning_reports")
        .selectAll()
        .where("reporter_id", "=", reporterId)
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .where("status", "=", "pending")
        .executeTakeFirst();

      return row ?? null;
    },

    async listReports(db, options) {
      let filtered = db.selectFrom("learning_reports as rep");
      filtered = applyReportFilters(filtered, options);
      if (options.pageCursor) {
        filtered = filtered.where(createdAtIdDescSql("rep", options.pageCursor));
      }

      const rows = await filtered
        .innerJoin("users as u", "u.id", "rep.reporter_id")
        .select([
          "rep.id as id",
          "rep.reporter_id as reporterId",
          "rep.target_type as targetType",
          "rep.target_id as targetId",
          "rep.course_id as courseId",
          "rep.reason as reason",
          "rep.details as details",
          "rep.status as status",
          "rep.reviewed_by_user_id as reviewedByUserId",
          "rep.action_taken as actionTaken",
          "rep.created_at as createdAt",
          "rep.updated_at as updatedAt",
          "u.display_name as reporterName",
          "u.username as reporterUsername",
          "u.email as reporterEmail",
          authorRoleSql("rep.reporter_id"),
        ])
        .orderBy("rep.created_at", "desc")
        .orderBy("rep.id", "desc")
        .limit(options.limit + 1)
        .execute();

      return rows as ReportRowWithReporter[];
    },

    async countReports(db, options) {
      let query = db
        .selectFrom("learning_reports as rep")
        .select(sql<number>`count(*)::int`.as("count"));

      query = applyReportFilters(query, options);

      const row = await query.executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    async updateReportStatus(
      db,
      reportId,
      status,
      reviewedByUserId,
      actionTaken,
    ) {
      await db
        .updateTable("learning_reports")
        .set({
          status,
          reviewed_by_user_id: reviewedByUserId,
          action_taken: actionTaken || null,
          updated_at: new Date(),
        })
        .where("id", "=", reportId)
        .execute();
    },

    async createSuspension(db, suspension) {
      await db
        .insertInto("learning_suspensions")
        .values({
          id: suspension.id,
          academy_id: suspension.academyId,
          course_id: suspension.courseId || null,
          user_id: suspension.userId,
          suspended_by_user_id: suspension.suspendedByUserId || null,
          scope: suspension.scope,
          reason: suspension.reason,
          expires_at: suspension.expiresAt,
          is_active: true,
        })
        .execute();
    },

    async deactivateSuspension(db, userId, courseId) {
      let query = db
        .updateTable("learning_suspensions")
        .set({
          is_active: false,
          updated_at: new Date(),
        })
        .where("user_id", "=", userId)
        .where("is_active", "=", true);

      query = courseId
        ? query.where("course_id", "=", courseId)
        : query.where("course_id", "is", null);

      const result = await query.executeTakeFirst();
      return Number(result.numUpdatedRows ?? 0);
    },

    async getActiveSuspension(db, userId, courseId) {
      let query = db
        .selectFrom("learning_suspensions")
        .selectAll()
        .where("user_id", "=", userId)
        .where("is_active", "=", true)
        .where((eb) =>
          eb.or([
            eb("expires_at", "is", null),
            eb("expires_at", ">", new Date()),
          ]),
        );

      query = courseId
        ? query.where((eb) =>
            eb.or([
              eb("course_id", "is", null),
              eb("course_id", "=", courseId),
            ]),
          )
        : query.where("course_id", "is", null);

      const row = await query.executeTakeFirst();
      return row ?? null;
    },

    async createAuditLog(db, log) {
      await db
        .insertInto("learning_audit_logs")
        .values({
          id: log.id,
          academy_id: log.academyId,
          course_id: log.courseId || null,
          actor_user_id: log.actorUserId || null,
          action: log.action,
          target_type: log.targetType,
          target_id: log.targetId,
          details: log.details ? JSON.stringify(log.details) : null,
          ip_address: log.ipAddress || null,
        })
        .execute();
    },

    async listAuditLogs(db, academyId, options) {
      let query = db
        .selectFrom("learning_audit_logs as a")
        .leftJoin("users as u", "u.id", "a.actor_user_id")
        .select([
          "a.id as id",
          "a.academy_id as academyId",
          "a.course_id as courseId",
          "a.actor_user_id as actorUserId",
          "a.action as action",
          "a.target_type as targetType",
          "a.target_id as targetId",
          "a.details as details",
          "a.ip_address as ipAddress",
          "a.created_at as createdAt",
          "u.display_name as actorName",
          "u.username as actorUsername",
          "u.email as actorEmail",
          authorRoleSql("a.actor_user_id"),
        ])
        .where("a.academy_id", "=", academyId);

      if (options.courseId) {
        query = query.where("a.course_id", "=", options.courseId);
      }

      if (options.actorUserId) {
        query = query.where("a.actor_user_id", "=", options.actorUserId);
      }

      if (options.targetId) {
        query = query.where("a.target_id", "=", options.targetId);
      }

      if (options.action) {
        query = query.where("a.action", "=", options.action);
      }

      if (options.pageCursor) {
        query = query.where(createdAtIdDescSql("a", options.pageCursor));
      }

      const rows = await query
        .orderBy("a.created_at", "desc")
        .orderBy("a.id", "desc")
        .limit(options.limit + 1)
        .execute();

      return rows as AuditLogRowWithActor[];
    },
  };
}
