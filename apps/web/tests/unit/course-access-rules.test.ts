import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { coursesService } from "../../src/services/courses/courses.service";
import { courseKeys } from "../../src/services/courses/courses.keys";
import type { CourseAccessRule, CourseSettings, UpdateCourseAccessRuleRequest, UpdateCourseSettingsRequest } from "@veolms/contracts";

describe("Course Access Rules & Settings Service and Mutations", () => {
  let queryClient: QueryClient;
  const courseId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.restoreAllMocks();
  });

  it("calls upsertAccessRules with everyone + lifetime payload", async () => {
    const mockRule: CourseAccessRule = {
      id: "rule-1",
      courseId,
      accessType: "everyone",
      durationType: "lifetime",
      durationDays: null,
    };

    const spy = vi.spyOn(coursesService, "upsertAccessRules").mockResolvedValue(mockRule);

    const payload: UpdateCourseAccessRuleRequest = {
      accessType: "everyone",
      durationType: "lifetime",
      durationDays: null,
    };

    const result = await coursesService.upsertAccessRules(courseId, payload);

    expect(spy).toHaveBeenCalledWith(courseId, payload);
    expect(result.accessType).toBe("everyone");
    expect(result.durationType).toBe("lifetime");
  });

  it("calls upsertAccessRules with everyone + fixed_duration and durationDays", async () => {
    const mockRule: CourseAccessRule = {
      id: "rule-2",
      courseId,
      accessType: "everyone",
      durationType: "fixed_duration",
      durationDays: 60,
    };

    const spy = vi.spyOn(coursesService, "upsertAccessRules").mockResolvedValue(mockRule);

    const payload: UpdateCourseAccessRuleRequest = {
      accessType: "everyone",
      durationType: "fixed_duration",
      durationDays: 60,
    };

    const result = await coursesService.upsertAccessRules(courseId, payload);

    expect(spy).toHaveBeenCalledWith(courseId, payload);
    expect(result.durationType).toBe("fixed_duration");
    expect(result.durationDays).toBe(60);
  });

  it("calls upsertSettings with learner interactions payload (Q&A, Comments, Downloads)", async () => {
    const mockSettings: CourseSettings = {
      id: "settings-1",
      courseId,
      allowQa: true,
      allowComments: true,
      allowDownloads: true,
      certificateEnabled: false,
      showInstructorName: true,
      language: "en",
      estimatedDuration: null,
    };

    const spy = vi.spyOn(coursesService, "upsertSettings").mockResolvedValue(mockSettings);

    const payload: UpdateCourseSettingsRequest = {
      allowQa: true,
      allowComments: true,
      allowDownloads: true,
    };

    const result = await coursesService.upsertSettings(courseId, payload);

    expect(spy).toHaveBeenCalledWith(courseId, payload);
    expect(result.allowComments).toBe(true);
    expect(result.allowDownloads).toBe(true);
  });

  it("calls upsertSettings with certificateEnabled payload", async () => {
    const mockSettings: CourseSettings = {
      id: "settings-2",
      courseId,
      allowQa: true,
      allowComments: true,
      allowDownloads: false,
      certificateEnabled: true,
      showInstructorName: true,
      language: "en",
      estimatedDuration: null,
    };

    const spy = vi.spyOn(coursesService, "upsertSettings").mockResolvedValue(mockSettings);

    const payload: UpdateCourseSettingsRequest = {
      certificateEnabled: true,
    };

    const result = await coursesService.upsertSettings(courseId, payload);

    expect(spy).toHaveBeenCalledWith(courseId, payload);
    expect(result.certificateEnabled).toBe(true);
  });

  it("invalidates editor query on mutation success", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    queryClient.invalidateQueries({
      queryKey: courseKeys.editor(courseId),
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: courseKeys.editor(courseId),
    });
  });
});
