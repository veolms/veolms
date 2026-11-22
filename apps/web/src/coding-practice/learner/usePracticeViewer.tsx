import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";

const PracticeView = lazy(() => import("./PracticeView"));

/**
 * The practice screen's own backdrop and spinner, shown while its code (the
 * editor included) downloads: without it a tap on Start closed the picker
 * and showed nothing for a second or two.
 */
function OpeningPractice() {
  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-(--canvas) text-(--muted)"
      role="status"
      aria-label="Opening practice"
    >
      <LoadingSpinnerIcon size={26} />
    </div>,
    document.body,
  );
}

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

  // Each opening marks its history entry with a token of its own. A mark
  // left from before a reload (the browser keeps history state across one)
  // or from another opening is not ours: Back must still close the view
  // (22 Nov 2026: after a refresh, Back stepped onto the old marked entry
  // and the practice stayed open).
  const token = useRef<string | null>(null);
  const markOf = (state: unknown) =>
    (state as Record<string, unknown> | null)?.[HISTORY_MARK];

  useEffect(() => {
    if (!opened) return undefined;
    const onPop = (event: PopStateEvent) => {
      if (markOf(event.state) !== token.current) {
        token.current = null;
        setOpened(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [opened]);

  const open = useCallback((assignmentId: string, contextTitle: string) => {
    const mark = `${assignmentId}:${Date.now()}`;
    // Drop an old mark from the entry underneath, so stepping back to it
    // reads as "closed".
    const { [HISTORY_MARK]: _old, ...below } =
      (window.history.state as Record<string, unknown> | null) ?? {};
    if (_old !== undefined) window.history.replaceState(below, "");
    window.history.pushState({ ...below, [HISTORY_MARK]: mark }, "");
    token.current = mark;
    setOpened({ assignmentId, contextTitle });
  }, []);

  const close = useCallback(() => {
    if (token.current && markOf(window.history.state) === token.current)
      window.history.back();
    else {
      token.current = null;
      setOpened(null);
    }
  }, []);

  const view = opened ? (
    <Suspense fallback={<OpeningPractice />}>
      <PracticeView
        assignmentId={opened.assignmentId}
        lectureTitle={opened.contextTitle}
        onClose={close}
      />
    </Suspense>
  ) : null;

  return { open, close, view, openId: opened?.assignmentId ?? null };
}
