import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { DeferredDiscussionThreadPanel } from "../../src/learning/DeferredDiscussionThreadPanel.tsx";
import { DeferredMobileDiscussionComposerDrawer } from "../../src/learning/DeferredMobileDiscussionComposerDrawer.tsx";
import { DeferredDiscussionMarkdown } from "../../src/learning/discussion-editor/DeferredDiscussionMarkdown.tsx";
import { createEmptyDiscussionDraft } from "../../src/learning/discussion-editor/types.ts";

const deferredModules = vi.hoisted(() => {
  const createGate = () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    return {
      gate,
      loaded: vi.fn(),
      release: () => release?.(),
    };
  };

  return {
    markdown: createGate(),
    mobileDrawer: createGate(),
    threadPanel: createGate(),
  };
});

vi.mock("../../src/learning/DiscussionThreadPanel.tsx", async () => {
  deferredModules.threadPanel.loaded();
  await deferredModules.threadPanel.gate;

  return {
    DiscussionThreadPanel: () => (
      <div role="dialog" aria-label="Deferred discussion thread" />
    ),
  };
});

vi.mock("../../src/learning/MobileDiscussionComposerDrawer.tsx", async () => {
  deferredModules.mobileDrawer.loaded();
  await deferredModules.mobileDrawer.gate;

  return {
    MobileDiscussionComposerDrawer: () => (
      <div role="dialog" aria-label="Deferred mobile composer" />
    ),
  };
});

vi.mock(
  "../../src/learning/discussion-editor/DiscussionMarkdown.tsx",
  async () => {
    deferredModules.markdown.loaded();
    await deferredModules.markdown.gate;

    return {
      DiscussionMarkdown: ({ label }: { label: string }) => (
        <div role="document" aria-label={label} data-rich-markdown />
      ),
    };
  },
);

describe("deferred discussion surfaces", () => {
  it("does not request the Swiper thread panel until a thread opens", async () => {
    const props = {
      activeEntryId: null,
      entries: [],
      onOpenChange: vi.fn(),
      onActiveEntryChange: vi.fn(),
      onLike: vi.fn(),
      onAddReply: vi.fn(),
      onEditEntry: vi.fn(),
      onDeleteEntry: vi.fn(),
      onEditReply: vi.fn(),
      onDeleteReply: vi.fn(),
      onReport: vi.fn(),
    };
    const { rerender } = render(
      <DeferredDiscussionThreadPanel {...props} open={false} />,
    );

    expect(deferredModules.threadPanel.loaded).not.toHaveBeenCalled();

    rerender(<DeferredDiscussionThreadPanel {...props} open />);
    await waitFor(() =>
      expect(deferredModules.threadPanel.loaded).toHaveBeenCalledOnce(),
    );
    expect(
      screen.queryByRole("dialog", { name: "Deferred discussion thread" }),
    ).toBeNull();

    await act(async () => deferredModules.threadPanel.release());
    expect(
      await screen.findByRole("dialog", {
        name: "Deferred discussion thread",
      }),
    ).toBeVisible();
  });

  it("does not request the mobile composer drawer before it is requested", async () => {
    const draft = createEmptyDiscussionDraft();
    const props = {
      open: false,
      draft,
      entryKind: "comment" as const,
      visibility: "public" as const,
      editingEntryId: null,
      invalid: false,
      canSubmit: false,
      collapsedSnapPoint: 480,
      snapPoint: 480,
      keyboardInset: 0,
      viewportHeight: 800,
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onSnapPointChange: vi.fn(),
      onDraftChange: vi.fn(),
      onEntryKindChange: vi.fn(),
      onVisibilityChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = render(
      <DeferredMobileDiscussionComposerDrawer {...props} requested={false} />,
    );

    expect(deferredModules.mobileDrawer.loaded).not.toHaveBeenCalled();

    rerender(
      <DeferredMobileDiscussionComposerDrawer {...props} requested open />,
    );
    await waitFor(() =>
      expect(deferredModules.mobileDrawer.loaded).toHaveBeenCalledOnce(),
    );
    expect(
      screen.queryByRole("dialog", { name: "Deferred mobile composer" }),
    ).toBeNull();

    await act(async () => deferredModules.mobileDrawer.release());
    expect(
      await screen.findByRole("dialog", { name: "Deferred mobile composer" }),
    ).toBeVisible();
  });

  it("keeps seeded plain text synchronous and loads rich Markdown on demand", async () => {
    const { rerender } = render(
      <DeferredDiscussionMarkdown
        text="A plain seeded comment"
        label="Plain comment"
      />,
    );

    expect(deferredModules.markdown.loaded).not.toHaveBeenCalled();
    expect(
      screen.getByRole("document", { name: "Plain comment" }),
    ).toHaveTextContent("A plain seeded comment");

    rerender(
      <DeferredDiscussionMarkdown
        content={{
          format: "markdown",
          markdown: "**Rich comment**",
          plainText: "Rich comment",
        }}
        text="Rich comment"
        label="Rich comment"
      />,
    );
    await waitFor(() =>
      expect(deferredModules.markdown.loaded).toHaveBeenCalledOnce(),
    );
    expect(
      screen.getByRole("document", { name: "Rich comment" }),
    ).toHaveTextContent("Rich comment");
    expect(
      screen.getByRole("document", { name: "Rich comment" }),
    ).not.toHaveAttribute("data-rich-markdown");

    await act(async () => deferredModules.markdown.release());
    expect(
      await screen.findByRole("document", { name: "Rich comment" }),
    ).toHaveAttribute("data-rich-markdown");
  });
});
