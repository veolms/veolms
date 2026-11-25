import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Button } from "../../components/Button";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { getApiError } from "../../lib/api-error";
import { useDocumentTitle } from "../../routing/useDocumentTitle";
import {
  useCodingPractice,
  useCoursePractice,
} from "../../services/coding-practice";
import { canStepBack, practicePath, returnPathOf } from "./practicePaths";
import { QuestionDrawer } from "./QuestionDrawer";

// The editor and runner are the heavy part: their own chunk, fetched ahead
// by the lecture and list pages while they are idle.
const CodingWorkspace = lazy(() =>
  import("../learner/CodingWorkspace").then((module) => ({
    default: module.CodingWorkspace,
  })),
);

function Waiting({ label }: { label: string }) {
  return (
    <div
      className="flex flex-1 items-center justify-center text-(--muted)"
      role="status"
      aria-label={label}
    >
      <LoadingSpinnerIcon size={26} />
    </div>
  );
}

/**
 * /practice/<course>/<question>: one question, full screen (coding needs
 * the room, on a phone too). Its own address: a reload or a shared link
 * opens the same question. Back returns to the page the learner came from
 * (a lecture, the list), or to the course's list.
 */
export function PracticeQuestionPage() {
  const { courseSlug = "", questionId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = returnPathOf(location.state);
  // ?preview=1: staff try the newest version (from the question editor).
  const [search] = useSearchParams();
  const practice = useCodingPractice(questionId, {
    preview: search.get("preview") === "1",
  });
  const courseId = practice.data?.assignment.courseId ?? null;
  const list = useCoursePractice(courseId);
  const [listOpen, setListOpen] = useState(false);
  useDocumentTitle(
    practice.data
      ? `${practice.data.exercise.title} · Coding practice`
      : "Coding practice",
  );

  // The page under the question must not scroll with it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Back steps back only onto the page the question was opened from; a
  // shared link, a new tab or an older lecture link opens that page (or the
  // course's list) instead, so Back never leaves the site or loops.
  const close = useCallback(() => {
    if (canStepBack(location.state)) navigate(-1);
    else navigate(returnPath ?? practicePath(courseSlug), { replace: true });
  }, [courseSlug, location.state, navigate, returnPath]);

  const items = useMemo(() => list.data ?? [], [list.data]);
  const index = items.findIndex((item) => item.assignmentId === questionId);
  const go = useCallback(
    (assignmentId: string) =>
      navigate(practicePath(courseSlug, assignmentId), {
        // The way back stays where the learner came from.
        replace: true,
        state: location.state,
      }),
    [courseSlug, location.state, navigate],
  );
  const previous = index > 0 ? items[index - 1] : undefined;
  const next =
    index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;

  let body;
  if (practice.isLoading) body = <Waiting label="Opening the question" />;
  else if (practice.error || !practice.data) {
    const error = getApiError(practice.error);
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-md text-sm text-(--text-secondary)">
          {error.status === 401
            ? "Sign in to practise."
            : error.status === 404
              ? "This question is not available any more."
              : error.status === 403
                ? error.message
                : error.message}
        </p>
        <Button variant="quiet" elevation="flat" onClick={close}>
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Back
        </Button>
      </div>
    );
  } else {
    body = (
      <Suspense fallback={<Waiting label="Opening the editor" />}>
        <CodingWorkspace
          // A new version (after "Reload") or another question starts fresh.
          key={`${practice.data.assignment.id}:${practice.data.exercise.versionId}`}
          lesson={practice.data}
          context={`Practice · ${practice.data.assignment.lessonTitle ?? "Course"}`}
          onPassed={() => {}}
          onContinue={next ? () => go(next.assignmentId) : undefined}
          onReload={() => void practice.refetch()}
          fill
          onClose={close}
          nav={
            items.length
              ? {
                  position: index >= 0 ? `${index + 1} / ${items.length}` : "",
                  onPrevious: previous
                    ? () => go(previous.assignmentId)
                    : undefined,
                  onNext: next ? () => go(next.assignmentId) : undefined,
                  onOpenList: () => setListOpen(true),
                }
              : undefined
          }
        />
      </Suspense>
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Practice: ${practice.data?.exercise.title ?? "question"}`}
      className="fixed inset-0 z-[1200] flex flex-col bg-(--canvas) pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      {body}
      {listOpen ? (
        <QuestionDrawer
          items={items}
          currentId={questionId}
          onPick={(assignmentId) => {
            setListOpen(false);
            if (assignmentId !== questionId) go(assignmentId);
          }}
          onClose={() => setListOpen(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
