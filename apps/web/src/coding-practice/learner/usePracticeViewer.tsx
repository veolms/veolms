import { lazy, Suspense, useCallback, useEffect, useState } from "react";

const PracticeView = lazy(() => import("./PracticeView"));

/** Marks the history entry the open practice view added. */
const HISTORY_MARK = "veoPractice";

/**
 * Opens one practice question full screen. It adds one history entry (the
 * same address: the learning page keeps its own address tidy), so the
 * browser's or phone's Back closes it.
 */
export function usePracticeViewer() {
  const [opened, setOpened] = useState<{
    assignmentId: string;
    contextTitle: string;
  } | null>(null);

  useEffect(() => {
    if (!opened) return undefined;
    const onPop = (event: PopStateEvent) => {
      if (!(event.state as Record<string, unknown> | null)?.[HISTORY_MARK])
        setOpened(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [opened]);

  const open = useCallback((assignmentId: string, contextTitle: string) => {
    window.history.pushState(
      {
        ...(window.history.state as object | null),
        [HISTORY_MARK]: assignmentId,
      },
      "",
    );
    setOpened({ assignmentId, contextTitle });
  }, []);

  const close = useCallback(() => {
    if (
      (window.history.state as Record<string, unknown> | null)?.[HISTORY_MARK]
    )
      window.history.back();
    else setOpened(null);
  }, []);

  const view = opened ? (
    <Suspense fallback={null}>
      <PracticeView
        assignmentId={opened.assignmentId}
        lectureTitle={opened.contextTitle}
        onClose={close}
      />
    </Suspense>
  ) : null;

  return { open, close, view, openId: opened?.assignmentId ?? null };
}
