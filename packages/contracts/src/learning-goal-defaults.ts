/**
 * The daily goal of a learner who has not chosen one, in minutes. The API
 * answers with it wherever nothing is stored, so the home page, the
 * settings and the week's target all agree on it.
 *
 * Kept apart from the schemas (learning-goals.ts) so the web app can read
 * it without bringing the schema library into a page that does not need it.
 */
export const DEFAULT_DAILY_GOAL_MINUTES = 60;
