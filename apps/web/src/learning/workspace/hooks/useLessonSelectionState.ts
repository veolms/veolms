import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { ShortcutPlatform } from "../../../keyboardShortcuts";
import { useShortcutPlatform } from "../../../useShortcutPlatform";
import { DEFAULT_LEARNING_PLAYER_PREFERENCES } from "../../learningPlayerPreferences";
import { getCourseTitle } from "../../courseMetadata";
import { consumeLessonAutoplayRequest } from "../../lessonAutoplayRequest";
import type { useCourseOverview } from "../../../services/courses";

export interface UseLessonSelectionStateArgs {
  courseSlug: string | undefined;
  deepLinkLessonUuid: string | null;
  lessonId: number;
  isApiRoute: boolean;
  courseOverview: ReturnType<typeof useCourseOverview>["data"];
  isCourseOverviewError: boolean;
}

export interface UseLessonSelectionStateResult {
  shortcutPlatform: ShortcutPlatform;
  selectedLesson: number;
  setSelectedLesson: Dispatch<SetStateAction<number>>;
  deepLinkInitializationPending: boolean;
  setDeepLinkInitializationPending: Dispatch<SetStateAction<boolean>>;
  pendingLessonSelectionRef: RefObject<number | null>;
  localLessonProgress: Record<number, number>;
  setLocalLessonProgress: Dispatch<SetStateAction<Record<number, number>>>;
  autoPlayOnLessonChange: boolean;
  setAutoPlayOnLessonChange: Dispatch<SetStateAction<boolean>>;
  autoplayEnabled: boolean;
  setAutoplayEnabled: Dispatch<SetStateAction<boolean>>;
  courseTitle: string;
  coursePersistenceKey: string;
  discussionPersistenceKey: string;
}

export function useLessonSelectionState({
  courseSlug,
  deepLinkLessonUuid,
  lessonId,
  isApiRoute,
  courseOverview,
  isCourseOverviewError,
}: UseLessonSelectionStateArgs): UseLessonSelectionStateResult {
  const shortcutPlatform = useShortcutPlatform();
  const [selectedLesson, setSelectedLesson] = useState(lessonId);
  const [deepLinkInitializationPending, setDeepLinkInitializationPending] =
    useState(Boolean(deepLinkLessonUuid));
  const pendingLessonSelectionRef = useRef<number | null>(null);
  const [localLessonProgress, setLocalLessonProgress] = useState<
    Record<number, number>
  >({});
  // Opened from the home's Enter, the lesson starts playing at once.
  const [autoPlayOnLessonChange, setAutoPlayOnLessonChange] = useState(() =>
    consumeLessonAutoplayRequest(courseSlug),
  );
  const [autoplayEnabled, setAutoplayEnabled] = useState(
    DEFAULT_LEARNING_PLAYER_PREFERENCES.autoplay,
  );
  const courseTitle = useMemo(() => {
    if (courseOverview?.course.title) {
      return courseOverview.course.title;
    }
    // A course that did not load has no name to show. The address's slug
    // used to stand in, and for a discussion link that is the course's id.
    if (isCourseOverviewError) {
      return "";
    }
    return isApiRoute ? courseSlug || "" : getCourseTitle(courseSlug);
  }, [
    courseOverview?.course.title,
    courseSlug,
    isApiRoute,
    isCourseOverviewError,
  ]);
  const coursePersistenceKey = encodeURIComponent(courseSlug || "default");
  const discussionPersistenceKey = `${coursePersistenceKey}-lesson-${selectedLesson}`;
  return {
    shortcutPlatform,
    selectedLesson,
    setSelectedLesson,
    deepLinkInitializationPending,
    setDeepLinkInitializationPending,
    pendingLessonSelectionRef,
    localLessonProgress,
    setLocalLessonProgress,
    autoPlayOnLessonChange,
    setAutoPlayOnLessonChange,
    autoplayEnabled,
    setAutoplayEnabled,
    courseTitle,
    coursePersistenceKey,
    discussionPersistenceKey,
  };
}
