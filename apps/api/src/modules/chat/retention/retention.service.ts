import { CHAT_RESTORE_DAYS } from "@veolms/contracts";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";

import { config } from "../../../config.ts";

import { createChatRepository } from "../shared/chat.repository.ts";

const BATCH = 5_000;
/** At most this many batches per run, so one run never holds the database long. */
const MAX_BATCHES = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Retention (decision 4): course-group messages older than the platform's
 * retention (120 months by default; pinned ones are kept), and the text of
 * messages deleted more than 7 days ago (the restore window), removed in
 * small batches. Safe to run on several processes at once: each batch
 * deletes or clears rows that are still there.
 */
const RECEIPT_MARK_DAYS = 30;

export function createChatRetention(storage?: S3StorageService) {
  const repository = createChatRepository();

  return {
    async run(database: Executor) {
      const settings = await repository.getSettings(database);
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - settings.course_retention_months);
      const deletedCutoff = new Date(Date.now() - CHAT_RESTORE_DAYS * DAY_MS);

      let purged = 0;
      for (let i = 0; i < MAX_BATCHES; i += 1) {
        const removed = await repository.purgeCourseMessages(
          database,
          cutoff,
          BATCH,
        );
        purged += removed;
        if (removed < BATCH) break;
      }
      let cleared = 0;
      for (let i = 0; i < MAX_BATCHES; i += 1) {
        const done = await repository.clearDeletedBodies(
          database,
          deletedCutoff,
          BATCH,
        );
        cleared += done;
        if (done < BATCH) break;
      }
      // Message info's times are kept 30 days.
      let marks = 0;
      const marksCutoff = new Date(Date.now() - RECEIPT_MARK_DAYS * DAY_MS);
      for (let i = 0; i < MAX_BATCHES; i += 1) {
        const removed = await repository.pruneReceiptMarks(
          database,
          marksCutoff,
          BATCH * 10,
        );
        marks += removed;
        if (removed < BATCH * 10) break;
      }
      // Files nobody can read any more: never sent, or whose message is gone.
      let removedFiles = 0;
      if (
        storage &&
        config.STORAGE_ACCESS_KEY_ID &&
        config.STORAGE_SECRET_ACCESS_KEY
      ) {
        for (let i = 0; i < MAX_BATCHES; i += 1) {
          const rows = await repository.listRemovableUploads(
            database,
            new Date(Date.now() - DAY_MS),
            deletedCutoff,
            500,
          );
          if (rows.length === 0) break;
          await storage.deleteObjects(rows.map((row) => row.storage_key));
          await repository.deleteUploads(
            database,
            rows.map((row) => row.id),
          );
          removedFiles += rows.length;
          if (rows.length < 500) break;
        }
      }
      return {
        removedFiles,
        purgedMessages: purged,
        clearedDeletedBodies: cleared,
        prunedReceiptMarks: marks,
        retentionMonths: settings.course_retention_months,
      };
    },
  };
}
