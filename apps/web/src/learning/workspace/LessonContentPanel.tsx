import type { RefObject, JSX } from "react";
import {
  Discussion,
  type InteractionCapabilities,
  type LessonContentAccessState,
  type LessonParticipationState,
} from "../Discussion";

export interface LessonContentPanelProps {
  lessonContentRef: RefObject<HTMLElement | null>;
  desktopLearningMinimizeViewport: boolean;
  courseUnavailable: "not-found" | "failed" | "no-lessons" | null;
  phoneLessonDrawerViewport: boolean;
  lessonHeader: (contained?: boolean, titleLoading?: boolean) => JSX.Element;
  isLearningBootstrapLoading: boolean;
  isLearningDeepLinkReady: boolean;
  discussionPersistenceKey: string;
  courseSlug: string | undefined;
  courseId: string | undefined;
  /** Who created the course: they moderate its discussion. */
  courseCreatorId: string | null | undefined;
  backendLessonId: string | undefined;
  noteDeepLinkId: string | null;
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
  selectedLessonReading: string | null;
  selectedLessonDescription: string | null;
  isApiRoute: boolean;
  isCourseOverviewLoading: boolean;
  isLessonDescriptionPending: boolean;
  interactionCapabilities: InteractionCapabilities;
  lessonContentAccess: LessonContentAccessState;
  lessonContentAccessReason: "access" | "login" | null;
  canParticipateInLessonDiscussion: boolean;
  lessonParticipationState: LessonParticipationState;
  isAuthenticated: boolean;
  onOpenCourseOverview: () => void;
  onOpenLogin: () => void;
  seekCurrentLessonToTimestamp: (seconds: number) => void;
  isLearningDeepLinkError: boolean;
  refetchCourseOverview: () => Promise<unknown>;
}

export function LessonContentPanel({
  lessonContentRef,
  desktopLearningMinimizeViewport,
  courseUnavailable,
  phoneLessonDrawerViewport,
  lessonHeader,
  isLearningBootstrapLoading,
  isLearningDeepLinkReady,
  discussionPersistenceKey,
  courseSlug,
  courseId,
  courseCreatorId,
  backendLessonId,
  noteDeepLinkId,
  mobileBottomNavigation,
  mobileBottomNavigationHidden,
  selectedLessonReading,
  selectedLessonDescription,
  isApiRoute,
  isCourseOverviewLoading,
  isLessonDescriptionPending,
  interactionCapabilities,
  lessonContentAccess,
  lessonContentAccessReason,
  canParticipateInLessonDiscussion,
  lessonParticipationState,
  isAuthenticated,
  onOpenCourseOverview,
  onOpenLogin,
  seekCurrentLessonToTimestamp,
  isLearningDeepLinkError,
  refetchCourseOverview,
}: LessonContentPanelProps) {
  // prettier-ignore
  return (
    <div className="learning-workspace__lesson-content-clip">
      <article
        ref={lessonContentRef}
        className="learning-workspace__lesson-content"
        data-discussion-panel-anchor=""
        data-learning-lesson-content=""
        aria-labelledby="learning-lesson-title"
        style={
          desktopLearningMinimizeViewport
            ? undefined
            : {
                opacity: "var(--learning-player-content-opacity, 1)",
                transform:
                  "translate3d(0, var(--learning-player-content-offset-y, 0px), 0)",
                transition:
                  "transform var(--learning-player-content-motion-duration, 0ms) cubic-bezier(0.16, 1, 0.3, 1), opacity var(--learning-player-content-motion-duration, 0ms) cubic-bezier(0.16, 1, 0.3, 1)",
              }
        }
      >
        {!courseUnavailable &&
          !phoneLessonDrawerViewport &&
          lessonHeader(false, isLearningBootstrapLoading)}
        {courseUnavailable ? null : isLearningDeepLinkReady ||
          isLearningBootstrapLoading ? (
          <Discussion
            key={discussionPersistenceKey}
            persistenceKey={discussionPersistenceKey}
            courseSlug={courseSlug}
            courseId={courseId}
            courseCreatorId={courseCreatorId}
            lessonId={backendLessonId}
            noteDeepLinkId={noteDeepLinkId}
            isThreadDeepLinkReady={isLearningDeepLinkReady}
            mobileBottomNavigation={mobileBottomNavigation}
            mobileBottomNavigationHidden={mobileBottomNavigationHidden}
            mobileLessonHeader={lessonHeader(
              true,
              isLearningBootstrapLoading,
            )}
            // A reading is shown in the player; the card under it
            // would say the same text a second time.
            lessonDescription={
              selectedLessonReading ? null : selectedLessonDescription
            }
            isLessonDescriptionLoading={
              (isApiRoute && isCourseOverviewLoading) ||
              isLessonDescriptionPending ||
              isLearningBootstrapLoading
            }
            interactionCapabilities={interactionCapabilities}
            isInteractionCapabilitiesLoading={isLearningBootstrapLoading}
            lessonContentAccess={lessonContentAccess}
            lessonContentAccessReason={lessonContentAccessReason}
            canParticipate={canParticipateInLessonDiscussion}
            participationState={lessonParticipationState}
            participationActionLabel={
              isAuthenticated ? "Get access" : "Log in"
            }
            onParticipationAction={
              isAuthenticated ? onOpenCourseOverview : onOpenLogin
            }
            loginToParticipate={!isAuthenticated}
            onSeekToTimestamp={seekCurrentLessonToTimestamp}
          />
        ) : isLearningDeepLinkError ? (
          <div>
            {phoneLessonDrawerViewport &&
              lessonHeader(true, isLearningBootstrapLoading)}
            <div
              className="py-12 text-center"
              data-testid="learning-discussion-error"
            >
              <p className="font-semibold text-(--text)">
                Failed to load discussion
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-(--muted)">
                There was a problem loading the course for this
                discussion.
              </p>
              <button
                type="button"
                onClick={() => void refetchCourseOverview()}
                className="mt-3 inline-flex items-center rounded-lg bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover)"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div>
            {phoneLessonDrawerViewport &&
              lessonHeader(true, isLearningBootstrapLoading)}
            <div
              className="flex min-h-48 flex-col items-center justify-center py-12 text-sm text-(--text-secondary)"
              data-testid="learning-discussion-loading"
              role="status"
              aria-label="Loading discussion"
            >
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
