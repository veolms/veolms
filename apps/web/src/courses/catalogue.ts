import nodeThumbnail from "../assets/course-thumbnails/nodejs-960.webp";
import javascriptThumbnail from "../assets/course-thumbnails/javascript-960.webp";
import typescriptThumbnail from "../assets/course-thumbnails/typescript-960.webp";
import figmaThumbnail from "../assets/course-thumbnails/figma-960.webp";
import mongodbThumbnail from "../assets/course-thumbnails/mongodb-960.webp";
import awsThumbnail from "../assets/course-thumbnails/aws-960.webp";

export type CourseLevel = "Beginner" | "Intermediate";
export type CourseCategory = "Design" | "Development" | "Database" | "Cloud";
export type CourseRole = "student" | "creator";
export type CourseEnrollmentFilter = "all" | "enrolled" | "not-enrolled";
export type CourseSort = "latest" | "title" | "progress";

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
}

export interface CourseCatalogueFilters {
  activeSection: string;
  wishlisted: ReadonlySet<string>;
  role: CourseRole;
  enrollmentFilter: CourseEnrollmentFilter;
  category: "all" | CourseCategory;
  search: string;
  sort: CourseSort;
}

export const courses: readonly Course[] = [
  {
    id: "ui-ux-design-mastery",
    title: "UI/UX Design Mastery",
    description:
      "Learn user-centered design principles and create stunning, intuitive interfaces.",
    level: "Beginner",
    category: "Design",
    sections: 7,
    lectures: 42,
    progress: 65,
    enrolled: true,
    duration: "12h 40m",
    students: 842,
    thumbnail: "/assets/instructor-poster-960.webp",
  },
  {
    id: "backend-nodejs",
    title: "Complete Backend with Node.js",
    description:
      "Build scalable and performant backend applications using Node.js, Express & more.",
    level: "Intermediate",
    category: "Development",
    sections: 23,
    lectures: 185,
    progress: 80,
    enrolled: true,
    duration: "34h 20m",
    students: 1320,
    thumbnail: nodeThumbnail,
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
    progress: 35,
    enrolled: true,
    duration: "14h 45m",
    students: 723,
    thumbnail: mongodbThumbnail,
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
  },
];

export function getVisibleCourses(
  catalogue: readonly Course[],
  {
    activeSection,
    wishlisted,
    role,
    enrollmentFilter,
    category,
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
    if (category !== "all" && course.category !== category) return false;
    return (
      !normalizedSearch ||
      `${course.title} ${course.description}`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  });
  if (sort === "title")
    result = [...result].sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "progress")
    result = [...result].sort((a, b) => (b.progress || 0) - (a.progress || 0));
  return result;
}
