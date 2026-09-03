import { describe, expect, it } from "vitest";
import { getVisibleCourses } from "../../src/courses/catalogue.ts";
import type {
  Course,
  CourseCatalogueFilters,
} from "../../src/courses/catalogue.ts";

const testCourses: Course[] = [
  {
    id: "backend-nodejs",
    title: "Complete Backend with Node.js",
    description: "Build scalable backend applications.",
    level: "Intermediate",
    category: "Development",
    sections: 23,
    lectures: 600,
    progress: 80,
    enrolled: true,
    duration: "34h 20m",
    students: 1320,
    thumbnail: "/nodejs.webp",
    lifecycleStatus: "published",
  },
  {
    id: "figma-ui-essentials",
    title: "Figma UI Essentials",
    description: "Design modern interfaces.",
    level: "Beginner",
    category: "Design",
    sections: 8,
    lectures: 48,
    progress: null,
    enrolled: false,
    duration: "9h 15m",
    students: 611,
    thumbnail: "/figma.webp",
    lifecycleStatus: "draft",
  },
  {
    id: "typescript-course",
    title: "The Ultimate TypeScript Course",
    description: "Master TypeScript.",
    level: "Intermediate",
    category: "Development",
    sections: 24,
    lectures: 160,
    progress: 50,
    enrolled: true,
    duration: "28h 10m",
    students: 967,
    thumbnail: "/typescript.webp",
    lifecycleStatus: "published",
  },
  {
    id: "javascript-course",
    title: "The Complete JavaScript Course",
    description: "Learn modern JavaScript.",
    level: "Beginner",
    category: "Development",
    sections: 20,
    lectures: 142,
    progress: 38,
    enrolled: true,
    duration: "24h 35m",
    students: 1584,
    thumbnail: "/javascript.webp",
    lifecycleStatus: "draft",
  },
  {
    id: "ui-ux-design-mastery",
    title: "UI/UX Design Mastery",
    description: "Learn user-centered design.",
    level: "Beginner",
    category: "Design",
    sections: 7,
    lectures: 42,
    progress: 100,
    enrolled: true,
    duration: "12h 40m",
    students: 842,
    thumbnail: "/ui-ux.webp",
    lifecycleStatus: "published",
  },
  {
    id: "mongodb-database-design",
    title: "MongoDB & Database Design",
    description: "Learn NoSQL with MongoDB.",
    level: "Beginner",
    category: "Database",
    sections: 12,
    lectures: 68,
    progress: 0,
    enrolled: true,
    duration: "14h 45m",
    students: 723,
    thumbnail: "/mongodb.webp",
    lifecycleStatus: "published",
  },
  {
    id: "aws-cloud-practitioner",
    title: "AWS Cloud Practitioner Essentials",
    description: "Understand cloud concepts.",
    level: "Intermediate",
    category: "Cloud",
    sections: 11,
    lectures: 60,
    progress: null,
    enrolled: false,
    duration: "16h 30m",
    students: 489,
    thumbnail: "/aws.webp",
    lifecycleStatus: "archived",
  },
];

const defaultFilters: CourseCatalogueFilters = {
  activeSection: "Courses",
  wishlisted: new Set<string>(),
  role: "student",
  enrollmentFilter: "all",
  statusFilter: "all",
  search: "",
  sort: "latest",
};

const select = (overrides: Partial<CourseCatalogueFilters> = {}) =>
  getVisibleCourses(testCourses, { ...defaultFilters, ...overrides });

describe("course catalogue selector", () => {
  it("returns all seven courses with mixed enrollment in the first two cards", () => {
    const result = select();

    expect(result).toHaveLength(7);
    expect(result.map(({ id }) => id)).toEqual([
      "backend-nodejs",
      "figma-ui-essentials",
      "typescript-course",
      "javascript-course",
      "ui-ux-design-mastery",
      "mongodb-database-design",
      "aws-cloud-practitioner",
    ]);
    expect(result[0]?.enrolled).toBe(true);
    expect(result[1]?.enrolled).toBe(false);
  });

  it("filters enrolled and not-enrolled student courses", () => {
    expect(select({ enrollmentFilter: "enrolled" })).toHaveLength(5);
    expect(select({ enrollmentFilter: "not-enrolled" })).toHaveLength(2);
  });

  it("filters the wishlist using the current set", () => {
    expect(
      select({
        activeSection: "Wishlist",
        wishlisted: new Set(["figma-ui-essentials"]),
      }).map(({ id }) => id),
    ).toEqual(["figma-ui-essentials"]);
  });

  it("normalizes text search before matching course titles and descriptions", () => {
    expect(select({ search: "  MONGO  " }).map(({ id }) => id)).toEqual([
      "mongodb-database-design",
    ]);
  });

  it("filters student progress statuses", () => {
    expect(select({ statusFilter: "completed" }).map(({ id }) => id)).toEqual([
      "ui-ux-design-mastery",
    ]);
    expect(select({ statusFilter: "not-started" }).map(({ id }) => id)).toEqual(
      ["mongodb-database-design"],
    );
  });

  it("sorts by title and progress with the existing null-progress behavior", () => {
    expect(select({ sort: "title" }).map(({ title }) => title)).toEqual([
      "AWS Cloud Practitioner Essentials",
      "Complete Backend with Node.js",
      "Figma UI Essentials",
      "MongoDB & Database Design",
      "The Complete JavaScript Course",
      "The Ultimate TypeScript Course",
      "UI/UX Design Mastery",
    ]);
    expect(select({ sort: "progress" }).map(({ id }) => id)).toEqual([
      "ui-ux-design-mastery",
      "backend-nodejs",
      "typescript-course",
      "javascript-course",
      "figma-ui-essentials",
      "mongodb-database-design",
      "aws-cloud-practitioner",
    ]);
  });

  it("filters creator catalogues by lifecycle", () => {
    expect(
      select({
        role: "creator",
        enrollmentFilter: "published",
      }),
    ).toHaveLength(4);
  });

  it("uses the creator lifecycle control as the only creator status filter", () => {
    expect(
      select({
        role: "creator",
        enrollmentFilter: "published",
        statusFilter: "bin",
      }).map(({ lifecycleStatus }) => lifecycleStatus),
    ).toEqual(["published", "published", "published", "published"]);
  });

  it("selects from the catalogue supplied by the caller", () => {
    const remoteCatalogue: Course[] = [
      {
        id: "academy-course",
        title: "Academy Course",
        description: "A course supplied by a future data source.",
        category: "Development",
        level: "Beginner",
        sections: 1,
        lectures: 1,
        enrolled: false,
        progress: null,
        duration: "1h",
        students: 0,
        thumbnail: "/academy-course.jpg",
        lifecycleStatus: "published",
      },
    ];

    expect(getVisibleCourses(remoteCatalogue, defaultFilters)).toEqual(
      remoteCatalogue,
    );
  });

  it("does not mutate the supplied catalogue or its course references", () => {
    const before = testCourses.map(({ id }) => id);
    const result = select({ sort: "title" });

    expect(result).not.toBe(testCourses);
    expect(result).toContain(testCourses[0]);
    expect(testCourses.map(({ id }) => id)).toEqual(before);
  });
});
