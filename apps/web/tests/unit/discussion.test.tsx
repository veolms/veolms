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

  it("uses trailing icons for notes and Q&As without labeling comments", () => {
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
    expect(within(meta).getByText("Just now").nextElementSibling).toHaveAttribute(
      "aria-label",
      "Note",
    );

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
    expect(within(meta).queryByRole("img")).toBeNull();
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
      { timeout: 1_500 },
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
  });

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
});
