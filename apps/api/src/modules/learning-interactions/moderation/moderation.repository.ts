import type { DatabaseExecutor } from "@veolms/database";
import type {
  EngagementTargetType,
  ListAuditLogsQuery,
  ListReportsQuery,
  ReportReason,
  ReportStatus,
} from "@veolms/contracts";

export interface ModerationRepository {
  createReport(
    db: DatabaseExecutor,
    report: {
      id: string;
      reporterId: string;
      targetType: EngagementTargetType;
      targetId: string;
      reason: ReportReason;
      details?: string;
    },
  ): Promise<void>;

  listReports(
    db: DatabaseExecutor,
    options: ListReportsQuery,
  ): Promise<any[]>;

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
      userId: string;
      suspendedByUserId: string;
      reason: string;
      expiresAt: Date | null;
    },
  ): Promise<void>;

  getActiveSuspension(
    db: DatabaseExecutor,
    userId: string,
  ): Promise<any | null>;

  createAuditLog(
    db: DatabaseExecutor,
    log: {
      id: string;
      academyId: string;
      actorUserId: string;
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
    options: ListAuditLogsQuery,
  ): Promise<any[]>;
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
          reason: report.reason,
          details: report.details || null,
          status: "pending",
        })
        .execute();
    },

    async listReports(db, options) {
      let query = db
        .selectFrom("learning_reports as rep")
        .innerJoin("users as u", "u.id", "rep.reporter_id")
        .select([
          "rep.id as id",
          "rep.reporter_id as reporterId",
          "rep.target_type as targetType",
          "rep.target_id as targetId",
          "rep.reason as reason",
          "rep.details as details",
          "rep.status as status",
          "rep.reviewed_by_user_id as reviewedByUserId",
          "rep.action_taken as actionTaken",
          "rep.created_at as createdAt",
          "rep.updated_at as updatedAt",
          "u.display_name as reporterName",
          "u.email as reporterEmail",
        ]);

      if (options.status) {
        query = query.where("rep.status", "=", options.status);
      }

      if (options.targetType) {
        query = query.where("rep.target_type", "=", options.targetType);
      }

      return query
        .orderBy("rep.created_at", "desc")
        .limit(options.limit)
        .execute();
    },

    async updateReportStatus(db, reportId, status, reviewedByUserId, actionTaken) {
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
          user_id: suspension.userId,
          suspended_by_user_id: suspension.suspendedByUserId,
          reason: suspension.reason,
          expires_at: suspension.expiresAt,
          is_active: true,
        })
        .execute();
    },

    async getActiveSuspension(db, userId) {
      return db
        .selectFrom("learning_suspensions")
        .selectAll()
        .where("user_id", "=", userId)
        .where("is_active", "=", true)
        .where((eb) =>
          eb.or([
            eb("expires_at", "is", null),
            eb("expires_at", ">", new Date()),
          ]),
        )
        .executeTakeFirst();
    },

    async createAuditLog(db, log) {
      await db
        .insertInto("learning_audit_logs")
        .values({
          id: log.id,
          academy_id: log.academyId,
          actor_user_id: log.actorUserId,
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
        .innerJoin("users as u", "u.id", "a.actor_user_id")
        .select([
          "a.id as id",
          "a.academy_id as academyId",
          "a.actor_user_id as actorUserId",
          "a.action as action",
          "a.target_type as targetType",
          "a.target_id as targetId",
          "a.details as details",
          "a.ip_address as ipAddress",
          "a.created_at as createdAt",
          "u.display_name as actorName",
          "u.email as actorEmail",
        ])
        .where("a.academy_id", "=", academyId);

      if (options.actorUserId) {
        query = query.where("a.actor_user_id", "=", options.actorUserId);
      }

      if (options.targetId) {
        query = query.where("a.target_id", "=", options.targetId);
      }

      if (options.action) {
        query = query.where("a.action", "=", options.action);
      }

      return query
        .orderBy("a.created_at", "desc")
        .limit(options.limit)
        .execute();
    },
  };
}
