import {
  CURRICULUM_LECTURE_COUNT_DEFAULT,
  CURRICULUM_LECTURE_COUNT_MAX,
  CURRICULUM_SECTION_COUNT_DEFAULT,
  normalizeCurriculumSize,
} from "./curriculumSize";

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

export function resolveCourseHlsBaseUrl(configuredBaseUrl?: string) {
  const normalizedBaseUrl = configuredBaseUrl?.trim().replace(/\/+$/, "");
  return normalizedBaseUrl ? `${normalizedBaseUrl}/course-hls` : "/course-hls";
}

export const courseHlsBaseUrl = resolveCourseHlsBaseUrl();

export function getCourseVideoHlsSlug(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveCourseHlsSrc(
  fileName: string,
  baseUrl = courseHlsBaseUrl,
) {
  return `${baseUrl.replace(/\/+$/, "")}/${getCourseVideoHlsSlug(fileName)}/master.m3u8`;
}

const courseVideo = (fileName: string, duration: number): CourseVideo => ({
  fileName,
  duration,
  src: resolveCourseHlsSrc(fileName),
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
const preservedLessonMediaAssignments = [
  ...sourceLessonVideos,
  ...repeatedSectionLessonCounts.flatMap((count) =>
    sourceLessonVideos.slice(0, count),
  ),
];

export const totalCourseLectures = CURRICULUM_LECTURE_COUNT_DEFAULT;

const lessonMediaAssignments = [
  ...preservedLessonMediaAssignments,
  ...Array.from(
    { length: totalCourseLectures - preservedLessonMediaAssignments.length },
    (_, index) => sourceLessonVideos[index % sourceLessonVideos.length]!,
  ),
];

export const lessonVideoMap: Record<number, CourseVideo | undefined> =
  Object.fromEntries(
    lessonMediaAssignments.map((video, index) => [index + 1, video]),
  );

export const getCourseVideoForLesson = (lessonNumber: number): CourseVideo => {
  const normalizedLessonNumber = Math.max(1, Math.round(lessonNumber));
  return (
    lessonMediaAssignments[normalizedLessonNumber - 1] ??
    sourceLessonVideos[
      (normalizedLessonNumber - 1) % sourceLessonVideos.length
    ]!
  );
};

const lesson = (
  number: number,
  title: string,
  status: LessonStatus,
): Lesson => [
  number,
  title,
  formatMediaTime(getCourseVideoForLesson(number).duration),
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

const coreSections: CourseSection[] = [
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

const advancedSectionTitles = [
  "Node.js Foundations",
  "Package Management and Modules",
  "Async JavaScript Patterns",
  "Express Essentials",
  "REST API Design",
  "MongoDB Integration",
  "SQL and Data Modeling",
  "Authentication and Authorization",
  "Validation and Error Handling",
  "Testing Node.js Applications",
  "Caching and Queues",
  "File Uploads and Media",
  "Observability and Performance",
  "Security Hardening",
  "Deployment and DevOps",
  "Capstone Production API",
] as const;

const advancedLessonTopics = [
  "Runtime and Event Loop",
  "Modules and Packages",
  "Async Control Flow",
  "HTTP Fundamentals",
  "Express Routing",
  "Middleware Design",
  "API Validation",
  "Database Integration",
  "Authentication",
  "Testing and Debugging",
] as const;

const coreLessonsById = new Map<number, Lesson>(
  coreSections.flatMap((section) =>
    section.lessons.map((item): [number, Lesson] => [item[0], item]),
  ),
);

const getCurriculumSectionLessonCounts = (
  sectionCount: number,
  lectureCount: number,
) => {
  const counts = Array.from({ length: sectionCount }, () => 0);
  let remainingLectures = lectureCount;
  const preservedSectionCount = Math.min(coreSections.length, sectionCount);

  for (let index = 0; index < preservedSectionCount; index += 1) {
    const preferredCount = coreSections[index]!.lessons.length;
    const nextCount = Math.min(preferredCount, remainingLectures);
    counts[index] = nextCount;
    remainingLectures -= nextCount;
  }

  const generatedSectionCount = sectionCount - preservedSectionCount;
  if (generatedSectionCount > 0) {
    const baseCount = Math.floor(remainingLectures / generatedSectionCount);
    const largerSectionCount = remainingLectures % generatedSectionCount;
    for (let index = 0; index < generatedSectionCount; index += 1) {
      counts[preservedSectionCount + index] =
        baseCount + (index < largerSectionCount ? 1 : 0);
    }
  } else if (remainingLectures > 0) {
    counts[sectionCount - 1] =
      (counts[sectionCount - 1] ?? 0) + remainingLectures;
  }

  return counts;
};

const getGeneratedSectionTitle = (sectionIndex: number) => {
  if (sectionIndex < coreSections.length) {
    return coreSections[sectionIndex]!.title;
  }
  return (
    advancedSectionTitles[sectionIndex - coreSections.length] ??
    `Load Test Section ${sectionIndex + 1}`
  );
};

export const createCurriculumSections = (
  requestedSectionCount: number,
  requestedLectureCount: number,
): CourseSection[] => {
  const { sectionCount, lectureCount } = normalizeCurriculumSize({
    sectionCount: requestedSectionCount,
    lectureCount: requestedLectureCount,
  });
  const lessonCounts = getCurriculumSectionLessonCounts(
    sectionCount,
    lectureCount,
  );
  let nextLessonNumber = 1;

  return lessonCounts.map((lessonCount, sectionIndex) => {
    const lessons = Array.from({ length: lessonCount }, (_, lessonIndex) => {
      const lessonNumber = nextLessonNumber;
      nextLessonNumber += 1;
      const preservedLesson = coreLessonsById.get(lessonNumber);
      if (preservedLesson) return [...preservedLesson] as Lesson;

      const topic =
        advancedLessonTopics[lessonIndex % advancedLessonTopics.length]!;
      return lesson(
        lessonNumber,
        `${topic} ${Math.floor(lessonIndex / advancedLessonTopics.length) + 1}`,
        "todo",
      );
    });
    const preservedSection = coreSections[sectionIndex];
    const completedCount = lessons.filter(
      ([, , , status]) => status === "done",
    ).length;

    return {
      id: sectionIndex + 1,
      title: getGeneratedSectionTitle(sectionIndex),
      progress:
        preservedSection && lessonCount === preservedSection.lessons.length
          ? preservedSection.progress
          : `${completedCount}/${lessonCount}`,
      lessons,
    };
  });
};

export const createLessonsById = (courseSections: readonly CourseSection[]) =>
  new Map<number, Lesson>(
    courseSections.flatMap((section) =>
      section.lessons.map((item): [number, Lesson] => [item[0], item]),
    ),
  );

export const sections: CourseSection[] = createCurriculumSections(
  CURRICULUM_SECTION_COUNT_DEFAULT,
  totalCourseLectures,
);

export const lessonsById = createLessonsById(sections);
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
  if (lessonSlugById.has(lessonId)) return lessonSlugById.get(lessonId)!;
  if (
    Number.isInteger(lessonId) &&
    lessonId > 0 &&
    lessonId <= CURRICULUM_LECTURE_COUNT_MAX
  ) {
    return `lecture-${lessonId}`;
  }
  return lessonSlugById.get(1)!;
}

export function resolveLessonIdentifier(
  identifier: string | number | null | undefined,
): number | null {
  if (typeof identifier === "number")
    return Number.isInteger(identifier) &&
      identifier > 0 &&
      identifier <= CURRICULUM_LECTURE_COUNT_MAX
      ? identifier
      : null;
  if (!identifier) return null;

  const normalizedIdentifier = identifier.trim().toLowerCase();
  const slugMatch = lessonIdBySlug.get(normalizedIdentifier);
  if (slugMatch) return slugMatch;

  const idMatch = /^(?:lesson-|lecture-)?(\d+)$/.exec(normalizedIdentifier);
  if (!idMatch) return null;
  const lessonId = Number(idMatch[1]);
  return lessonId > 0 && lessonId <= CURRICULUM_LECTURE_COUNT_MAX
    ? lessonId
    : null;
}
