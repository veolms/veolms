import { lazy, Suspense } from "react";
import type { LessonPracticePanelProps } from "./LessonPracticePanel";

const Panel = lazy(() => import("./LessonPracticePanel"));

/**
 * A lecture's Practice tab, loaded only when it is opened: the question
 * editor (CodeMirror, the runner) is never in the course editor's first
 * bundle.
 */
export function LessonPracticePanelLazy(props: LessonPracticePanelProps) {
  return (
    <Suspense
      fallback={
        <div
          className="h-24 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
          aria-hidden="true"
        />
      }
    >
      <Panel {...props} />
    </Suspense>
  );
}
