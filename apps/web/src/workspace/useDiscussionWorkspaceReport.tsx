import { lazy, Suspense, useCallback, useState } from "react";
import { useCreateReport } from "../services/learning-interactions";
import type {
  ReportSubmissionPayload,
  ReportTarget,
} from "../learning/DiscussionReportDialog";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";

// Loaded the first time someone reports, not with the page.
const DiscussionReportDialog = lazy(() =>
  import("../learning/DiscussionReportDialog").then((module) => ({
    default: module.DiscussionReportDialog,
  })),
);

const REPORT_RECEIVED_NOTICE =
  "Report received. Our moderation team will review it.";

/**
 * "Report" from the Discussions page's menus: the lesson page's report
 * dialog, sent the same way. Duplicate reports and other errors are shown
 * inside the dialog by the dialog itself.
 */
export function useDiscussionWorkspaceReport(
  setNotice?: (message: string) => void,
) {
  const createReport = useCreateReport();
  const [target, setTarget] = useState<
    (ReportTarget & { courseId?: string }) | null
  >(null);

  const openReport = useCallback((card: DiscussionWorkspaceCard) => {
    setTarget({
      targetType: card.itemType === "reply" ? "reply" : "thread",
      targetId: card.id,
      authorName: card.author,
      courseId: card.courseId || undefined,
    });
  }, []);

  const close = () => {
    if (!createReport.isPending) setTarget(null);
  };

  const submit = async (payload: ReportSubmissionPayload) => {
    await createReport.mutateAsync({
      targetType: payload.targetType,
      targetId: payload.targetId,
      courseId: payload.courseId,
      reason: payload.reason,
      details: payload.details,
    });
    setTarget(null);
    setNotice?.(REPORT_RECEIVED_NOTICE);
    return true;
  };

  const reportDialog = target ? (
    <Suspense fallback={null}>
      <DiscussionReportDialog
        open
        target={target}
        courseId={target.courseId}
        onClose={close}
        onSubmit={submit}
        isSubmitting={createReport.isPending}
      />
    </Suspense>
  ) : null;

  return { openReport, reportDialog };
}
