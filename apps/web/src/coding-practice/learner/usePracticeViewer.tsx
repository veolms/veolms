import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { prefetchCodingPractice } from "../../services/coding-practice";

const loadPracticeView = () => import("./PracticeView");
const PracticeView = lazy(loadPracticeView);

/**
 * Downloads the practice screen's code (the editor and runner included)
 * before it is opened, so a tap on Practice shows it at once. The module is
 * fetched once; later calls reuse it.
 */
export function preloadPracticeView(): void {
  void loadPracticeView().catch(() => undefined);
}

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
/** The open practice in the address (`?practice=<assignment id>`). */
const PRACTICE_PARAM = "practice";

/** The practice the address asks for, if any. */
export function practiceInAddress(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(PRACTICE_PARAM);
}

/** This page's address with (or without) the open practice. */
function addressWith(assignmentId: string | null): string {
  const url = new URL(window.location.href);
  if (assignmentId) url.searchParams.set(PRACTICE_PARAM, assignmentId);
  else url.searchParams.delete(PRACTICE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

const markOf = (state: unknown) =>
  (state as Record<string, unknown> | null)?.[HISTORY_MARK];

/** The history state below an open practice: no mark of ours in it. */
function stateWithoutMark(): Record<string, unknown> {
  const { [HISTORY_MARK]: _mark, ...below } =
    (window.history.state as Record<string, unknown> | null) ?? {};
  return below;
}

/**
 * Opens one practice question full screen. It adds one history entry with
 * the question in the address (`?practice=<id>`), so the browser's or
 * phone's Back closes it, and a reload, or the address sent to someone,
 * opens the same question again (24 Nov 2026: the address stayed the
 * lecture's, and a reload showed the video).
 */
export function usePracticeViewer() {
  const queryClient = useQueryClient();
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

  /**
   * `fromAddress`: the address already names this question (a reload, a
   * shared link). The entry is made the lecture's again and the question
   * is added above it, so Back still lands on the lecture.
   */
  const open = useCallback(
    (
      assignmentId: string,
      contextTitle: string,
      options: { fromAddress?: boolean } = {},
    ) => {
      // The question loads alongside the screen's code, not after it.
      prefetchCodingPractice(queryClient, assignmentId);
      const mark = `${assignmentId}:${Date.now()}`;
      const below = stateWithoutMark();
      if (options.fromAddress || markOf(window.history.state) !== undefined) {
        // Drop an old mark (and the question) from the entry underneath,
        // so stepping back to it reads as "closed".
        window.history.replaceState(below, "", addressWith(null));
      }
      window.history.pushState(
        { ...below, [HISTORY_MARK]: mark },
        "",
        addressWith(assignmentId),
      );
      token.current = mark;
      setOpened({ assignmentId, contextTitle });
    },
    [queryClient],
  );

  const close = useCallback(() => {
    if (token.current && markOf(window.history.state) === token.current)
      window.history.back();
    else {
      token.current = null;
      if (practiceInAddress()) {
        window.history.replaceState(stateWithoutMark(), "", addressWith(null));
      }
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
