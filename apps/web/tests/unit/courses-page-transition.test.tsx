import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoursesPage } from "../../src/CoursesPage.js";

const courseCatalogueRender = vi.hoisted(() => vi.fn());
const courseMutations = vi.hoisted(() => ({
  deleteCourse: vi.fn(),
  restoreCourse: vi.fn(),
}));
const courseQueries = vi.hoisted(() => ({
  deleted: vi.fn(),
  mine: vi.fn(),
  published: vi.fn(),
}));
const learningSpaceMutations = vi.hoisted(() => ({
  upsert: vi.fn(),
  close: vi.fn(),
}));

vi.mock("../../src/courses/CourseCatalogue.js", () => ({
  CourseCatalogue: ({ activeSection }: { activeSection: string }) => {
    courseCatalogueRender(activeSection);
    return <h1>{activeSection}</h1>;
  },
}));

vi.mock("../../src/services/auth", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/auth")
  >("../../src/services/auth");

  return {
    ...actual,
    useCurrentUser: () => ({ data: undefined, isFetched: true }),
    useLogout: () => ({ mutateAsync: vi.fn() }),
    useSignOut: () => ({ isPending: false, signOut: vi.fn() }),
  };
});

vi.mock("../../src/services/learning-space", () => ({
  useLearningSpaceSessions: () => ({ data: undefined, isSuccess: false }),
  useUpsertLearningSpaceSession: () => ({
    mutate: learningSpaceMutations.upsert,
  }),
  useCloseLearningSpaceSession: () => ({
    mutate: learningSpaceMutations.close,
  }),
}));

vi.mock("../../src/services/courses", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/courses")
  >("../../src/services/courses");

  return {
    ...actual,
    useCourses: (options: unknown) => {
      courseQueries.published(options);
      return { data: undefined };
    },
    useDeleteCourse: () => ({ mutateAsync: courseMutations.deleteCourse }),
    useDeletedCourses: (_filters: unknown, options: unknown) => {
      courseQueries.deleted(options);
      return { data: undefined };
    },
    useMyCourses: (options: unknown) => {
      courseQueries.mine(options);
      return { data: undefined };
    },
    useRestoreCourse: () => ({ mutateAsync: courseMutations.restoreCourse }),
  };
});

const baseProps = {
  onNavigatePage: vi.fn(),
  onOpenCourse: vi.fn(),
};

beforeEach(() => {
  courseCatalogueRender.mockClear();
  courseQueries.deleted.mockClear();
  courseQueries.mine.mockClear();
  courseQueries.published.mockClear();
  courseMutations.deleteCourse.mockReset();
  courseMutations.restoreCourse.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("CoursesPage route transitions", () => {
  it("mounts and loads the return page only when its learning background is requested", async () => {
    const { rerender } = render(
      <CoursesPage
        {...baseProps}
        page="learning"
        section="Learning Space"
        renderMain={() => <div data-testid="learning-surface" />}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("learning-surface")).toBeInTheDocument(),
    );
    expect(
      document.querySelector("[data-learning-background-surface]"),
    ).toBeNull();
    expect(courseCatalogueRender).not.toHaveBeenCalled();
    expect(courseQueries.published).toHaveBeenLastCalledWith({
      enabled: false,
    });

    rerender(
      <CoursesPage
        {...baseProps}
        page="learning"
        section="Learning Space"
        learningBackground={{ page: "courses", section: "Courses" }}
        renderMain={() => <div data-testid="learning-surface" />}
      />,
    );

    const backgroundSurface = document.querySelector(
      "[data-learning-background-surface]",
    );
    expect(backgroundSurface).not.toBeNull();
    expect(backgroundSurface).toHaveAttribute("aria-hidden", "true");
    expect(backgroundSurface).toHaveAttribute("inert");
    expect(backgroundSurface).toHaveClass(
      "h-dvh",
      "max-h-dvh",
      "min-h-0!",
      "overflow-clip!",
    );
    expect(backgroundSurface).toHaveStyle({ contain: "strict" });
    expect(courseCatalogueRender).toHaveBeenCalledWith("Courses");
    expect(courseQueries.published).toHaveBeenLastCalledWith({ enabled: true });
  });

  it("renders the Courses heading on the first learning-to-catalogue render", async () => {
    const { rerender } = render(
      <CoursesPage
        {...baseProps}
        page="learning"
        section="Learning Space"
        renderMain={() => <div data-testid="learning-surface" />}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("learning-surface")).toBeInTheDocument(),
    );
    courseCatalogueRender.mockClear();

    rerender(<CoursesPage {...baseProps} page="courses" />);

    expect(courseCatalogueRender).toHaveBeenCalled();
    expect(courseCatalogueRender.mock.calls[0]?.[0]).toBe("Courses");
    expect(courseCatalogueRender).not.toHaveBeenCalledWith("Learning Space");
    expect(
      screen.getByRole("heading", { level: 1, name: "Courses" }),
    ).toBeInTheDocument();
  });
});
