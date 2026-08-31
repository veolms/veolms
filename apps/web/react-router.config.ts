import type { Config } from "@react-router/dev/config";

const publicCourseSlugs = [
  "backend-nodejs",
  "typescript-course",
  "ui-ux-design-mastery",
  "mongodb-database-design",
] as const;

const coreLessonSlugs = [
  "the-beginning-of-a-design-journey",
  "what-is-ui-ux-design",
  "the-design-mindset",
  "tools-overview",
  "career-opportunities",
  "understanding-your-users",
  "research-methods",
  "empathy-mapping",
  "designing-for-real-users",
  "usability-testing",
] as const;

const prerenderedLearningPaths = publicCourseSlugs.flatMap((courseSlug) => [
  `/learn/${courseSlug}`,
  ...coreLessonSlugs.map((lessonSlug) => `/learn/${courseSlug}/${lessonSlug}`),
]);

export default {
  appDirectory: "src",
  prerender: {
    paths: prerenderedLearningPaths,
    concurrency: 1,
  },
  routeDiscovery: { mode: "initial" },
  ssr: false,
} satisfies Config;
