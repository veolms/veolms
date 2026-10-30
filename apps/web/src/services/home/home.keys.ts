export const homeKeys = {
  all: ["home"] as const,
  discovery: () => [...homeKeys.all, "discovery"] as const,
  guestPage: () => [...homeKeys.all, "guest-page"] as const,
  pageSettings: () => [...homeKeys.all, "page-settings"] as const,
  pageSettingsOptions: () => [...homeKeys.pageSettings(), "options"] as const,
  discussionList: () => [...homeKeys.pageSettings(), "discussions"] as const,
  lessonVideoOptions: (courseId: string) =>
    [...homeKeys.pageSettingsOptions(), "lesson-videos", courseId] as const,
};
