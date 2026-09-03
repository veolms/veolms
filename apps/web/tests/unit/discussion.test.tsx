import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CommentCard } from "../../src/learning/CommentCard.tsx";
import { hasCommentToolbarOverflow } from "../../src/learning/CommentFormattingToolbar.tsx";
import {
  Discussion,
  getDiscussionComposerViewportGeometry,
} from "../../src/learning/Discussion.tsx";

const uploadAttachment = vi.hoisted(() =>
  vi.fn(async (file: File) => ({
    url: `/api/v1/dev/discussion-uploads/${encodeURIComponent(file.name)}`,
    fileName: file.name,
    mediaType: file.type.startsWith("video/")
      ? ("video" as const)
      : ("image" as const),
    mimeType: file.type,
    size: file.size,
  })),
);

vi.mock("../../src/services/discussion", () => ({
  discussionService: { uploadAttachment },
}));

describe("CommentCard", () => {
  it("tracks its pressed state and delegates like changes", () => {
    const onLike = vi.fn();
    render(
      <CommentCard
        comment={{
          id: 7,
          name: "Alex Morgan",
          time: "Just now",
          avatar: "/alex.jpg",
          text: "Clear explanation.",
          likes: 3,
          replies: 2,
        }}
        onLike={onLike}
      />,
    );

    const like = screen.getByRole("button", { name: "Like" });
    expect(like).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(onLike).toHaveBeenLastCalledWith(7, true);

    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(onLike).toHaveBeenLastCalledWith(7, false);
  });

  it("uses the full comment row as a subtle discussion-thread trigger", () => {
    const onOpenThread = vi.fn();
    const { container } = render(
      <CommentCard
        comment={{
          id: 71,
          name: "Alex Morgan",
          time: "Just now",
          avatar: "/alex.jpg",
          text: "Clear explanation.",
          likes: 3,
        }}
        onLike={vi.fn()}
        onOpenThread={onOpenThread}
      />,
    );

    const entry = container.querySelector<HTMLElement>(
      "[data-discussion-thread-trigger]",
    );
    if (!entry) throw new Error("Expected a discussion thread trigger");

    expect(entry).toHaveAttribute("data-discussion-thread-trigger", "true");
    expect(entry).toHaveClass(
      "hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]",
    );
    expect(entry).toHaveClass(
      "active:bg-[color-mix(in_srgb,var(--text)_7%,transparent)]",
    );
    expect(entry).not.toHaveClass("border-b");
    expect(entry).toHaveClass("-mx-3", "px-3", "sm:-mx-4", "sm:px-4");
    expect(entry).toHaveClass("py-3.5", "sm:py-4");

    fireEvent.click(entry);
    expect(onOpenThread).toHaveBeenCalledWith(71);
  });

  it("keeps timestamps and overflow actions in comment and reply headers", () => {
    const { container } = render(
      <CommentCard
        comment={{
          id: 8,
          name: "Alex Morgan",
          time: "2 hours ago",
          avatar: "/alex.jpg",
          text: "Clear explanation.",
          likes: 3,
          replies: 1,
          repliesExpanded: true,
          thread: [
            {
              id: 9,
              name: "Sam Lee",
              time: "45 minutes ago",
              avatar: "/sam.jpg",
              text: "Agreed.",
              likes: 1,
            },
          ],
        }}
        onLike={vi.fn()}
      />,
    );

    const commentMeta = container.querySelector<HTMLElement>(
      "[data-comment-meta]",
    );
    const commentEngagement = container.querySelector<HTMLElement>(
      "[data-comment-engagement]",
    );
    const replyMeta = container.querySelector<HTMLElement>("[data-reply-meta]");
    const replyEngagement = container.querySelector<HTMLElement>(
      "[data-reply-engagement]",
    );

    if (!commentMeta || !commentEngagement || !replyMeta || !replyEngagement) {
      throw new Error("Expected comment and reply metadata rows");
    }

    expect(within(commentMeta).getByText("2 hours ago")).toBeVisible();
    expect(
      within(commentMeta).getByRole("button", {
        name: "More actions for Alex Morgan",
      }),
    ).toBeVisible();
    expect(
      commentMeta.querySelector("[data-comment-time-separator]"),
    ).toHaveTextContent("·");
    expect(within(commentEngagement).queryByText("2 hours ago")).toBeNull();
    expect(commentMeta).toHaveClass("pr-9");
    expect(commentMeta).not.toHaveClass("min-h-9");
    expect(commentMeta.querySelector("h2")).toHaveClass(
      "text-sm",
      "sm:text-[15px]",
    );
    expect(
      within(commentMeta).getByRole("button", {
        name: "More actions for Alex Morgan",
      }).parentElement,
    ).toHaveClass("absolute", "-right-1");

    expect(within(replyMeta).getByText("45 minutes ago")).toBeVisible();
    expect(
      within(replyMeta).getByRole("button", {
        name: "More actions for Sam Lee",
      }),
    ).toBeVisible();
    expect(
      replyMeta.querySelector("[data-reply-time-separator]"),
    ).toHaveTextContent("·");
    expect(within(replyEngagement).queryByText("45 minutes ago")).toBeNull();
    expect(replyMeta).toHaveClass("pr-9");
    expect(replyMeta).not.toHaveClass("min-h-9");
  });

  it("uses colored trailing icons for comments, notes, and Q&As", () => {
    const { container, rerender } = render(
      <CommentCard
        comment={{
          id: 10,
          name: "Ashi Singh",
          time: "Just now",
          avatar: "/ashi.jpg",
          text: "Remember this.",
          likes: 0,
          entryKind: "note",
        }}
        onLike={vi.fn()}
      />,
    );

    let meta = container.querySelector<HTMLElement>("[data-comment-meta]");
    if (!meta) throw new Error("Expected comment metadata row");
    expect(within(meta).queryByText("Note")).toBeNull();
    expect(within(meta).getByRole("img", { name: "Note" })).toBeVisible();
    expect(
      within(meta).getByText("Just now").nextElementSibling,
    ).toHaveAttribute("aria-label", "Note");

    rerender(
      <CommentCard
        comment={{
          id: 11,
          name: "Ashi Singh",
          time: "Just now",
          avatar: "/ashi.jpg",
          text: "Why is this true?",
          likes: 0,
          entryKind: "question",
        }}
        onLike={vi.fn()}
      />,
    );

    meta = container.querySelector<HTMLElement>("[data-comment-meta]");
    if (!meta) throw new Error("Expected comment metadata row");
    expect(within(meta).queryByText("Q&A")).toBeNull();
    expect(within(meta).getByRole("img", { name: "Q&A" })).toBeVisible();

    rerender(
      <CommentCard
        comment={{
          id: 12,
          name: "Ashi Singh",
          time: "Just now",
          avatar: "/ashi.jpg",
          text: "A regular comment.",
          likes: 0,
          entryKind: "comment",
        }}
        onLike={vi.fn()}
      />,
    );

    meta = container.querySelector<HTMLElement>("[data-comment-meta]");
    if (!meta) throw new Error("Expected comment metadata row");
    expect(within(meta).queryByText("Comment")).toBeNull();
    expect(within(meta).getByRole("img", { name: "Comment" })).toBeVisible();
    expect(
      within(meta).getByText("Just now").nextElementSibling,
    ).toHaveAttribute("data-entry-kind-icon", "comment");
    expect(within(meta).getByRole("img", { name: "Comment" })).toHaveClass(
      "text-sky-700",
      "[[data-theme=dark]_&]:text-sky-400",
    );
    expect(
      within(meta)
        .getByRole("img", { name: "Comment" })
        .querySelector("[data-comment-entry-icon]"),
    ).toBeInTheDocument();
    expect(
      within(meta)
        .getByRole("img", { name: "Comment" })
        .querySelector("[data-reply-icon]"),
    ).not.toBeInTheDocument();
  });

  it("uses icon-only curved reply actions with accessible labels", () => {
    const { container } = render(
      <CommentCard
        comment={{
          id: 14,
          name: "Alex Morgan",
          time: "2 hours ago",
          avatar: "/alex.jpg",
          text: "Clear explanation.",
          likes: 3,
          replies: 1,
          repliesExpanded: true,
          thread: [
            {
              id: 15,
              name: "Sam Lee",
              time: "45 minutes ago",
              avatar: "/sam.jpg",
              text: "Agreed.",
              likes: 1,
            },
          ],
        }}
        onLike={vi.fn()}
      />,
    );

    const replyActions = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-reply-action]"),
    );
    expect(replyActions).toHaveLength(2);
    replyActions.forEach((action) => {
      expect(action).toHaveAccessibleName("Reply");
      expect(action).toHaveAttribute("title", "Reply");
      expect(action).toHaveTextContent("");
      const icon = action.querySelector("[data-reply-icon]");
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute("width", "20");
      expect(icon).toHaveClass("scale-x-[1.16]");
    });
  });

  it("offers sharing for every entry while keeping owner actions scoped", async () => {
    const { unmount } = render(
      <CommentCard
        comment={{
          id: 10,
          name: "Ashi Singh",
          time: "Just now",
          avatar: "/ashi.jpg",
          text: "My comment",
          likes: 0,
          isOwn: true,
        }}
        onLike={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Ashi Singh" }),
    );
    const ownMenu = await screen.findByRole("menu", {
      name: "Comment actions for Ashi Singh",
    });
    expect(
      within(ownMenu).getByRole("menuitem", { name: "Edit comment" }),
    ).toBeVisible();
    expect(
      within(ownMenu).getByRole("menuitem", { name: "Share comment" }),
    ).toBeVisible();
    expect(
      within(ownMenu).getByRole("menuitem", { name: "Delete comment" }),
    ).toBeVisible();
    expect(
      within(ownMenu).queryByRole("menuitem", { name: "Report comment" }),
    ).toBeNull();

    unmount();
    render(
      <CommentCard
        comment={{
          id: 11,
          name: "Rohit Sharma",
          time: "2 hours ago",
          avatar: "/rohit.jpg",
          text: "Someone else's comment",
          likes: 2,
        }}
        onLike={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Rohit Sharma" }),
    );
    const otherMenu = await screen.findByRole("menu", {
      name: "Comment actions for Rohit Sharma",
    });
    expect(
      within(otherMenu).getByRole("menuitem", { name: "Share comment" }),
    ).toBeVisible();
    expect(
      within(otherMenu).getByRole("menuitem", { name: "Report comment" }),
    ).toBeVisible();
    expect(
      within(otherMenu).queryByRole("menuitem", { name: "Delete comment" }),
    ).toBeNull();
  });

  it("hides an owned comment optimistically and restores it with Undo", async () => {
    const onDelete = vi.fn();
    const { container } = render(
      <CommentCard
        comment={{
          id: 12,
          name: "Ashi Singh",
          time: "Just now",
          avatar: "/ashi.jpg",
          text: "Keep this comment",
          likes: 0,
          isOwn: true,
        }}
        onLike={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Ashi Singh" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Delete comment" }),
    );

    const undo = await screen.findByRole(
      "button",
      { name: "Undo deletion of Ashi Singh's entry" },
      { timeout: 1_500 },
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(container.querySelector("[data-deletion-pending]"))?.toHaveAttribute(
      "data-deletion-pending",
      "true",
    );

    fireEvent.click(undo);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Undo deletion/ }),
      ).toBeNull();
    });
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Keep this comment")).toBeVisible();
  });
});

