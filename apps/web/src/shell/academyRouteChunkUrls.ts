import {
  CATALOGUE_CSS_URLS_PLACEHOLDER,
  CATALOGUE_JS_URLS_PLACEHOLDER,
  COURSE_OVERVIEW_CSS_URLS_PLACEHOLDER,
  COURSE_OVERVIEW_JS_URLS_PLACEHOLDER,
  GUEST_HOME_CSS_URLS_PLACEHOLDER,
  GUEST_HOME_JS_URLS_PLACEHOLDER,
  splitChunkCssUrls,
} from "../routing/routeChunkPreloads";

// Resolved at module scope: the placeholders are replaced with literal URL
// lists at build time, so these arrays are constants.
export const GUEST_HOME_CSS_URLS = splitChunkCssUrls(
  GUEST_HOME_CSS_URLS_PLACEHOLDER,
);
export const CATALOGUE_CSS_URLS = splitChunkCssUrls(
  CATALOGUE_CSS_URLS_PLACEHOLDER,
);
export const GUEST_HOME_JS_URLS = splitChunkCssUrls(
  GUEST_HOME_JS_URLS_PLACEHOLDER,
);
export const CATALOGUE_JS_URLS = splitChunkCssUrls(
  CATALOGUE_JS_URLS_PLACEHOLDER,
);
export const COURSE_OVERVIEW_CSS_URLS = splitChunkCssUrls(
  COURSE_OVERVIEW_CSS_URLS_PLACEHOLDER,
);
export const COURSE_OVERVIEW_JS_URLS = splitChunkCssUrls(
  COURSE_OVERVIEW_JS_URLS_PLACEHOLDER,
);
