import { history } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CommentComposer } from "../../src/learning/CommentComposer.tsx";
import { CommentFormattingToolbar } from "../../src/learning/CommentFormattingToolbar.tsx";
import { DiscussionMarkdown } from "../../src/learning/discussion-editor/DiscussionMarkdown.tsx";
import { selectDiscussionAttachment } from "../../src/learning/discussion-editor/attachments.ts";
import { htmlToDiscussionMarkdown } from "../../src/learning/discussion-editor/clipboard.ts";
import { createDiscussionEditorCommands } from "../../src/learning/discussion-editor/commands.ts";
import { createDiscussionDraft } from "../../src/learning/discussion-editor/types.ts";
import { revokeLocalAttachmentPreview } from "../../src/services/learning-interactions/attachment-model.ts";
import { learningInteractionsService } from "../../src/services/learning-interactions/learning-interactions.service.ts";
import { api } from "../../src/lib/api-client.ts";
import { initiateAttachmentUploadRequestSchema } from "@veolms/contracts";

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

  it("keeps bold delimiters distinct when toggling italics", () => {
    const { view, commands } = createCommandHarness("**hello**");
    view.dispatch({ selection: { anchor: 2, head: 7 } });

    expect(commands.getFormattingState()).toMatchObject({
      bold: true,
      italic: false,
    });

    commands.toggleItalic();
    expect(view.state.doc.toString()).toBe("***hello***");
    expect(commands.getFormattingState()).toMatchObject({
      bold: true,
      italic: true,
    });

    commands.toggleItalic();
    expect(view.state.doc.toString()).toBe("**hello**");
    view.destroy();
  });
});