describe("comment formatting toolbar", () => {
  it("shows the trailing separator only for meaningful horizontal overflow", () => {
    expect(hasCommentToolbarOverflow(320, 320)).toBe(false);
    expect(hasCommentToolbarOverflow(321, 320)).toBe(false);
    expect(hasCommentToolbarOverflow(322, 320)).toBe(true);
  });
});

describe("discussion composer viewport geometry", () => {
  it("keeps the drawer between the player and an Android on-screen keyboard", () => {
    expect(getDiscussionComposerViewportGeometry(779, 430, 0, 250)).toEqual({
      collapsedSnapPoint: 180,
      keyboardInset: 349,
      visualViewportHeight: 430,
    });
  });

  it("accounts for a panned visual viewport", () => {
    expect(getDiscussionComposerViewportGeometry(779, 430, 36, 250)).toEqual({
      collapsedSnapPoint: 216,
      keyboardInset: 313,
      visualViewportHeight: 430,
    });
  });

  it("clamps a stale visual viewport after entering document fullscreen", () => {
    expect(getDiscussionComposerViewportGeometry(600, 779, 0, 250)).toEqual({
      collapsedSnapPoint: 350,
      keyboardInset: 0,
      visualViewportHeight: 600,
    });
  });

  it("clamps an OEM viewport offset that extends beyond the layout viewport", () => {
    expect(getDiscussionComposerViewportGeometry(600, 430, 300, 250)).toEqual({
      collapsedSnapPoint: 350,
      keyboardInset: 0,
      visualViewportHeight: 430,
    });
  });
});

