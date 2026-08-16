export interface CourseVideo {
  fileName: string;
  duration: number;
  src: string;
}

export type LessonStatus = "done" | "active" | "todo";
export type Lesson = [number, string, string, LessonStatus];

export interface CourseSection {
  id: number;
  title: string;
  progress: string;
  lessons: Lesson[];
}

export const formatMediaTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours)
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

export function resolveCourseMediaBaseUrl(configuredBaseUrl?: string) {
  const normalizedBaseUrl = configuredBaseUrl?.trim().replace(/\/+$/, "");
  return normalizedBaseUrl
    ? `${normalizedBaseUrl}/course-videos`
    : "/course-videos";
}

export const courseMediaBaseUrl = resolveCourseMediaBaseUrl(
  import.meta.env.VITE_COURSE_MEDIA_BASE_URL,
);

export function resolveCourseVideoSrc(
  fileName: string,
  baseUrl = courseMediaBaseUrl,
) {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(fileName)}`;
}

const courseVideo = (fileName: string, duration: number): CourseVideo => ({
  fileName,
  duration,
  src: resolveCourseVideoSrc(fileName),
});

export const courseVideos: CourseVideo[] = [
  courseVideo("04 ui design system and storybook.mp4", 2090.61),
  courseVideo("00 welcome to the typescript course.mp4", 103.05),
  courseVideo("03 the idea of veolms.mp4", 699.94),
  courseVideo("02 Frontend Tech and UI Discussions.mp4", 4040.78),
  courseVideo("01 introduction to veolms.mp4", 553.74),
  courseVideo("03 creating velms respository.mp4", 8743),
  courseVideo("02 how to follow this course.mp4", 312.02),
  courseVideo("01 team introduction and product discussion.mp4", 11087.32),
];

const sourceLessonVideos = [
  courseVideos[4]!,
  courseVideos[1]!,
  courseVideos[7]!,
  courseVideos[0]!,
  courseVideos[5]!,
  courseVideos[2]!,
  courseVideos[6]!,
  courseVideos[3]!,
  courseVideos[0]!,
  courseVideos[2]!,
];

const repeatedSectionLessonCounts = [6, 7, 8, 5, 5];
const lessonMediaAssignments = [
  ...sourceLessonVideos,
  ...repeatedSectionLessonCounts.flatMap((count) =>
    sourceLessonVideos.slice(0, count),
  ),
];

export const lessonVideoMap: Record<number, CourseVideo | undefined> =
  Object.fromEntries(
    lessonMediaAssignments.map((video, index) => [index + 1, video]),
  );

const lesson = (
  number: number,
  title: string,
  status: LessonStatus,
): Lesson => [
  number,
  title,
  formatMediaTime(lessonVideoMap[number]!.duration),
  status,
];

const sourceLessonTitles = [
  "The Beginning of a Design Journey",
  "What is UI/UX Design?",
  "The Design Mindset",
  "Tools Overview",
  "Career Opportunities",
  "Understanding Your Users",
  "Research Methods",
  "Empathy Mapping",
  "Designing for Real Users",
  "Usability Testing",
];

const repeatedLessons = (startNumber: number, count: number): Lesson[] =>
  Array.from({ length: count }, (_, index) =>
    lesson(startNumber + index, sourceLessonTitles[index]!, "todo"),
  );

export const sections: CourseSection[] = [
  {
    id: 1,
    title: "Introduction",
    progress: "5/5",
    lessons: [
      lesson(1, "The Beginning of a Design Journey", "done"),
      lesson(2, "What is UI/UX Design?", "done"),
      lesson(3, "The Design Mindset", "done"),
      lesson(4, "Tools Overview", "done"),
      lesson(5, "Career Opportunities", "done"),
    ],
  },
  {
    id: 2,
    title: "User Research",
    progress: "4/6",
    lessons: [
      lesson(6, "Understanding Your Users", "done"),
      lesson(7, "Research Methods", "done"),
      lesson(8, "Empathy Mapping", "done"),
      lesson(9, "Designing for Real Users", "active"),
      lesson(10, "Usability Testing", "todo"),
    ],
  },
  {
    id: 3,
    title: "Information Architecture",
    progress: "0/6",
    lessons: repeatedLessons(11, 6),
  },
  {
    id: 4,
    title: "Wireframing",
    progress: "0/7",
    lessons: repeatedLessons(17, 7),
  },
  {
    id: 5,
    title: "Visual Design",
    progress: "0/8",
    lessons: repeatedLessons(24, 8),
  },
  {
    id: 6,
    title: "Prototyping",
    progress: "0/5",
    lessons: repeatedLessons(32, 5),
  },
  {
    id: 7,
    title: "Handoff & Beyond",
    progress: "0/5",
    lessons: repeatedLessons(37, 5),
  },
];

export const lessonsById = new Map<number, Lesson>(
  sections.flatMap((section) =>
    section.lessons.map((item): [number, Lesson] => [item[0], item]),
  ),
);
export const lessonSequence = [...lessonsById.keys()];

const slugifyLessonTitle = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "lecture";

const lessonSlugEntries = (() => {
  const usedSlugs = new Set<string>();

  return lessonSequence.map((lessonId): [number, string] => {
    const lessonTitle = lessonsById.get(lessonId)?.[1] || `Lecture ${lessonId}`;
    const baseSlug = slugifyLessonTitle(lessonTitle);
    const slug = usedSlugs.has(baseSlug) ? `${baseSlug}-${lessonId}` : baseSlug;
    usedSlugs.add(slug);
    return [lessonId, slug];
  });
})();

export const lessonSlugById = new Map<number, string>(lessonSlugEntries);
export const lessonIdBySlug = new Map<string, number>(
  lessonSlugEntries.map(([lessonId, slug]) => [slug, lessonId]),
);

export function getLessonSlug(lessonId: number): string {
  return lessonSlugById.get(lessonId) || lessonSlugById.get(1)!;
}

export function resolveLessonIdentifier(
  identifier: string | number | null | undefined,
): number | null {
  if (typeof identifier === "number")
    return lessonsById.has(identifier) ? identifier : null;
  if (!identifier) return null;

  const normalizedIdentifier = identifier.trim().toLowerCase();
  const slugMatch = lessonIdBySlug.get(normalizedIdentifier);
  if (slugMatch) return slugMatch;

  const idMatch = /^(?:lesson-|lecture-)?(\d+)$/.exec(normalizedIdentifier);
  if (!idMatch) return null;
  const lessonId = Number(idMatch[1]);
  return lessonsById.has(lessonId) ? lessonId : null;
}
