import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateCoursePlayerSession,
  closeCoursePlayerSession,
  COURSE_PLAYER_SESSIONS_STORAGE_KEY,
  COURSE_PLAYER_SESSION_CHANGE_EVENT,
  discardPendingCourseCommentDraft,
  getCoursePlayerBackLabel,
  getCoursePlayerLaunchPath,
  getCoursePlayerOrigin,
  getCoursePlayerOriginFromPathname,
  getCoursePlayerParentPath,
  getCoursePlayerPath,
  getCoursePlayerReturnPath,
  getCoursePlayerSession,
  getOpenCoursePlayerSessions,
  getPendingCourseCommentDraft,
  getStoredCourseLessonId,
  postPendingCourseCommentDraft,
  upsertCoursePlayerSessionFromRoute,
} from "../../src/learning/coursePlayerNavigation";

const getSearch = (path: string) =>
  new URL(path, "https://procodrr.local").search;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("course player navigation", () => {
  it("builds backward-compatible learning URLs and decorates exact launch sources", () => {
    expect(getCoursePlayerLaunchPath("typescript/course", "/courses", 1)).toBe(
      "/learn/typescript%2Fcourse/the-beginning-of-a-design-journey?from=courses",
    );
    expect(getCoursePlayerLaunchPath("course-one", "/", 2)).toBe(
      "/learn/course-one/what-is-ui-ux-design?from=home",
    );
    expect(getCoursePlayerLaunchPath("course-one", "/home", 2)).toBe(
      "/learn/course-one/what-is-ui-ux-design?from=home&returnTo=%2Fhome",
    );
    expect(
      getCoursePlayerLaunchPath(
        "course-one",
        "/courses/course-one/overview?tab=curriculum#lecture-3",
        3,
      ),
    ).toBe(
      "/learn/course-one/the-design-mindset?from=courses&returnTo=%2Fcourses%2Fcourse-one%2Foverview%3Ftab%3Dcurriculum%23lecture-3",
    );

    expect(getCoursePlayerOrigin("?from=home")).toBe("home");
    expect(getCoursePlayerOrigin("?from=my-learning")).toBe("courses");
    expect(getCoursePlayerOrigin("?from=unsafe")).toBe("courses");
    expect(getCoursePlayerOriginFromPathname("/wishlist?filter=saved")).toBe(
      "wishlist",
    );
    expect(
      getCoursePlayerOriginFromPathname("/courses/course-one/overview"),
    ).toBe("courses");
  });

  it("accepts only internal non-learning return paths", () => {
    const validReturnPath =
      "/courses/course-one/overview?tab=curriculum#lecture-3";
    const validSearch = new URLSearchParams({
      from: "courses",
      returnTo: validReturnPath,
    });
    expect(getCoursePlayerReturnPath(`?${validSearch.toString()}`)).toBe(
      validReturnPath,
    );

    for (const unsafeReturnPath of [
      "//example.com/steal",
      "https://example.com/steal",
      "javascript:alert(1)",
      "/learn/course-one/the-design-mindset",
      "/%6c%65%61%72%6e/course-one",
      "/courses\\course-one",
    ]) {
      const search = new URLSearchParams({
        from: "wishlist",
        returnTo: unsafeReturnPath,
      });
      expect(getCoursePlayerReturnPath(`?${search.toString()}`)).toBe(
        "/wishlist",
      );
    }

    expect(
      getCoursePlayerLaunchPath("course-one", "https://example.com/steal", 1),
    ).toBe("/learn/course-one/the-beginning-of-a-design-journey?from=courses");
    expect(getCoursePlayerParentPath("home")).toBe("/");
    expect(getCoursePlayerBackLabel("/courses/course-one/overview")).toBe(
      "Return to Course Overview",
    );
    expect(getCoursePlayerBackLabel("/wishlist?filter=saved")).toBe(
      "Return to Wishlist",
    );
  });

  it("creates and updates one route-owned session per course without prelaunch writes", () => {
    const firstLaunch = getCoursePlayerLaunchPath(
      "course-one",
      "/courses/course-one/overview?tab=curriculum#lecture-3",
      2,
    );
    expect(localStorage.getItem(COURSE_PLAYER_SESSIONS_STORAGE_KEY)).toBeNull();

    expect(
      upsertCoursePlayerSessionFromRoute(
        "course-one",
        getSearch(firstLaunch),
        2,
      ),
    ).toBe(firstLaunch);
    upsertCoursePlayerSessionFromRoute("course-two", "?from=wishlist", 1);

    const nextLessonPath = getCoursePlayerPath(
      "course-one",
      "courses",
      3,
      getCoursePlayerReturnPath(getSearch(firstLaunch)),
    );
    upsertCoursePlayerSessionFromRoute(
      "course-one",
      getSearch(nextLessonPath),
      3,
    );

    expect(
      getOpenCoursePlayerSessions().map(({ courseId }) => courseId),
    ).toEqual(["course-one", "course-two"]);
    expect(getCoursePlayerSession("course-one")).toMatchObject({
      courseId: "course-one",
      lessonId: 3,
      origin: "courses",
      path: nextLessonPath,
      returnPath: "/courses/course-one/overview?tab=curriculum#lecture-3",
    });
    expect(getCoursePlayerSession("missing-course")).toBeNull();
    expect(localStorage.getItem("veolms-active-course-player")).toBeNull();
  });

  it("preserves an existing session source when a bare learning route reopens it", () => {
    const sourcePath = "/courses/course-one/overview?tab=curriculum#lecture-3";
    const launchPath = getCoursePlayerLaunchPath("course-one", sourcePath, 2);
    upsertCoursePlayerSessionFromRoute("course-one", getSearch(launchPath), 2);

    expect(upsertCoursePlayerSessionFromRoute("course-one", "", 3)).toBe(
      getCoursePlayerPath("course-one", "courses", 3, sourcePath),
    );
    expect(getCoursePlayerSession("course-one")).toMatchObject({
      lessonId: 3,
      origin: "courses",
      returnPath: sourcePath,
    });

    upsertCoursePlayerSessionFromRoute("course-one", "?from=wishlist", 4);
    expect(getCoursePlayerSession("course-one")).toMatchObject({
      lessonId: 4,
      origin: "wishlist",
      returnPath: "/wishlist",
    });
  });

  it("activates an open session in place without a global active singleton", () => {
    vi.spyOn(Date, "now").mockReturnValue(20);
    const path = upsertCoursePlayerSessionFromRoute(
      "course-one",
      "?from=home",
      2,
    );

    expect(activateCoursePlayerSession("course-one")).toBe(path);
    expect(getCoursePlayerSession("course-one")?.updatedAt).toBe(20);
    expect(
      getOpenCoursePlayerSessions().map(({ courseId }) => courseId),
    ).toEqual(["course-one"]);
    expect(activateCoursePlayerSession("missing-course")).toBeNull();
    expect(localStorage.getItem("veolms-active-course-player")).toBeNull();
  });

  it("closes only the requested course and returns the most recent fallback", () => {
    const sessions = [
      {
        courseId: "course-one",
        lessonId: 1,
        origin: "courses",
        path: getCoursePlayerPath("course-one", "courses", 1),
        returnPath: "/courses",
        updatedAt: 10,
      },
      {
        courseId: "course-two",
        lessonId: 2,
        origin: "home",
        path: getCoursePlayerPath("course-two", "home", 2),
        returnPath: "/",
        updatedAt: 30,
      },
      {
        courseId: "course-three",
        lessonId: 3,
        origin: "wishlist",
        path: getCoursePlayerPath("course-three", "wishlist", 3),
        returnPath: "/wishlist",
        updatedAt: 20,
      },
    ];
    localStorage.setItem(
      COURSE_PLAYER_SESSIONS_STORAGE_KEY,
      JSON.stringify(sessions),
    );

    expect(closeCoursePlayerSession("course-one")).toMatchObject({
      courseId: "course-two",
    });
    expect(
      getOpenCoursePlayerSessions().map(({ courseId }) => courseId),
    ).toEqual(["course-two", "course-three"]);
    expect(closeCoursePlayerSession("course-two")).toMatchObject({
      courseId: "course-three",
    });
    expect(closeCoursePlayerSession("course-three")).toBeNull();
    expect(getOpenCoursePlayerSessions()).toEqual([]);
  });

  it("uses only the course-scoped last lesson key", () => {
    localStorage.setItem("veolms-last-lesson", "3");
    expect(getStoredCourseLessonId("typescript-course")).toBe(1);

    localStorage.setItem(
      "veolms-last-lesson-typescript-course",
      "the-design-mindset",
    );
    expect(getStoredCourseLessonId("typescript-course")).toBe(3);
  });

  it("repairs malformed collection entries without dispatching during reads", () => {
    const validOldSession = {
      courseId: "course-one",
      lessonId: 1,
      origin: "courses",
      path: getCoursePlayerPath("course-one", "courses", 1),
      updatedAt: 10,
    };
    const updatedSession = {
      courseId: "course-one",
      lessonId: 3,
      origin: "wishlist",
      path: getCoursePlayerPath("course-one", "wishlist", 3),
      returnPath: "/wishlist?filter=saved",
      updatedAt: 30,
    };
    localStorage.setItem(
      COURSE_PLAYER_SESSIONS_STORAGE_KEY,
      JSON.stringify([validOldSession, { courseId: "broken" }, updatedSession]),
    );
    let changeCount = 0;
    const handleChange = () => {
      changeCount += 1;
    };
    window.addEventListener(COURSE_PLAYER_SESSION_CHANGE_EVENT, handleChange);

    try {
      expect(getOpenCoursePlayerSessions()).toEqual([
        {
          ...updatedSession,
          path: getCoursePlayerPath(
            "course-one",
            "wishlist",
            3,
            "/wishlist?filter=saved",
          ),
        },
      ]);
      expect(changeCount).toBe(0);
      expect(
        JSON.parse(
          localStorage.getItem(COURSE_PLAYER_SESSIONS_STORAGE_KEY) ?? "null",
        ),
      ).toEqual(getOpenCoursePlayerSessions());

      localStorage.setItem(COURSE_PLAYER_SESSIONS_STORAGE_KEY, "not-json");
      expect(getOpenCoursePlayerSessions()).toEqual([]);
      expect(
        localStorage.getItem(COURSE_PLAYER_SESSIONS_STORAGE_KEY),
      ).toBeNull();
      expect(changeCount).toBe(0);
    } finally {
      window.removeEventListener(
        COURSE_PLAYER_SESSION_CHANGE_EVENT,
        handleChange,
      );
    }
  });

  it("migrates the legacy active singleton into the collection and deletes it", () => {
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
    localStorage.setItem(
      "veolms-resume-course-player-courses",
      "/courses/legacy?from=courses",
    );
    let changeCount = 0;
    const handleChange = () => {
      changeCount += 1;
    };
    window.addEventListener(COURSE_PLAYER_SESSION_CHANGE_EVENT, handleChange);

    try {
      expect(getOpenCoursePlayerSessions()).toEqual([
        {
          courseId: "typescript-course",
          lessonId: 3,
          origin: "courses",
          path: "/learn/typescript-course/the-design-mindset?from=courses",
          returnPath: "/courses",
          updatedAt: 42,
        },
      ]);
      expect(localStorage.getItem("veolms-active-course-player")).toBeNull();
      expect(
        localStorage.getItem("veolms-resume-course-player-courses"),
      ).toBeNull();
      expect(changeCount).toBe(0);
    } finally {
      window.removeEventListener(
        COURSE_PLAYER_SESSION_CHANGE_EVENT,
        handleChange,
      );
    }
  });

  it("prefers the newer duplicate while migrating and drops unsafe singleton data", () => {
    const collectionSession = {
      courseId: "course-one",
      lessonId: 1,
      origin: "courses",
      path: getCoursePlayerPath("course-one", "courses", 1),
      returnPath: "/courses",
      updatedAt: 10,
    };
    localStorage.setItem(
      COURSE_PLAYER_SESSIONS_STORAGE_KEY,
      JSON.stringify([collectionSession]),
    );
    localStorage.setItem(
      "veolms-active-course-player",
      JSON.stringify({
        courseId: "course-one",
        lessonId: 2,
        origin: "home",
        path: getCoursePlayerPath("course-one", "home", 2),
        updatedAt: 20,
      }),
    );
    expect(getCoursePlayerSession("course-one")).toMatchObject({
      lessonId: 2,
      origin: "home",
      returnPath: "/",
      updatedAt: 20,
    });
    expect(localStorage.getItem("veolms-active-course-player")).toBeNull();

    localStorage.clear();
    localStorage.setItem(
      "veolms-active-course-player",
      JSON.stringify({
        courseId: "unsafe",
        origin: "courses",
        path: "https://example.com/learn/unsafe?from=courses",
        updatedAt: 30,
      }),
    );
    expect(getOpenCoursePlayerSessions()).toEqual([]);
    expect(localStorage.getItem("veolms-active-course-player")).toBeNull();
  });

  it("notifies subscribers only after explicit collection writes", () => {
    let changeCount = 0;
    const handleChange = () => {
      changeCount += 1;
    };
    window.addEventListener(COURSE_PLAYER_SESSION_CHANGE_EVENT, handleChange);

    try {
      getOpenCoursePlayerSessions();
      expect(changeCount).toBe(0);

      upsertCoursePlayerSessionFromRoute("course-one", "?from=courses", 1);
      expect(changeCount).toBe(1);

      activateCoursePlayerSession("course-one");
      expect(changeCount).toBe(2);

      closeCoursePlayerSession("course-one");
      expect(changeCount).toBe(3);
    } finally {
      window.removeEventListener(
        COURSE_PLAYER_SESSION_CHANGE_EVENT,
        handleChange,
      );
    }
  });

  it("finds, posts, and discards a course lesson comment draft", () => {
    localStorage.setItem("veolms-last-lesson-typescript-course", "3");
    upsertCoursePlayerSessionFromRoute("typescript-course", "?from=courses", 3);
    const draftKey =
      "veolms-learning-typescript-course-lesson-3-discussion-comment-draft";
    sessionStorage.setItem(draftKey, JSON.stringify("  Keep this thought  "));

    const session = getCoursePlayerSession("typescript-course");
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