describe("Discussion", () => {
  it("opens a swipeable discussion thread from the whole comment and closes it from the header", async () => {
    render(<Discussion persistenceKey="discussion-thread-panel-test" />);

    fireEvent.click(
      screen.getByRole("document", { name: "Comment by Rohit Sharma" }),
    );

    const thread = await screen.findByRole("dialog", {
      name: "Discussion thread",
    });
    expect(
      within(thread).getByRole("heading", { name: "Discussion thread" }),
    ).toBeVisible();
    expect(
      within(thread).getByRole("document", {
        name: "Discussion entry by Rohit Sharma",
      }),
    ).toBeVisible();
    expect(
      within(thread).getByRole("document", { name: "Reply by Ashi Singh" }),
    ).toBeVisible();
    const replyTextbox = within(thread).getByRole("textbox", {
      name: "Reply to Rohit Sharma",
    });
    expect(replyTextbox).toBeVisible();
    await waitFor(() => expect(replyTextbox).toHaveFocus());
    const activeThreadSlide = thread.querySelector<HTMLElement>(
      ".swiper-slide-active",
    );
    if (!activeThreadSlide) throw new Error("Expected an active thread slide");
    expect(activeThreadSlide.firstElementChild).toHaveClass("px-4", "pb-4");
    expect(activeThreadSlide.firstElementChild).not.toHaveClass(
      "px-3",
      "sm:px-6",
    );
    const threadReplyActions = Array.from(
      activeThreadSlide.querySelectorAll<HTMLButtonElement>(
        "[data-reply-action]",
      ),
    );
    expect(threadReplyActions).toHaveLength(3);
    expect(threadReplyActions[0]).toHaveTextContent("2 replies");
    threadReplyActions.slice(1).forEach((action) => {
      expect(action).toHaveAccessibleName("Reply");
      expect(action).toHaveTextContent("");
      const icon = action.querySelector("[data-reply-icon]");
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute("width", "20");
      expect(icon).toHaveClass("scale-x-[1.16]");
    });
    const rootEntry = within(thread)
      .getByRole("document", { name: "Discussion entry by Rohit Sharma" })
      .closest("article");
    expect(rootEntry).toHaveClass("mb-1", "pt-3", "pb-4");
    const replyEntry = within(thread)
      .getByRole("document", { name: "Reply by Ashi Singh" })
      .closest("[data-thread-reply-entry]");
    expect(replyEntry).not.toHaveClass("border-b");
    expect(replyEntry).toHaveClass("py-2.5");

    const replyComposer = replyTextbox.closest("[data-thread-reply-composer]");
    expect(replyComposer).toHaveClass(
      "-mx-4",
      "-mb-4",
      "mt-0",
      "grid-rows-[auto_auto]",
      "rounded-t-xl",
      "sm:mx-0",
      "sm:mb-0",
      "sm:rounded-xl",
    );
    expect(replyComposer).not.toHaveClass("mt-3");
    expect(replyComposer).not.toHaveClass("rounded-xl");
    expect(replyComposer).not.toHaveClass("h-40", "sm:h-44");
    const replyEditor = replyComposer?.querySelector<HTMLElement>(
      "[data-discussion-atomic-editor]",
    );
    expect(replyEditor).toHaveAttribute("data-auto-grow", "true");

    const replyToolbar = within(thread).getByRole("toolbar", {
      name: "Comment formatting",
    });
    expect(replyToolbar).toHaveClass(
      "swiper-no-swiping",
      "touch-pan-x",
      "overflow-x-auto",
    );
    expect(replyToolbar).toHaveAttribute("data-base-ui-swipe-ignore");
    expect(replyToolbar).toHaveAttribute("data-learning-swipe-ignore");
    expect(replyToolbar.parentElement).toHaveClass(
      "min-w-0",
      "flex-1",
      "basis-0",
      "overflow-hidden",
    );
    expect(
      within(thread).getByRole("button", { name: "Post reply" }),
    ).toHaveClass("shrink-0");
    const expandThread = within(thread).getByRole("button", {
      name: "Expand discussion thread",
    });
    expect(expandThread).toHaveAttribute("data-thread-panel-size-toggle");
    expect(
      expandThread.querySelector('[data-thread-panel-size-icon="expand"]'),
    ).toBeInTheDocument();
    expect(thread).toHaveAttribute("data-swipe-direction", "right");
    expect(thread).toHaveClass(
      "bg-[color-mix(in_srgb,var(--app-shell)_92%,transparent)]",
      "[--drawer-bleed-background:color-mix(in_srgb,var(--app-shell)_92%,transparent)]",
      "[--stack-scale:1]!",
      "backdrop-blur-[calc(var(--sidebar-floating-base-blur,6px)+var(--sidebar-backdrop-blur,8px))]",
      "backdrop-saturate-[1.2]",
      "transform-none!",
      "translate-x-0!",
      "transition-[translate]!",
      "duration-300!",
      "ease-out!",
      "will-change-[translate]",
      "data-starting-style:translate-x-[calc(100%+2px)]!",
      "data-ending-style:translate-x-[calc(100%+2px)]!",
      "data-ending-style:duration-240!",
      "data-ending-style:ease-out!",
    );
    expect(thread).not.toHaveClass(
      "bg-[color-mix(in_srgb,var(--app-shell)_74%,transparent)]",
      "bg-[color-mix(in_srgb,var(--app-shell)_84%,transparent)]",
      "bg-[color-mix(in_srgb,var(--app-shell)_98%,transparent)]",
      "transition-transform!",
      "ease-[cubic-bezier(0.16,1,0.3,1)]!",
      "ease-[cubic-bezier(0.22,1,0.36,1)]!",
      "transition-[top,left,width,height,transform,opacity,filter]!",
    );
    expect(thread.style.position).toBe("absolute");
    expect(thread.style.top).toBe("auto");
    expect(thread.style.left).toBe("auto");
    expect(thread.style.right).toBe("0px");
    expect(thread.style.bottom).toBe("0px");
    expect(thread.style.getPropertyValue("--closed-transform")).toBe("");
    const drawerViewport = thread.closest<HTMLElement>(
      '[data-slot="drawer-viewport"]',
    );
    expect(drawerViewport).toHaveAttribute("data-modal", "false");
    expect(drawerViewport?.style.clipPath).toBe("");
    expect(drawerViewport?.style.top).not.toBe("");
    expect(drawerViewport?.style.left).not.toBe("");
    expect(drawerViewport?.style.width).not.toBe("");
    expect(drawerViewport?.style.height).not.toBe("");
    expect(drawerViewport?.style.right).toBe("auto");
    expect(drawerViewport?.style.bottom).toBe("auto");
    expect(drawerViewport?.style.overflow).toBe("hidden");
    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull();
    expect(thread).toHaveAttribute("data-base-ui-swipe-ignore");
    const closeThread = within(thread).getByRole("button", {
      name: "Close discussion thread",
    });
    expect(closeThread.closest("header")).toHaveClass(
      "h-auto",
      "gap-0",
      "px-4",
      "pt-3.5",
      "pb-1.75",
      "sm:h-14",
      "sm:py-0",
    );
    expect(closeThread.closest("header")).not.toHaveClass(
      "pt-2",
      "sm:h-18",
      "sm:px-6",
    );
    expect(thread).toHaveAttribute("data-panel-surface-frozen", "true");
    expect(
      closeThread
        .closest("header")
        ?.querySelector("[data-thread-panel-divider]"),
    ).toHaveClass("ml-0.75", "mr-3");
    const threadScrollport = thread.querySelector<HTMLElement>(
      ".learning-comment-formatting-scrollport",
    );
    expect(threadScrollport).toHaveClass("min-w-0", "overflow-x-hidden");
    const rootActionMenu = within(thread)
      .getByRole("button", { name: "More actions for Rohit Sharma" })
      .closest("div");
    expect(rootActionMenu).toHaveClass("right-0");
    expect(rootActionMenu).not.toHaveClass("-right-1");
    expect(
      within(thread).getByRole("separator", {
        name: "Resize discussion thread",
      }),
    ).toHaveAttribute("aria-orientation", "vertical");
    const heightResizeHandle = within(thread).getByRole("separator", {
      name: "Resize discussion thread height",
    });
    expect(heightResizeHandle).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
    expect(heightResizeHandle.firstElementChild).toHaveClass(
      "bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_54%,var(--border))_16%,color-mix(in_srgb,var(--accent)_54%,var(--border))_84%,transparent)]",
      "opacity-0",
      "group-hover/resize-top:opacity-100",
    );
    expect(heightResizeHandle.firstElementChild).not.toHaveClass(
      "group-focus-visible/resize-top:opacity-100",
    );
    const widthResizeHandle = within(thread).getByRole("separator", {
      name: "Resize discussion thread",
    });
    expect(widthResizeHandle.firstElementChild).toHaveClass(
      "bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--accent)_54%,var(--border))_16%,color-mix(in_srgb,var(--accent)_54%,var(--border))_84%,transparent)]",
      "opacity-0",
      "group-hover/resize:opacity-100",
    );
    expect(widthResizeHandle.firstElementChild).not.toHaveClass(
      "group-focus-visible/resize:opacity-100",
    );
    fireEvent.keyDown(heightResizeHandle, { key: "ArrowDown" });
    expect(heightResizeHandle).toHaveAttribute("aria-valuenow");
    expect(expandThread).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(expandThread);
    expect(
      within(thread).getByRole("button", {
        name: "Restore discussion thread",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(thread)
        .getByRole("button", { name: "Restore discussion thread" })
        .querySelector('[data-thread-panel-size-icon="restore"]'),
    ).toBeInTheDocument();
    expect(thread).toHaveAttribute("data-panel-expanded", "true");
    expect(
      within(thread).getByRole("region", {
        name: "Swipe between discussion threads",
      }),
    ).toHaveAttribute("data-base-ui-swipe-ignore");
    expect(
      within(thread).getByRole("region", {
        name: "Swipe between discussion threads",
      }),
    ).toHaveAttribute("data-learning-swipe-ignore");

    const desktopSwiperElement = within(thread)
      .getByRole("region", { name: "Swipe between discussion threads" })
      .querySelector<
        HTMLElement & {
          swiper?: { slideNext: (speed?: number) => void };
        }
      >(".swiper");
    expect(desktopSwiperElement?.swiper).toBeDefined();
    React.act(() => desktopSwiperElement?.swiper?.slideNext(0));
    const desktopNextReply = await within(thread).findByRole("textbox", {
      name: "Reply to Neha Patel",
    });
    await waitFor(() => expect(desktopNextReply).toHaveFocus());

    fireEvent.click(
      within(thread).getByRole("button", {
        name: "Close discussion thread",
      }),
    );
    expect(thread).toHaveAttribute("data-panel-expanded", "true");
    expect(thread).toHaveAttribute("data-panel-surface-frozen", "true");
    expect(thread.style.top).toBe("0px");
    expect(thread.style.bottom).toBe("auto");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Discussion thread" }),
      ).toBeNull();
    });
  }, 30_000);

  it("keeps the desktop thread open during page interaction and closes it with Escape", async () => {
    render(<Discussion persistenceKey="discussion-thread-non-modal-test" />);

    fireEvent.click(
      screen.getByRole("document", { name: "Comment by Rohit Sharma" }),
    );
    const thread = await screen.findByRole("dialog", {
      name: "Discussion thread",
    });

    const notesFilter = screen.getByRole("button", { name: "Notes" });
    fireEvent.pointerDown(notesFilter);
    fireEvent.click(notesFilter);

    expect(notesFilter).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("dialog", { name: "Discussion thread" })).toBe(
      thread,
    );

    fireEvent.keyDown(thread, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Discussion thread" }),
      ).toBeNull();
    });
  });

  it("opens the thread composer from the comment Reply action", async () => {
    render(<Discussion persistenceKey="discussion-thread-reply-test" />);

    const rohitComment = screen
      .getByRole("document", { name: "Comment by Rohit Sharma" })
      .closest("article");
    if (!rohitComment) throw new Error("Expected Rohit's comment card");

    const engagement = rohitComment.querySelector<HTMLElement>(
      '[data-comment-engagement="true"]',
    );
    if (!engagement) throw new Error("Expected Rohit's engagement controls");

    fireEvent.click(within(engagement).getByRole("button", { name: "Reply" }));

    const thread = await screen.findByRole("dialog", {
      name: "Discussion thread",
    });
    expect(
      within(thread).getByRole("textbox", { name: "Reply to Rohit Sharma" }),
    ).toBeVisible();
  });

  it("uses a two-stage bottom drawer for discussion threads on phones", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 639px)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    })) as typeof window.matchMedia;

    try {
      render(<Discussion persistenceKey="discussion-mobile-thread-test" />);
      fireEvent.click(
        screen.getByRole("document", { name: "Comment by Rohit Sharma" }),
      );

      const thread = await screen.findByRole("dialog", {
        name: "Discussion thread",
      });
      expect(thread).toHaveAttribute("data-swipe-direction", "down");
      expect(
        within(thread).getByRole("heading", { name: "Discussion thread" }),
      ).toHaveClass("mr-auto", "text-lg", "font-bold");
      expect(
        within(thread)
          .getByRole("heading", { name: "Discussion thread" })
          .closest("header"),
      ).toHaveClass("h-auto", "pt-3.5", "pb-1.75", "sm:h-14", "sm:py-0");
      expect(
        thread.closest<HTMLElement>('[data-slot="drawer-viewport"]')?.style
          .clipPath,
      ).toBe("");
      expect(
        within(thread).queryByRole("button", {
          name: "Expand discussion thread",
        }),
      ).toBeNull();
      expect(
        within(thread).queryByRole("button", {
          name: "Close discussion thread",
        }),
      ).toBeNull();
      const swipeRegion = within(thread).getByRole("region", {
        name: "Swipe between discussion threads",
      });
      expect(swipeRegion).toHaveAttribute("data-base-ui-swipe-ignore");
      expect(swipeRegion).toHaveAttribute("data-learning-swipe-ignore");
      expect(swipeRegion).toHaveClass("touch-pan-y");
      const initialReply = within(thread).getByRole("textbox", {
        name: "Reply to Rohit Sharma",
      });
      await waitFor(() => expect(initialReply).toHaveFocus());

      const mobileSwiperElement = swipeRegion.querySelector<
        HTMLElement & {
          swiper?: { slideNext: (speed?: number) => void };
        }
      >(".swiper");
      expect(mobileSwiperElement?.swiper).toBeDefined();
      React.act(() => mobileSwiperElement?.swiper?.slideNext(0));
      const mobileNextReply = await within(thread).findByRole("textbox", {
        name: "Reply to Neha Patel",
      });
      expect(mobileNextReply).not.toHaveFocus();
      expect(
        thread.querySelector('[data-slot="drawer-swipe-handle"]'),
      ).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("renders only the entry-type filters without a sort control", () => {
    render(<Discussion persistenceKey="discussion-filter-controls-test" />);

    const filters = screen.getByRole("group", {
      name: "Filter discussion entries",
    });
    expect(
      within(filters)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["All", "Notes", "Comments", "Q&As"]);
    expect(
      screen.queryByRole("button", { name: /Sort discussion/i }),
    ).not.toBeInTheDocument();
  });

  it("filters the unified feed by entry type", () => {
    const { container } = render(
      <Discussion persistenceKey="discussion-entry-filter-test" />,
    );
    const visibleKinds = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-discussion-entry]"),
      ).map((entry) => entry.dataset.discussionEntry);

    expect(visibleKinds()).toEqual(["comment", "question", "note", "question"]);

    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(visibleKinds()).toEqual(["note"]);

    fireEvent.click(screen.getByRole("button", { name: "Q&As" }));
    expect(visibleKinds()).toEqual(["question", "question"]);
  });

  it("opens the rich discussion composer from its compact state", async () => {
    render(<Discussion persistenceKey="discussion-composer-open-test" />);

    const [openComposer] = screen.getAllByRole("button", {
      name: "Open discussion composer",
    });
    if (!openComposer) throw new Error("Expected the compact composer trigger");
    fireEvent.click(openComposer);

    expect(
      await screen.findByRole("textbox", { name: "Write a comment" }),
    ).toBeInTheDocument();
  });

  it("closes the rich discussion composer with Escape", async () => {
    render(<Discussion persistenceKey="discussion-composer-escape-test" />);

    const [openComposer] = screen.getAllByRole("button", {
      name: "Open discussion composer",
    });
    if (!openComposer) throw new Error("Expected the compact composer trigger");
    fireEvent.click(openComposer);

    const editor = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    fireEvent.keyDown(editor, { key: "Escape" });

    expect(
      screen.queryByRole("textbox", { name: "Write a comment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Open discussion composer" }),
    ).not.toHaveLength(0);
  });

  it("uses the whole compact surface to open, hides its send action, and preserves the first draft line after an outside click", async () => {
    const persistenceKey = "discussion-composer-outside-click-test";
    const storageBase = `veolms-learning-${persistenceKey}-discussion`;
    sessionStorage.setItem(
      `${storageBase}-markdown-draft-v1`,
      JSON.stringify({
        format: "markdown",
        markdown: "First draft line\n\nSecond draft line",
        plainText: "First draft line\n\nSecond draft line",
      }),
    );

    const { container } = render(
      <Discussion persistenceKey={persistenceKey} />,
    );
    const compactComposer = screen.getByRole("button", {
      name: "Open discussion composer",
    });
    expect(compactComposer).toHaveTextContent("First draft line");
    expect(compactComposer).not.toHaveTextContent("Second draft line");
    expect(
      screen.queryByRole("button", { name: "Send discussion entry" }),
    ).toBeNull();

    const avatar = compactComposer.querySelector("img");
    if (!avatar) throw new Error("Expected the compact composer avatar");
    fireEvent.click(avatar);
    expect(
      await screen.findByRole("textbox", { name: "Write a comment" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Notes" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Write a comment" }),
      ).toBeNull();
    });
    expect(
      container.querySelector("[data-compact-comment-composer]"),
    ).toHaveTextContent("First draft line");
  });

  it("uses a bottom Simple Editor toolbar without block controls", async () => {
    render(<Discussion persistenceKey="discussion-simple-editor-test" />);

    const [openComposer] = screen.getAllByRole("button", {
      name: "Open discussion composer",
    });
    if (!openComposer) throw new Error("Expected the compact composer trigger");
    fireEvent.click(openComposer);

    await screen.findByRole("textbox", { name: "Write a comment" });
    const toolbar = screen.getByRole("toolbar", {
      name: "Comment formatting",
    });

    for (const label of [
      "Undo",
      "Redo",
      "Bold",
      "Italic",
      "Highlight",
      "Add or edit link",
      "Attach image or video",
      "Inline code",
      "Code block",
    ]) {
      expect(
        within(toolbar).getByRole("button", { name: label }),
      ).toBeVisible();
    }

    expect(
      screen.queryByRole("button", { name: "Add block" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Drag block/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose image or video")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /Post type:/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Visibility:/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Next: choose publishing options",
      }),
    ).toBeDisabled();

    fireEvent.click(
      within(toolbar).getByRole("button", { name: "Add or edit link" }),
    );
    const linkInput = screen.getByRole("textbox", { name: "Link URL" });
    expect(linkInput).toBeVisible();
    fireEvent.keyDown(linkInput, { key: "Escape" });
    expect(
      screen.getByRole("textbox", { name: "Write a comment" }),
    ).toBeInTheDocument();
  });

  it("loads the complete Markdown comment into the main Atomic editor", async () => {
    const persistenceKey = "discussion-rich-edit-test";
    const storageBase = `veolms-learning-${persistenceKey}-discussion`;
    sessionStorage.setItem(
      `${storageBase}-markdown-entries-v1`,
      JSON.stringify([
        {
          id: 9_001,
          name: "Ashi Singh",
          time: "Just now",
          avatar: "/assets/sofia-avatar-160.webp",
          text: "Rich body to edit",
          content: {
            format: "markdown",
            markdown:
              "Rich body to edit\n\n![Editable diagram](/api/v1/dev/discussion-uploads/edited-image.png)",
            plainText: "Rich body to edit",
          },
          visibility: "unlisted",
          entryKind: "comment",
          likes: 0,
          isOwn: true,
        },
      ]),
    );
    sessionStorage.setItem(
      `${storageBase}-markdown-draft-v1`,
      JSON.stringify({
        format: "markdown",
        markdown: "Unfinished new comment",
        plainText: "Unfinished new comment",
      }),
    );

    const { container } = render(
      <Discussion persistenceKey={persistenceKey} />,
    );
    await screen.findByText("Rich body to edit");
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "More actions for Ashi Singh",
      })[0]!,
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit comment" }),
    );

    const editor = await screen.findByRole(
      "textbox",
      { name: "Edit comment" },
      { timeout: 8_000 },
    );
    expect(editor).toHaveTextContent("Rich body to edit");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Next: choose publishing options",
      }),
    );
    expect(screen.getByRole("radio", { name: "Unlisted" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Comment" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(
      container.querySelector("[data-comment-composer-surface] textarea"),
    ).toBeNull();

    fireEvent.keyDown(screen.getByRole("group", { name: "Visibility" }), {
      key: "Escape",
    });
    expect(
      screen.getByRole("textbox", { name: "Edit comment" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit comment" }), {
      key: "Escape",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Edit comment" }),
      ).toBeNull();
    });
    expect(screen.getByText("Unfinished new comment")).toBeVisible();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "More actions for Ashi Singh",
      })[0]!,
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit comment" }),
    );
    await screen.findByRole(
      "textbox",
      { name: "Edit comment" },
      { timeout: 1_500 },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Next: choose publishing options",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Edit comment" }),
      ).toBeNull();
    });
    const storedEntries = JSON.parse(
      sessionStorage.getItem(`${storageBase}-markdown-entries-v1`) ?? "[]",
    ) as Array<{ content?: { format?: string; markdown?: string } }>;
    expect(storedEntries[0]?.content).toMatchObject({ format: "markdown" });
    expect(storedEntries[0]?.content?.markdown).toContain(
      "![Editable diagram](/api/v1/dev/discussion-uploads/edited-image.png)",
    );
    expect(screen.getByText("Unfinished new comment")).toBeVisible();
  }, 30_000);

  it("keeps Next disabled for an empty draft and allows attachment-only posts after review", async () => {
    const { container } = render(
      <Discussion persistenceKey="discussion-attachment-only-test" />,
    );

    const [openComposer] = screen.getAllByRole("button", {
      name: "Open discussion composer",
    });
    if (!openComposer) throw new Error("Expected the compact composer trigger");
    fireEvent.click(openComposer);

    const next = await screen.findByRole("button", {
      name: "Next: choose publishing options",
    });
    expect(next).toBeDisabled();
    expect(screen.queryByText("Write a comment before posting.")).toBeNull();

    const file = new File(["image-data"], "diagram.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Choose image or video"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);
    const postAsGroup = screen.getByRole("group", { name: "Post as" });
    const visibilityGroup = screen.getByRole("group", { name: "Visibility" });
    expect(postAsGroup.compareDocumentPosition(visibilityGroup)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByText("Choose how to share")).not.toBeInTheDocument();
    const publicVisibility = screen.getByRole("radio", { name: "Public" });
    expect(publicVisibility).toBeChecked();
    const publicTooltipId = publicVisibility.getAttribute("aria-describedby");
    expect(publicTooltipId).toBeTruthy();
    expect(document.getElementById(publicTooltipId ?? "")).toHaveTextContent(
      "Everyone can see it.",
    );
    expect(
      screen.getByRole("tooltip", { name: "Everyone can see it." }),
    ).toBeInTheDocument();
    expect(publicVisibility.closest("label")).toHaveClass(
      "has-[:focus-visible]:outline-2",
    );
    expect(publicVisibility.closest("label")).not.toHaveClass(
      "focus-within:outline-2",
    );
    const unlistedVisibility = screen.getByRole("radio", { name: "Unlisted" });
    const unlistedTooltipId =
      unlistedVisibility.getAttribute("aria-describedby");
    expect(unlistedTooltipId).toBeTruthy();
    expect(document.getElementById(unlistedTooltipId ?? "")).toHaveTextContent(
      "Only the creator and people with the link can see it.",
    );
    const commentKind = screen.getByRole("radio", { name: "Comment" });
    expect(commentKind).toBeChecked();
    expect(commentKind.closest("label")).toHaveClass(
      "has-[:focus-visible]:outline-2",
    );
    expect(commentKind.closest("label")).not.toHaveClass(
      "focus-within:outline-2",
    );
    expect(screen.queryByRole("radio", { name: "Private" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Q&A" }));
    expect(screen.queryByRole("radio", { name: "Private" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Note" }));
    const privateVisibility = screen.getByRole("radio", { name: "Private" });
    expect(privateVisibility).toBeVisible();
    fireEvent.click(privateVisibility);
    expect(privateVisibility).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Q&A" }));
    expect(screen.queryByRole("radio", { name: "Private" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Public" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("textbox", { name: "Write a Q&A" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Next: choose publishing options",
      }),
    );
    expect(screen.queryByRole("radio", { name: "Private" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Public" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Q&A" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Post Q&A" }));

    await waitFor(() => {
      expect(
        container.querySelector('img[alt="diagram.png"]'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/posted\.$/i)).toBeNull();
  });

  it("inserts an image when the browser supplies it in a paste event", async () => {
    const { container } = render(
      <Discussion persistenceKey="discussion-image-paste-test" />,
    );

    const [openComposer] = screen.getAllByRole("button", {
      name: "Open discussion composer",
    });
    if (!openComposer) throw new Error("Expected the compact composer trigger");
    fireEvent.click(openComposer);

    const editor = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    const image = new File(["clipboard-image"], "clipboard.png", {
      type: "image/png",
    });

    fireEvent.paste(editor, {
      clipboardData: {
        files: [image],
        getData: () => "",
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => image,
          },
        ],
        types: ["Files"],
      },
    });

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledWith(image));
    expect(
      screen.getByRole("button", {
        name: "Next: choose publishing options",
      }),
    ).toBeEnabled();
  });

  it("keeps the attachment control in the mobile footer without duplicating it over the editor", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 639px)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    })) as typeof window.matchMedia;

    try {
      render(<Discussion persistenceKey="discussion-mobile-media-test" />);
      fireEvent.click(
        screen.getByRole("button", { name: "Open discussion composer" }),
      );

      const toolbar = await screen.findByRole("toolbar", {
        name: "Comment formatting",
      });
      expect(toolbar).toHaveClass(
        "learning-comment-formatting-scrollport",
        "h-full",
        "min-w-0",
        "flex-1",
        "overflow-x-auto",
      );
      expect(toolbar.parentElement).toHaveClass(
        "-my-2.5",
        "flex",
        "self-stretch",
      );
      expect(within(toolbar).getByRole("button", { name: "Undo" })).toHaveClass(
        "sm:hidden",
      );
      expect(within(toolbar).getByRole("button", { name: "Redo" })).toHaveClass(
        "sm:hidden",
      );
      const formattingGroup = toolbar.closest(
        "[data-comment-formatting-toolbar]",
      );
      expect(
        formattingGroup?.querySelectorAll(
          '[data-comment-toolbar-separator="leading"]',
        ),
      ).toHaveLength(1);
      expect(
        formattingGroup?.querySelector(
          '[data-comment-toolbar-separator="trailing"]',
        ),
      ).toBeNull();
      Object.defineProperties(toolbar, {
        clientWidth: { configurable: true, value: 120 },
        scrollWidth: { configurable: true, value: 280 },
      });
      window.dispatchEvent(new Event("resize"));
      await waitFor(() => {
        expect(
          formattingGroup?.querySelector(
            '[data-comment-toolbar-separator="trailing"]',
          ),
        ).toBeInTheDocument();
      });
      expect(
        within(toolbar).getByRole("button", {
          name: "Attach image or video",
        }),
      ).toBeVisible();
      expect(
        screen.getByLabelText("Choose image or video"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Add image or video" }),
      ).toBeNull();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("accepts a video as the complete content of a post", async () => {
    try {
      const { container } = render(
        <Discussion persistenceKey="discussion-video-only-test" />,
      );
      const [openComposer] = screen.getAllByRole("button", {
        name: "Open discussion composer",
      });
      if (!openComposer)
        throw new Error("Expected the compact composer trigger");
      fireEvent.click(openComposer);

      const next = await screen.findByRole("button", {
        name: "Next: choose publishing options",
      });
      const file = new File(["video-data"], "demo.mp4", {
        type: "video/mp4",
      });
      fireEvent.change(screen.getByLabelText("Choose image or video"), {
        target: { files: [file] },
      });

      await waitFor(() => expect(next).toBeEnabled());
      fireEvent.click(next);
      fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
      await waitFor(() => {
        expect(
          container.querySelector(
            'video[src="/api/v1/dev/discussion-uploads/demo.mp4"]',
          ),
        ).toBeInTheDocument();
      });
    } finally {
      uploadAttachment.mockClear();
    }
  });

  it("hides the mobile compact composer with the bottom navigation", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 639px)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    })) as typeof window.matchMedia;

    try {
      const { rerender } = render(
        <Discussion
          persistenceKey="discussion-mobile-scroll-hide-test"
          mobileBottomNavigation
          mobileBottomNavigationHidden
        />,
      );

      const compactComposer = await screen.findByTestId(
        "mobile-discussion-composer",
      );
      expect(compactComposer).toHaveAttribute("data-scroll-hidden", "true");
      expect(compactComposer).toHaveAttribute("aria-hidden", "true");
      expect(compactComposer).toHaveClass(
        "pointer-events-none",
        "invisible",
        "opacity-0",
      );

      rerender(
        <Discussion
          persistenceKey="discussion-mobile-scroll-hide-test"
          mobileBottomNavigation
          mobileBottomNavigationHidden={false}
        />,
      );

      expect(compactComposer).toHaveAttribute("data-scroll-hidden", "false");
      expect(compactComposer).toHaveAttribute("aria-hidden", "false");
      expect(compactComposer).toHaveClass(
        "visible",
        "translate-y-0",
        "opacity-100",
      );
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("keeps the mobile compact composer viewport-fixed outside transformed lesson content", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 639px)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    })) as typeof window.matchMedia;

    try {
      const { container } = render(
        <div data-learning-motion-stage>
          <article
            data-learning-lesson-content
            style={{ transform: "translate3d(0, 0, 0)" }}
          >
            <Discussion
              persistenceKey="discussion-mobile-fixed-layer-test"
              mobileBottomNavigation
              mobileBottomNavigationHidden={false}
            />
          </article>
        </div>,
      );

      const compactComposer = await screen.findByTestId(
        "mobile-discussion-composer",
      );
      const lessonContent = container.querySelector(
        "[data-learning-lesson-content]",
      );
      const motionStage = container.querySelector(
        "[data-learning-motion-stage]",
      );
      const composerLayer = container.querySelector(
        "[data-learning-mobile-composer-layer]",
      );

      expect(compactComposer).toBeVisible();
      expect(compactComposer).toHaveAttribute("data-scroll-hidden", "false");
      expect(lessonContent).not.toContainElement(compactComposer);
      expect(motionStage).toContainElement(compactComposer);
      expect(composerLayer).toHaveClass(
        "fixed",
        "inset-x-0",
        "box-border",
        "min-w-0",
        "max-w-full",
        "overflow-x-clip",
        "bottom-[calc(58px+var(--app-viewport-safe-area-bottom))]",
      );
      expect(composerLayer).not.toHaveClass("inset-0");
      expect(compactComposer).toHaveClass(
        "relative",
        "box-border",
        "min-w-0",
        "max-w-full",
        "overflow-x-clip",
      );
      expect(compactComposer).not.toHaveClass("absolute");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
