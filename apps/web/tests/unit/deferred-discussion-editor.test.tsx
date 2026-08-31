import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { DeferredDiscussionEditor } from "../../src/learning/discussion-editor/DeferredDiscussionEditor.tsx";
import { createEmptyDiscussionDraft } from "../../src/learning/discussion-editor/types.ts";

const editorModule = vi.hoisted(() => {
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

vi.mock(
  "../../src/learning/discussion-editor/DiscussionEditor.tsx",
  async () => {
    editorModule.loaded();
    await editorModule.gate;

    return {
      DiscussionEditor: ({ label }: { label: string }) => (
        <textarea aria-label={label} />
      ),
    };
  },
);

describe("DeferredDiscussionEditor", () => {
  it("requests the heavy editor only when its editing surface renders", async () => {
    expect(editorModule.loaded).not.toHaveBeenCalled();

    render(
      <DeferredDiscussionEditor
        value={createEmptyDiscussionDraft()}
        documentId="deferred-editor-test"
        label="Write a comment"
        placeholderText="Write something…"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(editorModule.loaded).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("status", {
        name: "Loading Write a comment editor",
      }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("textbox", { name: "Write a comment" }),
    ).toBeNull();

    await act(async () => editorModule.release());

    expect(
      await screen.findByRole("textbox", { name: "Write a comment" }),
    ).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
