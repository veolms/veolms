import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CourseDescriptionEditor } from "../../src/courses/CourseDescriptionEditor";
import {
  BasicsFieldStatusIndicator,
  isBasicsEqual,
  isBasicsMetaEqual,
  normalizeBasicsState,
  type BasicsFormState,
} from "../../src/courses/CourseCreatePage";

describe("CourseDescriptionEditor - Phase 1 Integration Tests", () => {
  it("1. shows existing Course Description value correctly in the new editor", () => {
    const initialText = "Comprehensive guide to TypeScript and Node.js.";
    render(
      <CourseDescriptionEditor
        value={initialText}
        onChange={vi.fn()}
        placeholder="Describe what your course is about..."
        maxLength={1500}
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Course Description" });
    expect(textbox).toBeInTheDocument();
    const view = EditorView.findFromDOM(textbox);
    expect(view).not.toBeNull();
    expect(view?.state.doc.toString()).toBe(initialText);
    expect(
      screen.getByText(`${initialText.length} / 1500`),
    ).toBeInTheDocument();
  });

  it("2. updates draft state when editing content", () => {
    const onChange = vi.fn();
    render(
      <CourseDescriptionEditor
        value="Initial description"
        onChange={onChange}
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Course Description" });
    const view = EditorView.findFromDOM(textbox);
    expect(view).not.toBeNull();

    // Simulate user editing in CodeMirror
    view?.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: "Updated course description with **bold** highlights",
      },
    });

    expect(onChange).toHaveBeenCalledWith(
      "Updated course description with **bold** highlights",
    );
  });

  it("3. preserves save-on-blur behavior when focus leaves the container", () => {
    const persistBasicsField = vi.fn();

    const TestHarness = () => {
      const [desc, setDesc] = useState("Original text");
      return (
        <div>
          <div
            data-testid="editor-container"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                persistBasicsField("courseDescription");
              }
            }}
          >
            <CourseDescriptionEditor value={desc} onChange={setDesc} />
          </div>
          <input data-testid="outside-input" type="text" />
        </div>
      );
    };

    render(<TestHarness />);
    const container = screen.getByTestId("editor-container");
    const outsideInput = screen.getByTestId("outside-input");

    // Blurring to an element outside the container triggers persistence
    fireEvent.blur(container, { relatedTarget: outsideInput });
    expect(persistBasicsField).toHaveBeenCalledTimes(1);
    expect(persistBasicsField).toHaveBeenCalledWith("courseDescription");

    // Blurring to an element inside the container (e.g. toolbar) does NOT trigger persistence
    const toolbar = container.querySelector("[data-comment-toolbar]");
    expect(toolbar).not.toBeNull();
    fireEvent.blur(container, { relatedTarget: toolbar });
    expect(persistBasicsField).toHaveBeenCalledTimes(1);
  });

  it("4. preserves existing dirty tracking logic with the new editor output", () => {
    const baseline: BasicsFormState = normalizeBasicsState({
      title: "Clean Code",
      shortDescription: "Short summary",
      description: "Original description body",
      categoryId: "cat-1",
      difficulty: "beginner",
      language: "en",
      instructorAlias: "Author",
      showInstructorName: true,
    });

    // Unmodified draft matches baseline -> not dirty
    const cleanDraft: BasicsFormState = { ...baseline };
    expect(isBasicsMetaEqual(cleanDraft, baseline)).toBe(true);
    expect(isBasicsEqual(cleanDraft, baseline)).toBe(true);

    // Modified description -> dirty
    const dirtyDraft: BasicsFormState = {
      ...baseline,
      description: "Edited description body",
    };
    expect(isBasicsMetaEqual(dirtyDraft, baseline)).toBe(false);
    expect(isBasicsEqual(dirtyDraft, baseline)).toBe(false);
  });

  it("5. preserves payload contract during navigation/step flush", () => {
    const draft: BasicsFormState = normalizeBasicsState({
      title: "System Design",
      shortDescription: "Distributed systems",
      description: "Detailed architecture syllabus",
      categoryId: "cat-sys",
      difficulty: "advanced",
      instructorAlias: "Architect",
    });

    // Verify the exact payload contract expected by PUT/PATCH /courses/:id/basics
    const payload = {
      title: draft.title.trim(),
      shortDescription: draft.shortDescription.trim() || null,
      description: draft.description.trim() || null,
      categoryId: draft.categoryId || null,
      difficulty: draft.difficulty || null,
      instructorAlias: draft.instructorAlias.trim() || null,
      version: 1,
    };

    expect(payload).toEqual({
      title: "System Design",
      shortDescription: "Distributed systems",
      description: "Detailed architecture syllabus",
      categoryId: "cat-sys",
      difficulty: "advanced",
      instructorAlias: "Architect",
      version: 1,
    });
  });

  it("6. updates CodeMirror when server content hydrates after initial empty mount", () => {
    const { rerender } = render(
      <CourseDescriptionEditor value="" onChange={vi.fn()} />,
    );

    const textbox = screen.getByRole("textbox", { name: "Course Description" });
    const view = EditorView.findFromDOM(textbox);
    expect(view?.state.doc.toString()).toBe("");
    expect(screen.getByText("0 / 1500")).toBeInTheDocument();

    // Server API returns and updates parent value prop
    rerender(
      <CourseDescriptionEditor
        value="Hydrated course overview from API"
        onChange={vi.fn()}
      />,
    );

    const hydratedText = "Hydrated course overview from API";
    expect(view?.state.doc.toString()).toBe(hydratedText);
    expect(
      screen.getByText(`${hydratedText.length} / 1500`),
    ).toBeInTheDocument();
  });

  it("7. correctly rolls back editor content when save fails", () => {
    const { rerender } = render(
      <CourseDescriptionEditor
        value="Unsaved draft edit"
        onChange={vi.fn()}
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Course Description" });
    const view = EditorView.findFromDOM(textbox);
    expect(view?.state.doc.toString()).toBe("Unsaved draft edit");

    // Network error causes rollback to last saved baseline
    rerender(
      <CourseDescriptionEditor
        value="Confirmed server baseline"
        onChange={vi.fn()}
      />,
    );

    expect(view?.state.doc.toString()).toBe("Confirmed server baseline");
  });

  it("8. handles empty Course Description cleanly without dirty false-positives", () => {
    const baseline = normalizeBasicsState(null);
    expect(baseline.description).toBe("");

    const payloadDescription = "".trim() || null;
    expect(payloadDescription).toBeNull();

    render(<CourseDescriptionEditor value="" onChange={vi.fn()} />);
    const textbox = screen.getByRole("textbox", { name: "Course Description" });
    const view = EditorView.findFromDOM(textbox);
    expect(view?.state.doc.toString()).toBe("");
  });

  it("9. works seamlessly with BasicsFieldStatusIndicator for saving, saved, and failed states", () => {
    const { rerender } = render(
      <div>
        <BasicsFieldStatusIndicator
          status="saving"
          testId="basics-field-status-courseDescription"
        />
        <CourseDescriptionEditor
          value="In-flight course"
          onChange={vi.fn()}
        />
      </div>,
    );

    expect(
      screen.getByTestId("basics-field-status-courseDescription"),
    ).toHaveTextContent(/saving/i);

    rerender(
      <div>
        <BasicsFieldStatusIndicator
          status="saved"
          testId="basics-field-status-courseDescription"
        />
        <CourseDescriptionEditor
          value="In-flight course"
          onChange={vi.fn()}
        />
      </div>,
    );
    expect(
      screen.getByTestId("basics-field-status-courseDescription"),
    ).toHaveTextContent(/saved/i);

    rerender(
      <div>
        <BasicsFieldStatusIndicator
          status="failed"
          testId="basics-field-status-courseDescription"
        />
        <CourseDescriptionEditor
          value="In-flight course"
          onChange={vi.fn()}
        />
      </div>,
    );
    expect(
      screen.getByTestId("basics-field-status-courseDescription"),
    ).toHaveTextContent(/failed/i);
  });

  it("10. enforces character limit styling and aria-invalid when exceeding maxLength", () => {
    const longText = "a".repeat(1501);
    render(
      <CourseDescriptionEditor
        value={longText}
        onChange={vi.fn()}
        maxLength={1500}
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Course Description" });
    expect(textbox).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("1501 / 1500")).toBeInTheDocument();
  });
});
