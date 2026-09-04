import nodeThumbnail from "../assets/course-thumbnails/nodejs-960.webp";
import javascriptThumbnail from "../assets/course-thumbnails/javascript-960.webp";
import typescriptThumbnail from "../assets/course-thumbnails/typescript-960.webp";
import figmaThumbnail from "../assets/course-thumbnails/figma-960.webp";
import mongodbThumbnail from "../assets/course-thumbnails/mongodb-960.webp";
import awsThumbnail from "../assets/course-thumbnails/aws-960.webp";

export type CourseLevel = "Beginner" | "Intermediate";
export type CourseCategory = "Design" | "Development" | "Database" | "Cloud";
export type CourseRole = "student" | "creator";
export type CourseEnrollmentFilter =
  "all" | "enrolled" | "not-enrolled" | "published" | "draft" | "bin";
export type CourseSort = "latest" | "title" | "progress";
export type CourseStatusFilter =
  | "all"
  | "in-progress"
  | "not-started"
  | "completed"
  | "published"
  | "draft"
  | "bin";
export type CourseLifecycleStatus = "published" | "draft" | "archived";

export interface CourseOpenOptions {
  preview?: boolean;
}

export interface CoursePricing {
  price: string;
  originalPrice: string;
  discount: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  category: CourseCategory;
  sections: number;
  lectures: number;
  progress: number | null;
  enrolled: boolean;
  duration: string;
  students: number;
  thumbnail: string;
  lifecycleStatus: CourseLifecycleStatus;
  pricing?: CoursePricing;
  certificateAvailable?: boolean;
  slug?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  purgeAt?: string;
  isApi?: boolean;
}

/**
 * Learner-facing links should use the readable public slug. The ID fallback
 * keeps local/demo courses and older records working.
 */
export function getCourseRouteKey(course: Pick<Course, "id" | "slug">): string {
  return course.slug?.trim() || course.id;
}

/**
 * The local catalogue predates the API catalogue and some of its IDs are
 * still used by saved links and browser session state. Keep those IDs valid
 * at the API boundary without changing the public routes used by the demo UI.
 */
const LEGACY_API_COURSE_SLUGS: Readonly<Record<string, string>> = {
  "backend-nodejs": "complete-backend-development-with-nodejs",
  "typescript-course": "ultimate-typescript-course",
};

export function getApiCourseSlugForLegacyKey(
  courseKey: string | undefined,
): string | undefined {
  return courseKey ? LEGACY_API_COURSE_SLUGS[courseKey] : undefined;
}

export interface CourseCatalogueFilters {
  activeSection: string;
  wishlisted: ReadonlySet<string>;
  role: CourseRole;
  enrollmentFilter: CourseEnrollmentFilter;
  statusFilter: CourseStatusFilter;
  search: string;
  sort: CourseSort;
}

