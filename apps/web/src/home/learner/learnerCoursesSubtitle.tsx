/**
 * The line under "My Courses". It says "Start" to a learner who has begun
 * nothing and "Continue" to one who has, which is only known once their
 * courses have been loaded.
 *
 * So that the line is there from the first paint, with the right word, the
 * browser remembers which one this learner was last shown. A script in the
 * document's head copies that onto the root element before anything is
 * drawn, and until the courses answer the line is chosen in CSS from there:
 * the same markup wherever it is rendered, a page built ahead of time
 * included.
 */
const STARTED_KEY = "veolms-learner-started";
const STARTED_ATTRIBUTE = "data-learner-started";

const START_LINE = "Start learning from your enrolled courses.";
const CONTINUE_LINE = "Continue learning from your enrolled courses.";

/** Runs from the document's head (see `root.tsx`). */
export const getLearnerStartedBootstrapScript = () =>
  `(()=>{try{if(localStorage.getItem("${STARTED_KEY}")==="1")document.documentElement.setAttribute("${STARTED_ATTRIBUTE}","")}catch{}})();`;

/** Keeps what the courses said for the next time the page is opened. */
export function rememberLearnerStarted(started: boolean) {
  document.documentElement.toggleAttribute(STARTED_ATTRIBUTE, started);
  try {
    if (started) window.localStorage.setItem(STARTED_KEY, "1");
    else window.localStorage.removeItem(STARTED_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

export function LearnerCoursesSubtitle({
  started,
}: {
  /** Whether the learner has begun a course; left out until that is known. */
  started?: boolean;
}) {
  if (started !== undefined) return started ? CONTINUE_LINE : START_LINE;
  return (
    <>
      <span className="[:root[data-learner-started]_&]:hidden">
        {START_LINE}
      </span>
      <span className="hidden [:root[data-learner-started]_&]:inline">
        {CONTINUE_LINE}
      </span>
    </>
  );
}
