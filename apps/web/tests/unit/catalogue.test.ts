import { describe, expect, it } from "vitest";
import { courses, getVisibleCourses } from "../../src/courses/catalogue.ts";
import type {
  Course,
  CourseCatalogueFilters,
} from "../../src/courses/catalogue.ts";

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
  getVisibleCourses(courses, { ...defaultFilters, ...overrides });

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
        statusFilter: "archived",
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
    const before = courses.map(({ id }) => id);
    const result = select({ sort: "title" });

    expect(result).not.toBe(courses);
    expect(result).toContain(courses[0]);
    expect(courses.map(({ id }) => id)).toEqual(before);
  });
});
