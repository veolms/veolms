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
