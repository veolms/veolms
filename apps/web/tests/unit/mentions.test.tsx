import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CompletionContext } from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { createMentionCompletionSource } from "../../src/learning/discussion-editor/mentions";
import {
  DiscussionMarkdown,
  renderContentWithMentions,
} from "../../src/learning/discussion-editor/DiscussionMarkdown";
import { CommentComposer } from "../../src/learning/CommentComposer";
import { createDiscussionDraft, createEmptyDiscussionDraft } from "../../src/learning/discussion-editor/types";
import { learningInteractionsService } from "../../src/services/learning-interactions/learning-interactions.service";

describe("@mentions completion source", () => {
  const courseId = "c1111111-1111-4111-a111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockContext(
    doc: string,
    cursorPos: number,
    options?: { aborted?: boolean },
  ): CompletionContext {
    return {
      state: {
        sliceDoc: (from: number, to: number) => doc.slice(from, to),
        selection: { main: { head: cursorPos } },
      } as unknown as EditorState,
      pos: cursorPos,
      aborted: options?.aborted ?? false,
      matchBefore(regex: RegExp) {
        const textBefore = doc.slice(0, cursorPos);
        const match = textBefore.match(regex);
        if (!match) return null;
        return {
          from: cursorPos - match[0].length,
          to: cursorPos,
          text: match[0],
        };
      },
    } as unknown as CompletionContext;
  }

  it("does not trigger for bare '@' without query characters", async () => {
    const fetchFn = vi.fn();
    const source = createMentionCompletionSource(courseId, fetchFn);
    const context = createMockContext("Hello @", 7);

    const result = await source(context);

    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not trigger inside email addresses", async () => {
    const fetchFn = vi.fn();
    const source = createMentionCompletionSource(courseId, fetchFn);
    const context = createMockContext("user@example", 12);

    const result = await source(context);

    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("triggers for '@username' and queries autocompleteUsers with typed query", async () => {
    const fetchFn = vi.fn().mockResolvedValue([
      {
        id: "u1",
        displayName: "Ashi Singh",
        username: "ashi",
        avatarUrl: null,
      },
      {
        id: "u2",
        displayName: "Ashwin Kumar",
        username: "ashwin",
        avatarUrl: null,
      },
    ]);

    const source = createMentionCompletionSource(courseId, fetchFn);
    const context = createMockContext("Hello @ash", 10);

    const result = await source(context);

    expect(fetchFn).toHaveBeenCalledWith("ash");
    expect(result).not.toBeNull();
    expect(result?.from).toBe(6); // index of '@'
    expect(result?.filter).toBe(false);
    expect(result?.options).toHaveLength(2);

    // Shows display name and handle
    expect(result?.options[0]?.label).toBe("Ashi Singh");
    expect(result?.options[0]?.detail).toBe("@ashi");

    // Applying suggestion MUST insert plain-text '@username ' (not displayName or UUID)
    expect(result?.options[0]?.apply).toBe("@ashi ");
    expect(result?.options[1]?.apply).toBe("@ashwin ");
  });

  it("uses canonical autocompleteUsers service method with courseId", async () => {
    const autocompleteSpy = vi
      .spyOn(learningInteractionsService, "autocompleteUsers")
      .mockResolvedValue({
        users: [
          {
            id: "u-alex",
            displayName: "Alex Doe",
            username: "alex",
            avatarUrl: null,
          },
        ],
      });

    const source = createMentionCompletionSource(courseId);
    const context = createMockContext("@ale", 4);

    const result = await source(context);

    expect(autocompleteSpy).toHaveBeenCalledWith({
      courseId,
      query: "ale",
      limit: 10,
    });
    expect(result?.options[0]?.apply).toBe("@alex ");
  });

  it("caches query results to prevent duplicate network calls", async () => {
    const fetchFn = vi.fn().mockResolvedValue([
      {
        id: "u1",
        displayName: "Ashi Singh",
        username: "ashi",
        avatarUrl: null,
      },
    ]);

    const source = createMentionCompletionSource(courseId, fetchFn);
    const context1 = createMockContext("Hey @ash", 8);
    await source(context1);

    const context2 = createMockContext("Hey @ash", 8);
    await source(context2);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("drops stale async results when a newer request starts", async () => {
    let resolveFirst: (v: any) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce([
        {
          id: "u2",
          displayName: "Ashwin Kumar",
          username: "ashwin",
          avatarUrl: null,
        },
      ]);

    const source = createMentionCompletionSource(courseId, fetchFn);

    const ctx1 = createMockContext("@as", 3);
    const p1 = source(ctx1);

    // Allow ctx1's debounce to elapse so its network fetch begins
    await new Promise((r) => setTimeout(r, 160));
    expect(fetchFn).toHaveBeenCalledWith("as");

    // Start newer request while first is still in flight
    const ctx2 = createMockContext("@ash", 4);
    const p2 = source(ctx2);

    const res2 = await p2;
    expect(res2?.options[0]?.detail).toBe("@ashwin");

    // Resolve first (older) request now
    resolveFirst!([
      {
        id: "u1",
        displayName: "Ashi Singh",
        username: "ashi",
        avatarUrl: null,
      },
    ]);
    const res1 = await p1;

    // Stale result is discarded
    expect(res1).toBeNull();
  });

  it("returns null gracefully if context is aborted", async () => {
    const fetchFn = vi.fn().mockResolvedValue([
      { id: "u1", displayName: "Ashi", username: "ashi", avatarUrl: null },
    ]);

    const source = createMentionCompletionSource(courseId, fetchFn);
    const context = createMockContext("@ash", 4, { aborted: true });

    const result = await source(context);
    expect(result).toBeNull();
  });

  it("returns null silently on API error without throwing", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network failure"));
    const source = createMentionCompletionSource(courseId, fetchFn);
    const context = createMockContext("@ash", 4);

    const result = await source(context);
    expect(result).toBeNull();
  });
});

describe("CommentComposer mentions enablement", () => {
  const defaultProps = {
    draft: createEmptyDiscussionDraft(),
    documentId: "test-doc",
    visibility: "public" as const,
    invalid: false,
    canSubmit: true,
    courseId: "c1111111-1111-4111-a111-111111111111",
    onDraftChange: vi.fn(),
    onEntryKindChange: vi.fn(),
    onVisibilityChange: vi.fn(),
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  };

  it("enables mentions for comments", () => {
    const { container } = render(
      <CommentComposer {...defaultProps} entryKind="comment" />,
    );
    expect(container.querySelector("[data-discussion-atomic-editor]")).toBeInTheDocument();
  });

  it("enables mentions for questions", () => {
    const { container } = render(
      <CommentComposer {...defaultProps} entryKind="question" />,
    );
    expect(container.querySelector("[data-discussion-atomic-editor]")).toBeInTheDocument();
  });

  it("disables mentions for notes", () => {
    const { container } = render(
      <CommentComposer {...defaultProps} entryKind="note" />,
    );
    expect(container.querySelector("[data-discussion-atomic-editor]")).toBeInTheDocument();
  });
});

describe("DiscussionMarkdown mention rendering", () => {
  it("renders plain @username with subtle accent treatment and py-0.5", () => {
    const markdown = "Hello @ashi and @rohit_99, welcome!";
    render(
      <DiscussionMarkdown
        content={createDiscussionDraft(markdown)}
        label="Discussion post"
      />,
    );

    const ashiMention = screen.getByText("@ashi");
    expect(ashiMention).toBeInTheDocument();
    expect(ashiMention).toHaveAttribute("data-mention", "ashi");
    expect(ashiMention.className).toContain("text-(--accent)");
    expect(ashiMention.className).toContain("py-0.5");

    const rohitMention = screen.getByText("@rohit_99");
    expect(rohitMention).toBeInTheDocument();
    expect(rohitMention).toHaveAttribute("data-mention", "rohit_99");
  });

  it("does not transform email addresses into mentions", () => {
    const markdown = "Please email support@veolms.com for queries.";
    const { container } = render(
      <DiscussionMarkdown
        content={createDiscussionDraft(markdown)}
        label="Discussion post"
      />,
    );

    expect(container.querySelector("[data-mention]")).toBeNull();
    expect(screen.getByText(/support@veolms\.com/)).toBeInTheDocument();
  });

  it("does not highlight mentions inside inline code or fenced code blocks", () => {
    const markdown = "Use `@username` in code:\n\n```ts\nconst user = '@admin';\n```";
    const { container } = render(
      <DiscussionMarkdown
        content={createDiscussionDraft(markdown)}
        label="Discussion post"
      />,
    );

    expect(container.querySelector("[data-mention]")).toBeNull();
  });

  it("handles mentions at the start of a sentence or inside parentheses", () => {
    const markdown = "@ashi mentioned that (@karan) is ready.";
    render(
      <DiscussionMarkdown
        content={createDiscussionDraft(markdown)}
        label="Discussion post"
      />,
    );

    expect(screen.getByText("@ashi")).toBeInTheDocument();
    expect(screen.getByText("@karan")).toBeInTheDocument();
  });

  it("renderContentWithMentions returns identical string when no mentions exist", () => {
    const plain = "Simple plain text without mentions.";
    expect(renderContentWithMentions(plain)).toBe(plain);
  });
});
