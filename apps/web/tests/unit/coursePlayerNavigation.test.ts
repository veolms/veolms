import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRememberedCoursePlayerDestination,
  discardPendingCourseCommentDraft,
  getActiveCoursePlayerSession,
  getCoursePlayerBackLabel,
  getCoursePlayerOrigin,
  getCoursePlayerOriginFromPathname,
  getCoursePlayerOriginFromSection,
  getCoursePlayerParentPath,
  getCoursePlayerPath,
  getPendingCourseCommentDraft,
  getRememberedCoursePlayerDestination,
  getResumableCoursePlayerNavigationPath,
  getStoredCourseLessonId,
  getCoursePlayerSection,
  postPendingCourseCommentDraft,
  rememberCoursePlayerDestination,
} from "../../src/learning/coursePlayerNavigation";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("course player navigation", () => {
  it("preserves My Courses as the launch origin", () => {
    const origin = getCoursePlayerOriginFromPathname("/my-courses");

    expect(getCoursePlayerPath("typescript/course", origin)).toBe(
      "/learn/typescript%2Fcourse/the-beginning-of-a-design-journey?from=my-courses",
    );
    expect(getCoursePlayerOrigin("?from=my-courses")).toBe("my-courses");
    expect(getCoursePlayerSection(origin)).toBe("My Courses");
    expect(getCoursePlayerParentPath(origin)).toBe("/my-courses");
    expect(getCoursePlayerBackLabel(origin)).toBe("Return to My Courses");
    expect(getCoursePlayerOriginFromPathname("/my-courses/")).toBe(
      "my-courses",
    );
  });

  it("maps every course-launching surface to its own player origin", () => {
    expect(getCoursePlayerOriginFromPathname("/")).toBe("home");
    expect(getCoursePlayerOriginFromPathname("/home")).toBe("home");
    expect(getCoursePlayerOriginFromPathname("/explore-courses")).toBe(
      "explore-courses",
    );
    expect(getCoursePlayerOriginFromPathname("/wishlist")).toBe("wishlist");
    expect(getCoursePlayerOrigin("")).toBe("explore-courses");
    expect(getCoursePlayerOrigin("?from=home")).toBe("home");
    expect(getCoursePlayerOrigin("?from=wishlist")).toBe("wishlist");
    expect(getCoursePlayerOrigin("?from=unsafe")).toBe("explore-courses");
    expect(getCoursePlayerParentPath("home")).toBe("/");
    expect(getCoursePlayerParentPath("explore-courses")).toBe(
      "/explore-courses",
    );
    expect(getCoursePlayerParentPath("wishlist")).toBe("/wishlist");
    expect(getCoursePlayerSection("home")).toBe("Home");
    expect(getCoursePlayerSection("explore-courses")).toBe("Explore Courses");
    expect(getCoursePlayerSection("wishlist")).toBe("Wishlist");
    expect(getCoursePlayerOriginFromSection("Home")).toBe("home");
    expect(getCoursePlayerOriginFromSection("Wishlist")).toBe("wishlist");
    expect(getCoursePlayerOriginFromSection("Settings")).toBeNull();
    expect(getCoursePlayerBackLabel("home")).toBe("Return to Home");
    expect(getCoursePlayerBackLabel("explore-courses")).toBe(
      "Return to Explore Courses",
    );
    expect(getCoursePlayerBackLabel("wishlist")).toBe("Return to Wishlist");
  });

  it("keeps only the latest learning session and moves its source indicator", () => {
    expect(
      rememberCoursePlayerDestination("course one", "explore-courses"),
    ).toBe(
      "/learn/course%20one/the-beginning-of-a-design-journey?from=explore-courses",
    );
    expect(getResumableCoursePlayerNavigationPath("/explore-courses")).toBe(
      "/learn/course%20one/the-beginning-of-a-design-journey?from=explore-courses",
    );

    expect(rememberCoursePlayerDestination("course-two", "my-courses")).toBe(
      "/learn/course-two/the-beginning-of-a-design-journey?from=my-courses",
    );
    expect(getResumableCoursePlayerNavigationPath("/explore-courses")).toBe(
      "/explore-courses",
    );
    expect(getResumableCoursePlayerNavigationPath("/my-courses/")).toBe(
      "/learn/course-two/the-beginning-of-a-design-journey?from=my-courses",
    );
    expect(getResumableCoursePlayerNavigationPath("/wishlist")).toBe(
      "/wishlist",
    );
    expect(getActiveCoursePlayerSession()).toMatchObject({
      courseId: "course-two",
      lessonId: 1,
      origin: "my-courses",
      path: "/learn/course-two/the-beginning-of-a-design-journey?from=my-courses",
    });

    clearRememberedCoursePlayerDestination("explore-courses");
    expect(getRememberedCoursePlayerDestination("my-courses")).toBe(
      "/learn/course-two/the-beginning-of-a-design-journey?from=my-courses",
    );
    clearRememberedCoursePlayerDestination("my-courses");
    expect(getActiveCoursePlayerSession()).toBeNull();
  });

  it("restores a stored lesson slug without coercing it to a number", () => {
    localStorage.setItem(
      "veolms-last-lesson-typescript-course",
      "the-design-mindset",
    );

    expect(getStoredCourseLessonId("typescript-course")).toBe(3);
  });

  it("discards invalid singleton sessions and legacy destinations", () => {
    localStorage.setItem(
      "veolms-active-course-player",
      JSON.stringify({
        courseId: "unsafe",
        origin: "courses",
        path: "https://example.com/learn/unsafe?from=courses",
        updatedAt: Date.now(),
      }),
    );
    localStorage.setItem(
      "veolms-resume-course-player-courses",
      "/courses/legacy?from=courses",
    );

    expect(getActiveCoursePlayerSession()).toBeNull();
    expect(localStorage.getItem("veolms-active-course-player")).toBeNull();
    expect(
      localStorage.getItem("veolms-resume-course-player-courses"),
    ).toBeNull();
  });

  it("migrates a valid saved session from the previous origin names", () => {
    localStorage.setItem(
      "veolms-active-course-player",
      JSON.stringify({
        courseId: "typescript-course",
        lessonId: 3,
        origin: "my-learning",
        path: "/learn/typescript-course/the-design-mindset?from=my-learning",
        updatedAt: 42,
      }),
    );

    expect(getActiveCoursePlayerSession()).toEqual({
      courseId: "typescript-course",
      lessonId: 3,
      origin: "my-courses",
      path: "/learn/typescript-course/the-design-mindset?from=my-courses",
      updatedAt: 42,
    });
    expect(
      JSON.parse(localStorage.getItem("veolms-active-course-player") ?? "null"),
    ).toMatchObject({ origin: "my-courses" });
  });

  it("finds, posts, and discards the active lesson comment draft", () => {
    localStorage.setItem("veolms-last-lesson-typescript-course", "3");
    rememberCoursePlayerDestination("typescript-course", "my-courses", 3);
    const draftKey =
      "veolms-learning-typescript-course-lesson-3-discussion-comment-draft";
    sessionStorage.setItem(draftKey, JSON.stringify("  Keep this thought  "));

    const session = getActiveCoursePlayerSession();
    expect(session).not.toBeNull();
    const draft = getPendingCourseCommentDraft(session!);
    expect(draft).toMatchObject({
      courseId: "typescript-course",
      lessonId: 3,
      text: "Keep this thought",
    });

    postPendingCourseCommentDraft(draft!);
    expect(sessionStorage.getItem(draftKey)).toBeNull();
    expect(
      JSON.parse(sessionStorage.getItem(draft!.commentsStorageKey) ?? "[]"),
    ).toEqual([
      expect.objectContaining({
        name: "Sofia Chen",
        text: "Keep this thought",
      }),
    ]);

    sessionStorage.setItem(draftKey, JSON.stringify("Discard this"));
    const discardDraft = getPendingCourseCommentDraft(session!);
    discardPendingCourseCommentDraft(discardDraft!);
    expect(sessionStorage.getItem(draftKey)).toBeNull();
  });
});
