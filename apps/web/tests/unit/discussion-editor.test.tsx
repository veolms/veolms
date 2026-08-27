import { history } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CommentComposer } from "../../src/learning/CommentComposer.tsx";
import { DiscussionMarkdown } from "../../src/learning/discussion-editor/DiscussionMarkdown.tsx";
import { insertDiscussionAttachment } from "../../src/learning/discussion-editor/attachments.ts";
import { htmlToDiscussionMarkdown } from "../../src/learning/discussion-editor/clipboard.ts";
import { createDiscussionEditorCommands } from "../../src/learning/discussion-editor/commands.ts";
import { createDiscussionDraft } from "../../src/learning/discussion-editor/types.ts";

describe("discussion Markdown editor commands", () => {
  it.each([
    [
      "bold",
      "hello",
      "**hello**",
      (commands: ReturnType<typeof createDiscussionEditorCommands>) =>
        commands.toggleBold(),
    ],
    [
      "italic",
      "hello",
      "*hello*",
      (commands: ReturnType<typeof createDiscussionEditorCommands>) =>
        commands.toggleItalic(),
    ],
    [
      "strikethrough",
      "hello",
      "~~hello~~",
      (commands: ReturnType<typeof createDiscussionEditorCommands>) =>
        commands.toggleStrikethrough(),
    ],
    [
      "inline code",
      "hello",
      "`hello`",
      (commands: ReturnType<typeof createDiscussionEditorCommands>) =>
        commands.toggleInlineCode(),
    ],
  ])(
    "toggles %s using editable Markdown syntax",
    (_name, source, expected, apply) => {
      const { view, commands } = createCommandHarness(source);
      view.dispatch({ selection: { anchor: 0, head: source.length } });
      apply(commands);
      expect(view.state.doc.toString()).toBe(expected);
      apply(commands);
      expect(view.state.doc.toString()).toBe(source);
      view.destroy();
    },
  );

  it("creates links, lists, code blocks, and natural undo/redo history", () => {
    const { view, commands } = createCommandHarness("first\nsecond");
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    commands.applyLink("example.com");
    expect(view.state.doc.toString()).toBe(
      "[first](https://example.com)\nsecond",
    );
    commands.undo();
    expect(view.state.doc.toString()).toBe("first\nsecond");
    commands.redo();
    expect(view.state.doc.toString()).toBe(
      "[first](https://example.com)\nsecond",
    );

    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    commands.toggleBulletList();
    expect(view.state.doc.toString()).toBe(
      "- [first](https://example.com)\n- second",
    );
    commands.toggleBulletList();
    commands.toggleOrderedList();
    expect(view.state.doc.toString()).toBe(
      "1. [first](https://example.com)\n2. second",
    );
    commands.toggleOrderedList();
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    commands.toggleCodeBlock();
    expect(view.state.doc.toString()).toBe(
      "```\n[first](https://example.com)\nsecond\n```",
    );
    view.destroy();
  });
});

describe("discussion composer Atomic behavior", () => {
  it.each([
    ["Control", { ctrlKey: true }],
    ["Command", { metaKey: true }],
  ])("keeps %s+Enter in Atomic and never submits", async (_label, modifier) => {
    const onSubmit = vi.fn();
    render(
      <CommentComposer
        draft={createDiscussionDraft("Hello world")}
        documentId={`native-enter-${_label}`}
        entryKind="comment"
        visibility="public"
        invalid={false}
        canSubmit
        autoFocus
        onDraftChange={vi.fn()}
        onEntryKindChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    const editor = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    view?.dispatch({ selection: { anchor: 9 } });
    fireEvent.keyDown(editor, {
      key: "Enter",
      code: "Enter",
      ...modifier,
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Post as" })).toBeNull();
    if ("ctrlKey" in modifier && modifier.ctrlKey) {
      expect(view?.state.doc.toString()).not.toBe("Hello world");
    }
  });
});

describe("discussion Markdown rendering and clipboard", () => {
  const markdown = `# Heading

Normal **bold**, *italic*, and ~~strike~~.

- Item one
- Item two

1. First
2. Second

> A quotation

[Example](https://example.com)

\`const value = 1\`

\`\`\`typescript
interface Course {
  id: string;
}
\`\`\``;

  it("renders GFM statically and highlights fenced code without an editor", async () => {
    const { container } = render(
      <DiscussionMarkdown
        label="Published comment"
        content={createDiscussionDraft(markdown)}
      />,
    );

    expect(screen.getByRole("heading", { name: "Heading" })).toBeVisible();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("strike").tagName).toBe("DEL");
    expect(screen.getByRole("link", { name: "Example" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(container.querySelector(".cm-editor")).toBeNull();
    await waitFor(() => {
      expect(
        container.querySelector("pre code span[style*='color']"),
      ).toBeTruthy();
    });
  });

  it("converts rich clipboard HTML into clean semantic Markdown", () => {
    expect(
      htmlToDiscussionMarkdown(
        "<h2>Plan</h2><p><strong>Important</strong> <a href='https://example.com'>link</a></p><ul><li>One</li></ul><script>alert(1)</script>",
      ),
    ).toBe("## Plan\n\n**Important** [link](https://example.com)\n\n-   One");
  });
});

describe("discussion attachment storage", () => {
  it("uploads an image to a stable URL and inserts canonical Markdown", async () => {
    const insertMarkdown = vi.fn();
    const result = await insertDiscussionAttachment(
      createCommandStub(insertMarkdown),
      new File(["image"], "diagram.png", { type: "image/png" }),
      {
        upload: vi.fn(async (file) => ({
          url: "/api/v1/dev/discussion-uploads/stable.png",
          fileName: "stable.png",
          mediaType: "image" as const,
          mimeType: file.type,
          size: file.size,
        })),
      },
    );

    expect(result).toEqual({ inserted: true, message: null });
    expect(insertMarkdown).toHaveBeenCalledWith(
      "\n![diagram.png](/api/v1/dev/discussion-uploads/stable.png)\n",
    );
  });

  it("does not insert a broken URL when upload fails", async () => {
    const insertMarkdown = vi.fn();
    const result = await insertDiscussionAttachment(
      createCommandStub(insertMarkdown),
      new File(["image"], "diagram.png", { type: "image/png" }),
      { upload: vi.fn(async () => Promise.reject(new Error("offline"))) },
    );

    expect(result.inserted).toBe(false);
    expect(result.message).toMatch(/could not be uploaded/i);
    expect(insertMarkdown).not.toHaveBeenCalled();
  });
});

function createCommandHarness(doc: string) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: [history()] }),
  });
  return { view, commands: createDiscussionEditorCommands(() => view) };
}

function createCommandStub(insertMarkdown: (markdown: string) => void) {
  return {
    focus: vi.fn(),
    undo: vi.fn(() => false),
    redo: vi.fn(() => false),
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    toggleStrikethrough: vi.fn(),
    toggleHighlight: vi.fn(),
    toggleInlineCode: vi.fn(),
    toggleCodeBlock: vi.fn(),
    toggleBulletList: vi.fn(),
    toggleOrderedList: vi.fn(),
    toggleTaskList: vi.fn(),
    toggleBlockquote: vi.fn(),
    applyLink: vi.fn(),
    removeLink: vi.fn(),
    insertMarkdown,
    getFormattingState: vi.fn(() => ({
      bold: false,
      italic: false,
      highlight: false,
      link: false,
      code: false,
      codeBlock: false,
      canUndo: false,
      canRedo: false,
      linkUrl: "",
    })),
  };
}
