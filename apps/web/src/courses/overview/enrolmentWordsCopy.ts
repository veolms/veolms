import { useEffect } from "react";
import { writeSessionCache } from "../../lib/session-cache";
import { useAuthStore } from "../../store/auth.store";
import { COURSE_ENROLMENT_WORDS_SESSION_KEY_PREFIX } from "../../store/accountBrowserState";
import type { EnrolmentWords } from "./enrolmentDetails";

/**
 * Keeps what "Your enrollment" says in the tab's session storage, next to
 * the course's access answer it was drawn from (see
 * `services/accountSessionCopies.ts`), for the next load of the page.
 *
 * The page is built ahead of time for everyone, so a learner's band is
 * drawn before the page's scripts run by a script in the document's head,
 * from this tab's copies (`courseCardEarlyState`): the progress and where
 * to carry on come from the access answer itself, but the panel's words
 * need the app's formatting (money, dates, how long ago), so they are kept
 * as text, as last shown. The head uses them only while the access answer
 * they go with is still kept and says the course is the learner's.
 */
export function useKeptEnrolmentWords(
  courseKey: string,
  words: EnrolmentWords | null,
) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  useEffect(() => {
    if (!userId || !words) return;
    writeSessionCache(
      `${COURSE_ENROLMENT_WORDS_SESSION_KEY_PREFIX}${userId}:${courseKey}`,
      words,
    );
  }, [userId, courseKey, words]);
}
