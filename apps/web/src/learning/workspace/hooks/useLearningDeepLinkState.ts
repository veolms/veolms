import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  getRightPanelShortcutLabel,
  type ShortcutPlatform,
} from "../../../keyboardShortcuts";
import { getLessonReading } from "../../lessonWithoutVideo";
import type { useCourseOverview } from "../../../services/courses";
import type { CourseLesson } from "@veolms/contracts";

export interface UseLearningDeepLinkStateArgs {
  deepLinkLessonUuid: string | null;
  deepLinkRouteSettled: boolean;
  isDiscussionDeepLink: boolean;
  lessonId: number;
  courseOverview: ReturnType<typeof useCourseOverview>["data"];
  isCourseOverviewError: boolean;
  isCourseOverviewFetching: boolean;
  isInteractionCapabilitiesLoading: boolean;
  shortcutPlatform: ShortcutPlatform;
  selectedLesson: number;
  deepLinkInitializationPending: boolean;
  setDeepLinkInitializationPending: Dispatch<SetStateAction<boolean>>;
  stageLesson: CourseLesson | undefined;
}

export interface UseLearningDeepLinkStateResult {
  selectedLessonRecord: CourseLesson | null;
  selectedLessonDescription: string | null;
  selectedLessonReading: string | null;
  courseId: string | undefined;
  backendLessonId: string | undefined;
  isLearningDeepLinkReady: boolean;
  isLearningDeepLinkError: boolean;
  isLearningBootstrapLoading: boolean;
  curriculumShortcutLabel: ReturnType<typeof getRightPanelShortcutLabel>;
}

export function useLearningDeepLinkState({
  deepLinkLessonUuid,
  deepLinkRouteSettled,
  isDiscussionDeepLink,
  lessonId,
  courseOverview,
  isCourseOverviewError,
  isCourseOverviewFetching,
  isInteractionCapabilitiesLoading,
  shortcutPlatform,
  selectedLesson,
  deepLinkInitializationPending,
  setDeepLinkInitializationPending,
  stageLesson,
}: UseLearningDeepLinkStateArgs): UseLearningDeepLinkStateResult {
  const selectedLessonRecord = stageLesson ?? null;
  const selectedLessonDescription = selectedLessonRecord?.description ?? null;
  const selectedLessonReading = getLessonReading(selectedLessonRecord);
  const courseId = courseOverview?.course.id;
  const backendLessonId = selectedLessonRecord?.id;
  const isLearningDeepLinkReady =
    !isDiscussionDeepLink ||
    Boolean(
      deepLinkRouteSettled &&
      !deepLinkInitializationPending &&
      courseId &&
      backendLessonId &&
      selectedLesson === lessonId,
    );
  const isLearningDeepLinkError =
    isDiscussionDeepLink &&
    isCourseOverviewError &&
    !isCourseOverviewFetching &&
    !courseOverview;
  const isLearningBootstrapLoading =
    isInteractionCapabilitiesLoading ||
    (!isLearningDeepLinkReady && !isLearningDeepLinkError);
  useEffect(() => {
    if (deepLinkLessonUuid) {
      setDeepLinkInitializationPending(true);
    }
  }, [deepLinkLessonUuid, setDeepLinkInitializationPending]);

  useEffect(() => {
    if (
      !deepLinkInitializationPending ||
      !deepLinkRouteSettled ||
      !courseId ||
      !backendLessonId ||
      selectedLesson !== lessonId
    ) {
      return;
    }
    setDeepLinkInitializationPending(false);
  }, [
    backendLessonId,
    courseId,
    deepLinkRouteSettled,
    lessonId,
    selectedLesson,
    deepLinkInitializationPending,
    setDeepLinkInitializationPending,
  ]);
  const curriculumShortcutLabel = getRightPanelShortcutLabel(shortcutPlatform);
  return {
    selectedLessonRecord,
    selectedLessonDescription,
    selectedLessonReading,
    courseId,
    backendLessonId,
    isLearningDeepLinkReady,
    isLearningDeepLinkError,
    isLearningBootstrapLoading,
    curriculumShortcutLabel,
  };
}
