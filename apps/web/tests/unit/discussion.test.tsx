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
import {
  Discussion,
  getDiscussionComposerViewportGeometry,
} from "../../src/learning/Discussion.tsx";

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
      `${storageBase}-comment-draft`,
      JSON.stringify({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "First draft line" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Second draft line" }],
            },
          ],
        },
        text: "First draft line\nSecond draft line",
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

    const postType = screen.getByRole("button", {
      name: "Post type: Comment",
    });
    expect(postType).toHaveAttribute("data-compact-mobile", "true");
    expect(
      screen.getByRole("button", { name: "Visibility: Public" }),
    ).toHaveAttribute("data-compact-mobile", "true");

    fireEvent.click(postType);
    const postTypeMenu = await screen.findByRole("listbox", {
      name: "Post type",
    });
    fireEvent.keyDown(postTypeMenu, { key: "Escape" });
    expect(
      screen.getByRole("textbox", { name: "Write a comment" }),
    ).toBeInTheDocument();

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

  it("loads the complete rich comment into the main TipTap editor", async () => {
    const persistenceKey = "discussion-rich-edit-test";
    const storageBase = `veolms-learning-${persistenceKey}-discussion`;
    sessionStorage.setItem(
      `${storageBase}-posted-comments`,
      JSON.stringify([
        {
          id: 9_001,
          name: "Ashi Singh",
          time: "Just now",
          avatar: "/assets/sofia-avatar-160.webp",
          text: "Rich body to edit",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Rich body to edit" }],
              },
              {
                type: "image",
                attrs: {
                  src: "data:image/png;base64,edited-image",
                  alt: "Editable diagram",
                },
              },
            ],
          },
          visibility: "unlisted",
          entryKind: "comment",
          likes: 0,
          isOwn: true,
        },
      ]),
    );
    sessionStorage.setItem(
      `${storageBase}-comment-draft`,
      JSON.stringify({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Unfinished new comment" }],
            },
          ],
        },
        text: "Unfinished new comment",
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
      { timeout: 1_500 },
    );
    expect(editor).toHaveTextContent("Rich body to edit");
    expect(
      container.querySelector(
        '[data-comment-composer-surface] img[alt="Editable diagram"]',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Visibility: Unlisted" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(
      container.querySelector("[data-comment-composer-surface] textarea"),
    ).toBeNull();

    fireEvent.keyDown(editor, { key: "Escape" });
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
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Edit comment" }),
      ).toBeNull();
    });
    const storedEntries = JSON.parse(
      sessionStorage.getItem(`${storageBase}-posted-comments`) ?? "[]",
    ) as Array<{ content?: { content?: Array<{ type?: string }> } }>;
    expect(
      storedEntries[0]?.content?.content?.some((node) => node.type === "image"),
    ).toBe(true);
    expect(screen.getByText("Unfinished new comment")).toBeVisible();
  });

  it("keeps Post disabled for an empty draft and enables attachment-only posts", async () => {
    const { container } = render(
      <Discussion persistenceKey="discussion-attachment-only-test" />,
    );

    const [openComposer] = screen.getAllByRole("button", {
      name: "Open discussion composer",
    });
    if (!openComposer) throw new Error("Expected the compact composer trigger");
    fireEvent.click(openComposer);

    const post = await screen.findByRole("button", { name: "Post" });
    expect(post).toBeDisabled();
    expect(screen.queryByText("Write a comment before posting.")).toBeNull();

    const file = new File(["image-data"], "diagram.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Choose image or video"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(post).toBeEnabled());
    fireEvent.click(post);

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

    await waitFor(() => {
      expect(
        container.querySelector('img[alt="clipboard.png"]'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
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
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:discussion-video");
    URL.revokeObjectURL = vi.fn();

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

      const post = await screen.findByRole("button", { name: "Post" });
      const file = new File(["video-data"], "demo.mp4", {
        type: "video/mp4",
      });
      fireEvent.change(screen.getByLabelText("Choose image or video"), {
        target: { files: [file] },
      });

      await waitFor(() => expect(post).toBeEnabled());
      fireEvent.click(post);
      await waitFor(() => {
        expect(
          container.querySelector('video[src="blob:discussion-video"]'),
        ).toBeInTheDocument();
      });
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
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
});
