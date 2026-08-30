import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CourseCard } from "../../src/courses/CourseCard.tsx";
import type { CourseCardProps } from "../../src/courses/CourseCard.tsx";
import { PlaceholderPage } from "../../src/courses/PlaceholderPage.tsx";
import type { Course } from "../../src/courses/catalogue.ts";

const enrolledCourse: Course = {
  id: "typescript-course",
  title: "The Ultimate TypeScript Course",
  description: "Master TypeScript from basics to advanced concepts.",
  category: "Development",
  level: "Intermediate",
  sections: 24,
  lectures: 160,
  progress: 50,
  enrolled: true,
  duration: "28h 10m",
  students: 967,
  thumbnail: "/course.jpg",
  lifecycleStatus: "published",
};

const nonEnrolledCourse = {
  ...enrolledCourse,
  id: "figma-ui-essentials",
  title: "Figma UI Essentials",
  enrolled: false,
  progress: null,
  pricing: {
    price: "₹1,999",
    originalPrice: "₹2,999",
    discount: "33% off",
  },
};

const renderCard = (props: Partial<CourseCardProps> = {}) => {
  const callbacks = {
    onWishlist: vi.fn(),
    onOpen: vi.fn(),
    onExplore: vi.fn(),
    onEdit: vi.fn(),
    onManage: vi.fn(),
    onNavigatePage: vi.fn(),
    setMenuOpen: vi.fn(),
    setNotice: vi.fn(),
  };
  const view = render(
    <CourseCard
      course={enrolledCourse}
      role="student"
      wishlisted={false}
      menuOpen={false}
      {...callbacks}
      {...props}
    />,
  );

  return { ...callbacks, ...view };
};