export const courses: readonly Course[] = [
  {
    id: "backend-nodejs",
    title: "Complete Backend with Node.js",
    description:
      "Build scalable and performant backend applications using Node.js, Express & more.",
    level: "Intermediate",
    category: "Development",
    sections: 23,
    lectures: 600,
    progress: 80,
    enrolled: true,
    duration: "34h 20m",
    students: 1320,
    thumbnail: nodeThumbnail,
    lifecycleStatus: "published",
  },
  {
    id: "typescript-course",
    title: "The Ultimate TypeScript Course",
    description:
      "Master TypeScript from basics to advanced concepts with real-world projects.",
    level: "Intermediate",
    category: "Development",
    sections: 24,
    lectures: 160,
    progress: 50,
    enrolled: true,
    duration: "28h 10m",
    students: 967,
    thumbnail: typescriptThumbnail,
    lifecycleStatus: "published",
  },
  {
    id: "javascript-course",
    title: "The Complete JavaScript Course",
    description:
      "Learn modern JavaScript from core language fundamentals to asynchronous application patterns.",
    level: "Beginner",
    category: "Development",
    sections: 20,
    lectures: 142,
    progress: 38,
    enrolled: true,
    duration: "24h 35m",
    students: 1584,
    thumbnail: javascriptThumbnail,
    lifecycleStatus: "draft",
  },
  {
    id: "ui-ux-design-mastery",
    title: "UI/UX Design Mastery",
    description:
      "Learn user-centered design principles and create stunning, intuitive interfaces.",
    level: "Beginner",
    category: "Design",
    sections: 7,
    lectures: 42,
    progress: 100,
    enrolled: true,
    duration: "12h 40m",
    students: 842,
    thumbnail: "/assets/instructor-poster-960.webp",
    lifecycleStatus: "published",
    certificateAvailable: true,
  },
  {
    id: "figma-ui-essentials",
    title: "Figma UI Essentials",
    description:
      "Design modern interfaces, prototypes and collaborate like a pro in Figma.",
    level: "Beginner",
    category: "Design",
    sections: 8,
    lectures: 48,
    progress: null,
    enrolled: false,
    duration: "9h 15m",
    students: 611,
    thumbnail: figmaThumbnail,
    lifecycleStatus: "draft",
    pricing: {
      price: "₹1,499",
      originalPrice: "₹2,499",
      discount: "40% off",
    },
  },
  {
    id: "mongodb-database-design",
    title: "MongoDB & Database Design",
    description:
      "Learn NoSQL with MongoDB and design efficient, scalable database schemas.",
    level: "Beginner",
    category: "Database",
    sections: 12,
    lectures: 68,
    progress: 0,
    enrolled: true,
    duration: "14h 45m",
    students: 723,
    thumbnail: mongodbThumbnail,
    lifecycleStatus: "published",
  },
  {
    id: "aws-cloud-practitioner",
    title: "AWS Cloud Practitioner Essentials",
    description:
      "Understand cloud concepts and core AWS services with hands-on demos.",
    level: "Intermediate",
    category: "Cloud",
    sections: 11,
    lectures: 60,
    progress: null,
    enrolled: false,
    duration: "16h 30m",
    students: 489,
    thumbnail: awsThumbnail,
    lifecycleStatus: "archived",
    pricing: {
      price: "₹1,999",
      originalPrice: "₹2,999",
      discount: "33% off",
    },
  },
];

export function getVisibleCourses(
  catalogue: readonly Course[],
  {
    activeSection,
    wishlisted,
    role,
    enrollmentFilter,
    statusFilter,
    search,
    sort,
  }: CourseCatalogueFilters,
): Course[] {
  const normalizedSearch = search.trim().toLowerCase();
  let result = catalogue.filter((course) => {
    if (activeSection === "Wishlist" && !wishlisted.has(course.id))
      return false;
    if (
      role === "student" &&
      enrollmentFilter === "enrolled" &&
      !course.enrolled
    )
      return false;
    if (
      role === "student" &&
      enrollmentFilter === "not-enrolled" &&
      course.enrolled
    )
      return false;
    if (
      role === "creator" &&
      enrollmentFilter !== "all" &&
      enrollmentFilter !== "bin" &&
      course.lifecycleStatus !== enrollmentFilter
    )
      return false;
    if (statusFilter !== "all" && role === "student") {
      const progress = course.progress ?? 0;
      if (
        statusFilter === "in-progress" &&
        (!course.enrolled || progress <= 0 || progress >= 100)
      )
        return false;
      if (
        statusFilter === "not-started" &&
        (!course.enrolled || progress !== 0)
      )
        return false;
      if (statusFilter === "completed" && (!course.enrolled || progress < 100))
        return false;
    }
    return (
      !normalizedSearch ||
      `${course.title} ${course.description}`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  });
  if (
    role === "student" &&
    enrollmentFilter === "all" &&
    sort === "latest" &&
    result.length > 1
  ) {
    const contrastingCourseIndex = result.findIndex(
      (course, index) => index > 0 && course.enrolled !== result[0]?.enrolled,
    );
    if (contrastingCourseIndex > 1) {
      const firstCourse = result[0]!;
      const contrastingCourse = result[contrastingCourseIndex]!;
      result = [
        firstCourse,
        contrastingCourse,
        ...result.slice(1, contrastingCourseIndex),
        ...result.slice(contrastingCourseIndex + 1),
      ];
    }
  }
  if (role === "creator" && sort === "latest") {
    result = [...result].sort((a, b) => {
      const dateA = a.updatedAt || a.createdAt;
      const dateB = b.updatedAt || b.createdAt;
      const timeA = dateA ? new Date(dateA).getTime() : 0;
      const timeB = dateB ? new Date(dateB).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return 0;
    });
  }
  if (sort === "title")
    result = [...result].sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "progress")
    result = [...result].sort((a, b) => (b.progress || 0) - (a.progress || 0));
  return result;
}