describe("comment formatting toolbar", () => {
  const formattingState = {
    bold: false,
    italic: false,
    highlight: false,
    link: false,
    code: false,
    codeBlock: false,
    canUndo: false,
    canRedo: false,
    linkUrl: "",
  };

  it("returns focus to the editor after applying or removing a link", () => {
    const editor = createEditorControllerStub();
    const { rerender } = render(
      <CommentFormattingToolbar
        editor={editor}
        formattingState={formattingState}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add or edit link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(editor.applyLink).toHaveBeenCalledWith("https://example.com");
    expect(editor.focus).toHaveBeenCalledTimes(1);

    rerender(
      <CommentFormattingToolbar
        editor={editor}
        formattingState={{
          ...formattingState,
          link: true,
          linkUrl: "https://example.com",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add or edit link" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(editor.removeLink).toHaveBeenCalledTimes(1);
    expect(editor.focus).toHaveBeenCalledTimes(2);
  });

  it("delegates attachment notices to the composer", async () => {
    const editor = createEditorControllerStub();
    const file = new File(["image"], "diagram.png", { type: "image/png" });
    render(
      <CommentFormattingToolbar
        editor={editor}
        formattingState={formattingState}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Choose image, video, document, or code file"),
      {
        target: { files: [file] },
      },
    );

    await waitFor(() => expect(editor.attach).toHaveBeenCalledWith(file));
    expect(screen.queryByRole("status")).toBeNull();
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
    await waitFor(
      () => {
        expect(
          container.querySelector("pre code span[style*='color']"),
        ).toBeTruthy();
      },
      { timeout: 8_000 },
    );
  });

  it("converts rich clipboard HTML into clean semantic Markdown", () => {
    expect(
      htmlToDiscussionMarkdown(
        "<h2>Plan</h2><p><strong>Important</strong> <a href='https://example.com'>link</a></p><ul><li>One</li></ul><script>alert(1)</script>",
      ),
    ).toBe("## Plan\n\n**Important** [link](https://example.com)\n\n-   One");
  });

  it("suppresses only legacy generated attachment Markdown matched by URL and label", () => {
    render(
      <DiscussionMarkdown
        label="Legacy attachment comment"
        content={createDiscussionDraft(
          "![diagram.png](/uploads/diagram.png)\n\n[diagram.png](/uploads/diagram.png)\n\n[Keep this link](https://example.com)",
        )}
        linkedAttachments={[
          {
            id: "attachment-1",
            fileName: "diagram.png",
            fileUrl: "/uploads/diagram.png",
            mimeType: "image/png",
            fileSize: 1,
            kind: "image",
          },
        ]}
      />,
    );

    expect(screen.queryByRole("img", { name: "diagram.png" })).toBeNull();
    expect(screen.queryByRole("link", { name: "diagram.png" })).toBeNull();
    expect(screen.getByRole("link", { name: "Keep this link" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });
});

describe("local discussion attachment selection", () => {
  it("allows visual uploads without dimensions", () => {
    expect(
      initiateAttachmentUploadRequestSchema.safeParse({
        fileName: "diagram.png",
        mimeType: "image/png",
        fileSize: 100,
      }).success,
    ).toBe(true);
  });

  it.each([
    { width: 1920 },
    { height: 1080 },
    { width: 0, height: 1080 },
    { width: -1, height: 1080 },
    { width: 1920.5, height: 1080 },
    { width: Number.NaN, height: 1080 },
    { width: 16_385, height: 1080 },
  ])("rejects malformed attachment dimensions: %j", (dimensions) => {
    expect(
      initiateAttachmentUploadRequestSchema.safeParse({
        fileName: "diagram.png",
        mimeType: "image/png",
        fileSize: 100,
        ...dimensions,
      }).success,
    ).toBe(false);
  });

  it("sends extracted dimensions as multipart fields", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({} as never);
    const file = new File(["image"], "diagram.png", { type: "image/png" });

    await learningInteractionsService.uploadAttachmentDirect(
      file,
      undefined,
      { width: 1920, height: 1080 },
    );

    const formData = postSpy.mock.calls[0]?.[1] as FormData;
    expect(formData.get("file")).toMatchObject({ name: file.name, type: file.type });
    expect(formData.get("width")).toBe("1920");
    expect(formData.get("height")).toBe("1080");
  });

  it("keeps an image local without changing editor content", async () => {
    const file = new File(["image"], "diagram.png", { type: "image/png" });
    const result = await selectDiscussionAttachment(file);

    expect(result).toMatchObject({ accepted: true, message: null });
    expect(result.attachment?.file).toBe(file);
    expect(result.attachment?.fileName).toBe("diagram.png");
  });

  it("rejects unsupported files before they enter local composer state", async () => {
    const result = await selectDiscussionAttachment(
      new File(["binary"], "payload.exe", {
        type: "application/octet-stream",
      }),
    );

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/supported image, video, document, or code/i);
  });

  it.each([
    ["image", "diagram.png", "image/png"],
    ["video", "walkthrough.mp4", "video/mp4"],
    ["document", "outline.pdf", "application/pdf"],
  ])("selects a %s without an upload request or generated Markdown", async (_kind, name, type) => {
    const uploadSpy = vi.spyOn(learningInteractionsService, "uploadAttachmentDirect");
    const result = await selectDiscussionAttachment(new File(["local"], name, { type }));

    expect(result.accepted).toBe(true);
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(result.attachment?.fileName).toBe(name);
    expect(result.attachment?.file).toBeInstanceOf(File);
  });

  it("extracts image dimensions while keeping one reusable local preview URL", async () => {
    class MockImage {
      naturalWidth = 1920;
      naturalHeight = 1080;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);
    const createObjectURL = vi.fn(() => "blob:local-preview");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });

    const result = await selectDiscussionAttachment(
      new File(["image"], "preview.png", { type: "image/png" }),
    );

    expect(result.attachment).toMatchObject({
      localPreviewUrl: "blob:local-preview",
      width: 1920,
      height: 1080,
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("extracts video dimensions from local metadata", async () => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      readyState: { value: 1 },
      videoWidth: { value: 1280 },
      videoHeight: { value: 720 },
    });
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(video);
    const createObjectURL = vi.fn(() => "blob:video-preview");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });

    const result = await selectDiscussionAttachment(
      new File(["video"], "walkthrough.mp4", { type: "video/mp4" }),
    );

    expect(result.attachment).toMatchObject({ width: 1280, height: 720 });
    expect(createElementSpy).toHaveBeenCalledWith("video");
    createElementSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("creates and revokes local media previews without transport", async () => {
    const createObjectURL = vi.fn(() => "blob:local-preview");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const result = await selectDiscussionAttachment(
      new File(["image"], "preview.png", { type: "image/png" }),
    );
    expect(result.attachment?.localPreviewUrl).toBe("blob:local-preview");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    revokeLocalAttachmentPreview(result.attachment!);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-preview");
    vi.unstubAllGlobals();
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

function createEditorControllerStub() {
  return {
    ...createCommandStub(vi.fn()),
    attach: vi.fn(async () => ({
      accepted: true,
      message: null,
    })),
    getMarkdown: vi.fn(() => ""),
  };
}
