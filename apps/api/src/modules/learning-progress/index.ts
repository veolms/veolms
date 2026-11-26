// Public entry point of the learning-progress module for other modules.
//
// Only what the courses module needs is exported here. The main service
// (`learning-progress.service.ts`) reads the curriculum through the courses
// module; exporting it from this file would make courses and learning
// progress import each other.
export {
  createLessonProgressResetService,
  type LessonProgressResetService,
} from "./lesson-progress-reset.service.ts";
// Used by the media module's playback bootstrap.
export {
  createLessonPositionReader,
  type LessonPositionReader,
} from "./lesson-position.service.ts";
// Used by coding practice: practice time and solved questions count into the day.
export {
  createLearningActivityCredit,
  type LearningActivityCredit,
} from "./learning-activity-credit.service.ts";
// Used by course certificates: the share of a course's lessons finished.
export {
  createCourseCompletionReader,
  type CourseCompletion,
  type CourseCompletionReader,
} from "./course-completion.service.ts";
