/**
 * A course's creator and an admin are shown every lesson of a course,
 * unpublished ones included, and lessons are numbered through all of them.
 * When such an account switches to its Student view, the web app sends this
 * header (value `LEARNER_VIEW_HEADER_VALUE`) so that the API answers as it
 * would for a learner instead: published lessons only, numbered as a learner
 * sees them.
 *
 * The header can only narrow what a viewer is shown. It grants nothing, and
 * it has no effect on what an account may do or open.
 */
export const LEARNER_VIEW_HEADER = "x-learner-view";
export const LEARNER_VIEW_HEADER_VALUE = "1";
