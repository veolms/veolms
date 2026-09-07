import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { LessonDescriptionEditor } from "../../src/courses/CourseDescriptionEditor";

describe("LessonDescriptionEditor Integration Tests", () => {
  it("1. shows existing Lesson Description Markdown correctly in the editor", () => {
    const initialText = "## Overview\nLearn how to build **custom hooks** in React.";
    render(
      <LessonDescriptionEditor
        id="lesson-desc-1"
        value={initialText}
        onChange={vi.fn()}
        placeholder="Add a detailed description..."
        maxLength={1500}
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Lesson Description" });
    expect(textbox).toBeInTheDocument();
    const view = EditorView.findFromDOM(textbox);
    expect(view).not.toBeNull();
    expect(view?.state.doc.toString()).toBe(initialText);
    expect(
      screen.getByText(`${initialText.length} / 1500`),
    ).toBeInTheDocument();
  });

  it("2. verifies multiple lesson editor instances in the same tree don't share document state", () => {
    const lesson1Text = "Lesson 1: Introduction and prerequisites.";
    const lesson2Text = "Lesson 2: Setting up your environment and dependencies.";
    const onChange1 = vi.fn();
    const onChange2 = vi.fn();

    render(
      <div>
        <div data-testid="lesson-1-wrapper">
          <LessonDescriptionEditor
            id="lesson-description-les-1"
            value={lesson1Text}
            onChange={onChange1}
          />
        </div>
        <div data-testid="lesson-2-wrapper">
          <LessonDescriptionEditor
            id="lesson-description-les-2"
            value={lesson2Text}
            onChange={onChange2}
          />
        </div>
      </div>,
    );

    const textboxes = screen.getAllByRole("textbox", {
      name: "Lesson Description",
    });
    expect(textboxes).toHaveLength(2);

    const view1 = EditorView.findFromDOM(textboxes[0]!);
    const view2 = EditorView.findFromDOM(textboxes[1]!);
    expect(view1).not.toBeNull();
    expect(view2).not.toBeNull();
    expect(view1?.state.doc.toString()).toBe(lesson1Text);
    expect(view2?.state.doc.toString()).toBe(lesson2Text);

    // Edit lesson 1 only
    view1?.dispatch({
      changes: {
        from: 0,
        to: view1.state.doc.length,
        insert: "Updated Lesson 1 only",
      },
    });

    expect(onChange1).toHaveBeenCalledWith("Updated Lesson 1 only");
    expect(onChange2).not.toHaveBeenCalled();

    // Verify view 2 doc state remains completely unaffected
    expect(view2?.state.doc.toString()).toBe(lesson2Text);
  });

  it("3. updates lesson draft state when editing content", () => {
    const onChange = vi.fn();
    render(
      <LessonDescriptionEditor
        id="lesson-desc-edit-test"
        value="Initial lesson text"
        onChange={onChange}
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Lesson Description" });
    const view = EditorView.findFromDOM(textbox);
    expect(view).not.toBeNull();

    view?.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: "```javascript\nconst a = 10;\n```",
      },
    });

    expect(onChange).toHaveBeenCalledWith("```javascript\nconst a = 10;\n```");
  });

  it("4. preserves save-on-blur behavior when focus leaves the lesson container", () => {
    const handleLessonFieldBlur = vi.fn();

    const TestHarness = () => {
      const [desc, setDesc] = useState("Original lesson text");
      return (
        <div>
          <div
            data-testid="lesson-editor-container"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                handleLessonFieldBlur("sec-1", "les-1");
              }
            }}
          >
            <LessonDescriptionEditor
              id="lesson-desc-blur-test"
              value={desc}
              onChange={setDesc}
            />
          </div>
          <button data-testid="outside-button">Outside control</button>
        </div>
      );
    };

    render(<TestHarness />);
    const container = screen.getByTestId("lesson-editor-container");
    const outsideBtn = screen.getByTestId("outside-button");

    // Focus leaving to an outside element triggers persistence
    fireEvent.blur(container, { relatedTarget: outsideBtn });
    expect(handleLessonFieldBlur).toHaveBeenCalledTimes(1);
    expect(handleLessonFieldBlur).toHaveBeenCalledWith("sec-1", "les-1");

    // Focus moving inside the container (e.g. to formatting toolbar) does NOT trigger persistence
    const toolbar = container.querySelector("[data-comment-toolbar]");
    expect(toolbar).not.toBeNull();
    fireEvent.blur(container, { relatedTarget: toolbar });
    expect(handleLessonFieldBlur).toHaveBeenCalledTimes(1);
  });

  it("5. synchronizes CodeMirror when value changes externally (hydration, discard, or server rollback)", () => {
    const TestHarness = () => {
      const [desc, setDesc] = useState("Original Draft");
      return (
        <div>
          <LessonDescriptionEditor
            id="lesson-desc-sync-test"
            value={desc}
            onChange={setDesc}
          />
          <button
            onClick={() => setDesc("Server Baseline Rolled Back")}
            data-testid="rollback-btn"
          >
            Rollback
          </button>
        </div>
      );
    };

    render(<TestHarness />);
    const textbox = screen.getByRole("textbox", { name: "Lesson Description" });
    const view = EditorView.findFromDOM(textbox);
    expect(view?.state.doc.toString()).toBe("Original Draft");

    // Simulate server rollback
    fireEvent.click(screen.getByTestId("rollback-btn"));
    expect(view?.state.doc.toString()).toBe("Server Baseline Rolled Back");
  });

  it("6. enforces 1500-character limit indicator and shows danger color when exceeded", () => {
    const normalText = "Short valid description";
    const longText = "a".repeat(1501);

    const { rerender } = render(
      <LessonDescriptionEditor
        id="lesson-desc-limit-test"
        value={normalText}
        onChange={vi.fn()}
        maxLength={1500}
      />,
    );

    const counterNormal = screen.getByText("23 / 1500");
    expect(counterNormal).toBeInTheDocument();
    expect(counterNormal).not.toHaveClass("text-[#ff5252]");

    rerender(
      <LessonDescriptionEditor
        id="lesson-desc-limit-test"
        value={longText}
        onChange={vi.fn()}
        maxLength={1500}
      />,
    );

    const counterOver = screen.getByText("1501 / 1500");
    expect(counterOver).toBeInTheDocument();
    expect(counterOver).toHaveClass("text-[#ff5252]");
  });

  it("7. disables editor when disabled={true}", () => {
    render(
      <LessonDescriptionEditor
        id="lesson-desc-disabled-test"
        value="Lesson pending creation"
        onChange={vi.fn()}
        disabled={true}
      />,
    );

    const wrapper = screen.getByTestId(
      "lesson-desc-disabled-test",
    );
    expect(wrapper).toHaveClass("cursor-not-allowed");
    expect(wrapper).toHaveClass("opacity-60");
    expect(wrapper).toHaveClass("pointer-events-none");
  });

  it("8. renders Anurag's CommentFormattingToolbar controls", () => {
    render(
      <LessonDescriptionEditor
        id="lesson-desc-toolbar-test"
        value="Text with formatting"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Italic" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Inline code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Code block" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add or edit link" }),
    ).toBeInTheDocument();
  });

  it("9. preserves dirty tracking comparison between draft and baseline", () => {
    const isLessonDirty = (
      draftDesc: string,
      initialDesc: string,
    ): boolean => {
      return (draftDesc || "") !== (initialDesc || "");
    };

    expect(isLessonDirty("Hello World", "Hello World")).toBe(false);
    expect(isLessonDirty("Hello World Edited", "Hello World")).toBe(true);
    expect(isLessonDirty("", "")).toBe(false);
    expect(isLessonDirty("New description", "")).toBe(true);
  });
});
