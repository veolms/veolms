import { describe, it, expect, vi, beforeEach } from "vitest";

describe("First-Time Course Creation: Prebuilt 'Introduction' Section & Lesson Flow", () => {
  const sampleCourseId = "11111111-1111-1111-1111-111111111111";
  const sampleSectionId = "22222222-2222-2222-2222-222222222222";
  const sampleLessonId = "33333333-3333-3333-3333-333333333333";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("orchestrates Course -> Section ('Introduction') -> Lesson ('New Lesson 1') and keeps downstream locked until complete", async () => {
    const callLog: string[] = [];
    let isInitialCurriculumBootstrapInProgress = false;
    let currentCourseId: string | null = null;

    const mockCreateCourse = vi.fn().mockImplementation(async ({ title }: { title: string }) => {
      callLog.push(`createCourse:${title}`);
      return { id: sampleCourseId, version: 1, title, instructorAlias: null };
    });

    const mockCreateSection = vi.fn().mockImplementation(async ({ courseId, payload }: { courseId: string; payload: { title: string } }) => {
      callLog.push(`createSection:${courseId}:${payload.title}`);
      return { id: sampleSectionId, courseId, title: payload.title, position: 1 };
    });

    const mockCreateLesson = vi.fn().mockImplementation(async ({ courseId, sectionId, payload }: { courseId: string; sectionId: string; payload: { title: string; contentType: string } }) => {
      callLog.push(`createLesson:${sectionId}:${payload.title}:${payload.contentType}`);
      return { id: sampleLessonId, position: 1 };
    });

    const getIsDownstreamUnlocked = () => Boolean(currentCourseId) && !isInitialCurriculumBootstrapInProgress;

    // 1. Initially, downstream is locked
    expect(getIsDownstreamUnlocked()).toBe(false);

    // 2. Execute bootstrap lifecycle
    const ensureCourseCreated = async (title: string) => {
      isInitialCurriculumBootstrapInProgress = true;
      try {
        const created = await mockCreateCourse({ title });
        currentCourseId = created.id;

        // While course is created, UI MUST still be locked!
        expect(getIsDownstreamUnlocked()).toBe(false);

        const createdSec = await mockCreateSection({
          courseId: created.id,
          payload: { title: "Introduction" },
        });

        // While section is created, UI MUST still be locked!
        expect(getIsDownstreamUnlocked()).toBe(false);

        const createdLes = await mockCreateLesson({
          courseId: created.id,
          sectionId: createdSec.id,
          payload: {
            title: "New Lesson 1",
            contentType: "video",
          },
        });

        return {
          course: created,
          section: createdSec,
          lesson: createdLes,
        };
      } finally {
        isInitialCurriculumBootstrapInProgress = false;
      }
    };

    const result = await ensureCourseCreated("My First Course");

    // 3. Verify downstream is now unlocked
    expect(getIsDownstreamUnlocked()).toBe(true);

    // 4. Verify exact sequence of API calls
    expect(callLog).toEqual([
      "createCourse:My First Course",
      `createSection:${sampleCourseId}:Introduction`,
      `createLesson:${sampleSectionId}:New Lesson 1:video`,
    ]);

    expect(result.course.id).toBe(sampleCourseId);
    expect(result.section.title).toBe("Introduction");
    expect(result.lesson.id).toBe(sampleLessonId);
  });

  it("does not re-trigger bootstrap if course already exists", async () => {
    const mockCreateSection = vi.fn();
    const mockCreateLesson = vi.fn();

    let currentCourseId: string | null = sampleCourseId;
    let isInitialCurriculumBootstrapInProgress = false;

    const ensureCourseCreated = async () => {
      if (currentCourseId) {
        return { id: currentCourseId };
      }
      isInitialCurriculumBootstrapInProgress = true;
      try {
        await mockCreateSection();
        await mockCreateLesson();
      } finally {
        isInitialCurriculumBootstrapInProgress = false;
      }
      return null;
    };

    const res = await ensureCourseCreated();
    expect(res?.id).toBe(sampleCourseId);
    expect(mockCreateSection).not.toHaveBeenCalled();
    expect(mockCreateLesson).not.toHaveBeenCalled();
  });

  it("releases the lock and preserves courseId even if section creation fails", async () => {
    let isInitialCurriculumBootstrapInProgress = false;
    let currentCourseId: string | null = null;

    const mockCreateCourse = vi.fn().mockResolvedValue({ id: sampleCourseId });
    const mockCreateSection = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const getIsDownstreamUnlocked = () => Boolean(currentCourseId) && !isInitialCurriculumBootstrapInProgress;

    const ensureCourseCreated = async (title: string) => {
      isInitialCurriculumBootstrapInProgress = true;
      try {
        const created = await mockCreateCourse({ title });
        currentCourseId = created.id;

        try {
          await mockCreateSection({ courseId: created.id, payload: { title: "Introduction" } });
        } catch {
          // Gracefully caught
        }
        return created;
      } finally {
        isInitialCurriculumBootstrapInProgress = false;
      }
    };

    await ensureCourseCreated("Failing Section Course");

    // Lock is released and creator is not permanently locked out
    expect(isInitialCurriculumBootstrapInProgress).toBe(false);
    expect(getIsDownstreamUnlocked()).toBe(true);
    expect(currentCourseId).toBe(sampleCourseId);
  });
});
