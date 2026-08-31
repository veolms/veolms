import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const drawerModule = vi.hoisted(() => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    gate,
    loaded: vi.fn(),
    release: () => release?.(),
  };
});

vi.mock("../../src/learning/CourseLessonDrawer.tsx", async () => {
  drawerModule.loaded();
  await drawerModule.gate;

  return {
    CourseLessonDrawer: ({
      children,
      drawerProps,
      resizeHandle,
    }: {
      children: ReactNode;
      drawerProps: { open?: boolean };
      resizeHandle?: ReactNode;
    }) => (
      <div
        data-testid="course-lesson-drawer-runtime"
        data-open={String(drawerProps.open)}
      >
        {resizeHandle}
        {children}
      </div>
    ),
  };
});

import { DeferredCourseLessonDrawer } from "../../src/learning/DeferredCourseLessonDrawer.tsx";

describe("DeferredCourseLessonDrawer", () => {
  it("loads on first request and stays mounted after the drawer closes", async () => {
    const { rerender } = render(
      <DeferredCourseLessonDrawer
        requested={false}
        drawerProps={{ open: false }}
        contentProps={{}}
        resizeHandle={<span>Resize lessons</span>}
      >
        <span>Visible curriculum</span>
      </DeferredCourseLessonDrawer>,
    );

    expect(drawerModule.loaded).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("course-lesson-drawer-runtime"),
    ).not.toBeInTheDocument();

    rerender(
      <DeferredCourseLessonDrawer
        requested
        drawerProps={{ open: true }}
        contentProps={{}}
        resizeHandle={<span>Resize lessons</span>}
      >
        <span>Visible curriculum</span>
      </DeferredCourseLessonDrawer>,
    );

    await waitFor(() => expect(drawerModule.loaded).toHaveBeenCalledOnce());
    expect(
      screen.queryByTestId("course-lesson-drawer-runtime"),
    ).not.toBeInTheDocument();

    await act(async () => drawerModule.release());

    expect(
      await screen.findByTestId("course-lesson-drawer-runtime"),
    ).toHaveAttribute("data-open", "true");

    rerender(
      <DeferredCourseLessonDrawer
        requested
        drawerProps={{ open: false }}
        contentProps={{}}
        resizeHandle={<span>Resize lessons</span>}
      >
        <span>Visible curriculum</span>
      </DeferredCourseLessonDrawer>,
    );

    expect(screen.getByTestId("course-lesson-drawer-runtime")).toHaveAttribute(
      "data-open",
      "false",
    );
    expect(drawerModule.loaded).toHaveBeenCalledOnce();
    expect(screen.getByText("Resize lessons")).toBeInTheDocument();
    expect(screen.getByText("Visible curriculum")).toBeInTheDocument();
  });
});
