import { LEARNING_DESKTOP_MINIMIZE_MEDIA_QUERY } from "../player/learningPlayerMotion";
import {
  layoutQuery,
  layoutQueryMatches,
  watchLayoutQuery,
} from "../../shell/phoneVideoFullscreenHold";
import {
  COURSE_CONTENT_DRAWER_QUERY,
  PHONE_LESSON_DRAWER_QUERY,
} from "./workspaceConstants";

export const subscribeToCourseContentDrawerViewport = (
  onStoreChange: () => void,
) => {
  // Held while a phone plays a video full screen sideways (see
  // phoneVideoFullscreenHold).
  return watchLayoutQuery(
    layoutQuery(COURSE_CONTENT_DRAWER_QUERY),
    onStoreChange,
  );
};

export const getCourseContentDrawerViewportSnapshot = () =>
  layoutQueryMatches(layoutQuery(COURSE_CONTENT_DRAWER_QUERY));

export const getCourseContentDrawerViewportServerSnapshot = () => false;

export const subscribeToPhoneLessonDrawerViewport = (
  onStoreChange: () => void,
) => {
  // Held while a phone plays a video full screen sideways (see
  // phoneVideoFullscreenHold).
  return watchLayoutQuery(
    layoutQuery(PHONE_LESSON_DRAWER_QUERY),
    onStoreChange,
  );
};

export const getPhoneLessonDrawerViewportSnapshot = () =>
  layoutQueryMatches(layoutQuery(PHONE_LESSON_DRAWER_QUERY));

export const getPhoneLessonDrawerViewportServerSnapshot = () => false;

export const subscribeToDesktopLearningMinimizeViewport = (
  onStoreChange: () => void,
) => {
  // Held while a phone plays a video full screen sideways (see
  // phoneVideoFullscreenHold).
  return watchLayoutQuery(
    layoutQuery(LEARNING_DESKTOP_MINIMIZE_MEDIA_QUERY),
    onStoreChange,
  );
};

export const getDesktopLearningMinimizeViewportSnapshot = () =>
  layoutQueryMatches(layoutQuery(LEARNING_DESKTOP_MINIMIZE_MEDIA_QUERY));

export const getDesktopLearningMinimizeViewportServerSnapshot = () => false;
