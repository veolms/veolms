import { describe, expect, it } from "vitest";
import type { EnrolledCourse, CourseSummary } from "@veolms/contracts";
import { adaptEnrolledCourseToLearningCourse } from "../../src/StudentPages";
import { adaptCourseSummaryToCatalogueCourse, adaptApiCourseToCatalogueCourse } from "../../src/courses/courseAdapter";

describe("Enrollment Flow - Adapters & Mapping", () => {
  const sampleEnrolledCourse: EnrolledCourse = {
    enrollmentId: "11111111-1111-1111-1111-111111111111",
    courseId: "22222222-2222-2222-2222-222222222222",
    courseSlug: "ultimate-typescript-course",
    courseTitle: "The Ultimate TypeScript Course",
    courseDescription: "Master TypeScript from basics to advanced types",
    courseThumbnailUrl: null,
    totalSections: 12,
    totalLessons: 84,
    totalDurationSeconds: 36000,
    enrolledAt: "2026-08-01T10:00:00.000Z",
    status: "active",
    source: "direct_purchase",
    progress: 45,
    lastAccessedAt: "2026-08-10T14:30:00.000Z",
  };

  it("adapts EnrolledCourse to LearningCourse with correct status and progress", () => {
    const learningCourse = adaptEnrolledCourseToLearningCourse(sampleEnrolledCourse);

    expect(learningCourse.id).toBe(sampleEnrolledCourse.courseId);
    expect(learningCourse.slug).toBe(sampleEnrolledCourse.courseSlug);
    expect(learningCourse.title).toBe(sampleEnrolledCourse.courseTitle);
    expect(learningCourse.sections).toBe(12);
    expect(learningCourse.lectures).toBe(84);
    expect(learningCourse.progress).toBe(45);
    expect(learningCourse.status).toBe("in-progress");
    expect(learningCourse.enrolledOn).toBeDefined();
  });

  it("sets status to completed when progress is 100", () => {
    const completed = adaptEnrolledCourseToLearningCourse({
      ...sampleEnrolledCourse,
      progress: 100,
    });
    expect(completed.status).toBe("completed");
    expect(completed.progress).toBe(100);
  });

  it("sets status to not-started when progress is 0 or null", () => {
    const notStartedZero = adaptEnrolledCourseToLearningCourse({
      ...sampleEnrolledCourse,
      progress: 0,
    });
    expect(notStartedZero.status).toBe("not-started");
    expect(notStartedZero.progress).toBe(0);

    const notStartedNull = adaptEnrolledCourseToLearningCourse({
      ...sampleEnrolledCourse,
      progress: null,
    });
    expect(notStartedNull.status).toBe("not-started");
    expect(notStartedNull.progress).toBe(0);
  });

  it("adaptCourseSummaryToCatalogueCourse marks enrolled courses correctly", () => {
    const summary: CourseSummary = {
      id: "course-uuid-1",
      slug: "complete-backend-development-with-nodejs",
      title: "Complete Backend with Node.js",
      shortDescription: "Build production backends",
      difficulty: "intermediate",
      categoryName: "Development",
      totalSections: 20,
      totalLessons: 140,
      totalDurationSeconds: 45000,
      certificateEnabled: true,
      pricing: {
        pricingType: "paid",
        price: 249900,
        salePrice: null,
        currency: "INR",
      },
    };

    const enrolledIds = new Set(["course-uuid-1"]);
    const progressMap = new Map([["course-uuid-1", 75]]);

    const catalogueCourse = adaptCourseSummaryToCatalogueCourse(
      summary,
      enrolledIds,
      progressMap,
    );

    expect(catalogueCourse.enrolled).toBe(true);
    expect(catalogueCourse.progress).toBe(75);

    const notEnrolled = adaptCourseSummaryToCatalogueCourse(
      summary,
      new Set(["other-course"]),
    );
    expect(notEnrolled.enrolled).toBe(false);
    expect(notEnrolled.progress).toBeNull();
  });

  it("adaptApiCourseToCatalogueCourse supports boolean enrolled flag and progress", () => {
    const apiCourse = {
      id: "course-mine-1",
      slug: "react-course",
      title: "React Course",
      description: "Learn React",
      difficulty: "beginner" as const,
      status: "published" as const,
      creatorId: "user-123",
      version: 1,
      totalSections: 10,
      totalLessons: 50,
      totalDurationSeconds: 18000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    const course = adaptApiCourseToCatalogueCourse(apiCourse, true);
    expect(course.enrolled).toBe(true);
  });
});