describe("CourseCard", () => {
  it("resumes an enrolled course from its thumbnail play action", () => {
    const { onOpen } = renderCard();
    const card = screen.getByRole("article");
    const open = screen.getByRole("button", {
      name: "Resume The Ultimate TypeScript Course",
    });

    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("tabindex");
    expect(open).toHaveAttribute("type", "button");
    expect(open).toHaveAttribute("title", "Continue Learning");
    open.focus();
    expect(open).toHaveFocus();
    fireEvent.click(open);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(enrolledCourse);
  });

  it("opens the course overview from the full card details surface", () => {
    const { onNavigatePage, onOpen } = renderCard();
    const overview = screen.getByRole("link", {
      name: `View course overview for ${enrolledCourse.title}`,
    });
    const metadata = screen.getByText(/24 Sections/);
    const card = screen.getByRole("article");
    const details = card.querySelector<HTMLElement>(
      "[data-course-card-details]",
    );
    const infoRow = card.querySelector<HTMLElement>(
      "[data-course-card-info-row]",
    );

    expect(details).not.toBeNull();
    expect(infoRow).not.toBeNull();
    expect(infoRow).toHaveClass("-mx-2", "flex", "min-w-0");
    expect(infoRow).not.toHaveClass(
      "hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]",
      "focus-within:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]",
    );
    expect(overview).toHaveClass("absolute", "inset-0", "cursor-pointer");
    expect(screen.getByRole("heading")).toHaveClass(
      "truncate",
      "text-[0.92rem]",
      "lg:text-[0.98rem]",
    );
    expect(details).toContainElement(overview);
    expect(details).toContainElement(metadata);
    expect(overview).toHaveAttribute("title", "View Course Overview");

    fireEvent.click(overview);

    expect(onNavigatePage).toHaveBeenCalledWith(
      "/courses/typescript-course/overview",
    );
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("continues an enrolled course from its primary action", () => {
    const { onOpen, onNavigatePage } = renderCard();
    const continueLearning = screen.getByRole("button", {
      name: "Continue Learning",
    });

    expect(continueLearning.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(continueLearning);

    expect(onOpen).toHaveBeenCalledWith(enrolledCourse);
    expect(onNavigatePage).not.toHaveBeenCalled();
  });

  it("plays a free preview from a non-enrolled thumbnail and opens its overview elsewhere", () => {
    const { onExplore, onNavigatePage, onOpen } = renderCard({
      course: nonEnrolledCourse,
    });
    const card = screen.getByRole("article");
    const preview = screen.getByRole("button", {
      name: "Play free preview for Figma UI Essentials",
    });
    const statusBadge = screen.getByText("Not Enrolled", { exact: true });

    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("tabindex");
    expect(statusBadge).toHaveAttribute("data-course-card-tag");
    expect(statusBadge.querySelector("svg")).toBeNull();
    expect(screen.getByText("₹1,999", { exact: true })).toBeVisible();
    expect(screen.getByText("₹2,999", { exact: true })).toBeVisible();
    expect(screen.getByText("33% off", { exact: true })).toBeVisible();
    expect(preview).toHaveAttribute("title", "Play Free Preview");
    expect(preview.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(preview);
    fireEvent.click(
      screen.getByRole("link", {
        name: `View course overview for ${nonEnrolledCourse.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "View Curriculum" }));

    expect(onOpen).toHaveBeenCalledWith(nonEnrolledCourse);
    expect(onNavigatePage).toHaveBeenCalledTimes(2);
    expect(onNavigatePage).toHaveBeenLastCalledWith(
      "/courses/figma-ui-essentials/overview",
    );
    expect(onExplore).not.toHaveBeenCalled();
  });

  it("does not invent pricing when a non-enrolled course has no price", () => {
    renderCard({
      course: {
        ...nonEnrolledCourse,
        pricing: undefined,
      },
    });

    expect(
      document.querySelector("[data-course-card-pricing]"),
    ).not.toBeInTheDocument();
  });

  it("plays a creator course from its thumbnail and opens its overview from the details", () => {
    const { onManage, onNavigatePage, onOpen } = renderCard({
      role: "creator",
    });

    const play = screen.getByRole("button", {
      name: "Play The Ultimate TypeScript Course",
    });
    expect(play).toHaveAttribute("title", "Play Course");
    expect(play.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(play);
    fireEvent.click(
      screen.getByRole("link", {
        name: `View course overview for ${enrolledCourse.title}`,
      }),
    );

    expect(onOpen).toHaveBeenCalledWith(enrolledCourse);
    expect(onNavigatePage).toHaveBeenCalledWith(
      "/courses/typescript-course/overview",
    );
    expect(onManage).not.toHaveBeenCalled();
  });

  it("toggles the wishlist without opening the card", () => {
    const { onWishlist, onOpen } = renderCard({ course: nonEnrolledCourse });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add Figma UI Essentials to wishlist",
      }),
    );

    expect(onWishlist).toHaveBeenCalledWith("figma-ui-essentials");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps creator course actions and notices within the card menu", async () => {
    const { onOpen, setMenuOpen, rerender } = renderCard({
      role: "creator",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Actions for The Ultimate TypeScript Course",
      }),
    );
    expect(setMenuOpen).toHaveBeenCalledWith("typescript-course");
    expect(onOpen).not.toHaveBeenCalled();

    const onEdit = vi.fn();
    rerender(
      <CourseCard
        course={enrolledCourse}
        role="creator"
        wishlisted={false}
        menuOpen
        onWishlist={vi.fn()}
        onOpen={onOpen}
        onExplore={vi.fn()}
        onEdit={onEdit}
        onNavigatePage={vi.fn()}
        setMenuOpen={setMenuOpen}
        setNotice={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Course" }));

    expect(setMenuOpen).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(enrolledCourse));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("edits a creator course from the centered card action", () => {
    const onEdit = vi.fn();
    renderCard({ role: "creator", onEdit });

    const editCourse = screen.getByRole("button", { name: "Edit Course" });
    expect(editCourse).toHaveClass("flex", "justify-center", "gap-2");
    expect(editCourse.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(editCourse);

    expect(onEdit).toHaveBeenCalledWith(enrolledCourse);
  });

  it.each([
    ["creator", enrolledCourse],
    ["student", enrolledCourse],
    ["student", nonEnrolledCourse],
  ] as const)(
    "opens course preview from the %s course menu",
    async (role, course) => {
      const { onExplore, setMenuOpen } = renderCard({
        role,
        course,
        menuOpen: true,
      });

      fireEvent.click(screen.getByRole("menuitem", { name: "Course Preview" }));

      expect(setMenuOpen).toHaveBeenCalledWith(null);
      await waitFor(() => expect(onExplore).toHaveBeenCalledWith(course));
    },
  );

  it("opens the course menu above when it cannot fit below the action", () => {
    const originalInnerHeight = window.innerHeight;
    const boundsSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBounds(this: HTMLElement) {
        if (this.getAttribute("aria-haspopup") === "menu") {
          return {
            x: 320,
            y: 540,
            width: 40,
            height: 40,
            top: 540,
            right: 360,
            bottom: 580,
            left: 320,
            toJSON: () => ({}),
          } as DOMRect;
        }

        if (this.getAttribute("role") === "menu") {
          return {
            x: 360,
            y: 580,
            width: 238,
            height: 220,
            top: 580,
            right: 598,
            bottom: 800,
            left: 360,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });

    try {
      renderCard({ menuOpen: true });

      const menu = screen.getByRole("menu");
      expect(menu).toHaveAttribute("data-placement", "above-right");
      expect(menu).toHaveClass("fixed", "z-[1000000]");
      expect(menu).toHaveStyle({ top: "320px" });
      expect(menu.parentElement).toBe(document.body);
    } finally {
      boundsSpy.mockRestore();
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it("dismisses the portalled course menu on an outside pointer press", () => {
    const { setMenuOpen } = renderCard({ menuOpen: true });

    const menu = screen.getByRole("menu", {
      name: "Actions for The Ultimate TypeScript Course",
    });
    expect(menu.parentElement).toBe(document.body);

    fireEvent.pointerDown(document.body);

    expect(setMenuOpen).toHaveBeenCalledWith(null);
  });
});

describe("PlaceholderPage", () => {
  it("renders known content with the role-specific eyebrow", () => {
    render(<PlaceholderPage section="Students" role="creator" />);

    expect(screen.getByRole("heading", { name: "Students" })).toBeVisible();
    expect(screen.getByText("Creator workspace")).toBeVisible();
    expect(
      screen.getByText("Student management is not implemented yet.", {
        exact: false,
      }),
    ).toBeVisible();
  });

  it("renders fallback content and keeps the Logout modifier class", () => {
    const { rerender, container } = render(
      <PlaceholderPage section="Future feature" role="student" />,
    );

    expect(
      screen.getByRole("heading", { name: "Future feature" }),
    ).toBeVisible();
    expect(screen.getByText("Student workspace")).toBeVisible();
    expect(
      screen.getByText("Future feature is not implemented yet.", {
        exact: false,
      }),
    ).toBeVisible();

    rerender(<PlaceholderPage section="Logout" role="student" />);
    expect(container.firstChild).toHaveClass(
      "courses-placeholder-page--logout",
    );
  });
});
