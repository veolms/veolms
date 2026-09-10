import { EditorView } from "@codemirror/view";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { CommentFormattingToolbar } from "../learning/CommentFormattingToolbar";
import {
  DiscussionEditor,
  type DiscussionEditorController,
} from "../learning/discussion-editor/DiscussionEditor";
import type { DiscussionFormattingState } from "../learning/discussion-editor/commands";
import {
  createDiscussionDraft,
  type DiscussionDraft,
} from "../learning/discussion-editor/types";

export interface CourseDescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

const EMPTY_FORMATTING_STATE: DiscussionFormattingState = {
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

export function CourseDescriptionEditor({
  value,
  onChange,
  id = "course-description",
  label = "Course Description",
  placeholder = "Add a detailed description...",
  maxLength = 1500,
  disabled = false,
}: CourseDescriptionEditorProps) {
  const [draft, setDraft] = useState(() => createDiscussionDraft(value));
  const [controller, setController] =
    useState<DiscussionEditorController | null>(null);
  const [formattingState, setFormattingState] =
    useState<DiscussionFormattingState>(EMPTY_FORMATTING_STATE);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastReportedValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const isOverLimit = value.length > maxLength;

  // External synchronization:
  // When parent `value` changes from outside (e.g. server hydration, course/lesson
  // switch, or rollback on failed save), synchronize CodeMirror in place.
  useEffect(() => {
    if (value === lastReportedValueRef.current) return;
    lastReportedValueRef.current = value;
    setDraft(createDiscussionDraft(value));

    const contentEl =
      containerRef.current?.querySelector<HTMLElement>(".cm-content");
    if (contentEl) {
      const view = EditorView.findFromDOM(contentEl);
      if (view && view.state.doc.toString() !== value) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
        });
      }
    }
  }, [value]);

  const handleDraftChange = useCallback((nextDraft: DiscussionDraft) => {
    setDraft(nextDraft);
    lastReportedValueRef.current = nextDraft.markdown;
    onChangeRef.current(nextDraft.markdown);
  }, []);

  const handleWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const content = containerRef.current?.querySelector(".cm-content");
      if (content?.contains(document.activeElement)) return;

      const scrollport = event.currentTarget.closest<HTMLElement>(
        ".courses-main",
      );
      if (!scrollport) return;

      event.preventDefault();
      scrollport.scrollTop += event.deltaY;
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      id={id}
      data-testid={id}
      data-course-description-editor={id}
      data-base-ui-swipe-ignore=""
      data-tab-swipe-ignore=""
      onWheelCapture={handleWheelCapture}
      className={`learning-comment-editor relative isolate flex flex-col overflow-hidden rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] shadow-[0_1px_0_color-mix(in_srgb,var(--text)_6%,transparent)] transition-[border-color,box-shadow] duration-150 focus-within:border-(--accent) focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)] ${
        disabled ? "cursor-not-allowed opacity-60 pointer-events-none" : ""
      } ${
        isOverLimit
          ? "border-(--danger) focus-within:border-(--danger) focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--danger)_42%,transparent)]"
          : ""
      }`}
    >
      <div className="relative min-h-[140px] flex-1">
        <DiscussionEditor
          documentId={id}
          value={draft}
          label={label}
          placeholderText={placeholder}
          invalid={isOverLimit}
          className="min-h-[140px]"
          onChange={handleDraftChange}
          onControllerChange={setController}
          onFormattingStateChange={setFormattingState}
        />
      </div>

      <div
        data-comment-toolbar
        className="flex shrink-0 items-center justify-between gap-1.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] px-2.5 py-2 sm:gap-2 sm:px-3"
      >
        {controller && (
          <CommentFormattingToolbar
            editor={controller}
            formattingState={formattingState}
          />
        )}
        <div
          className={`shrink-0 pl-2 text-[0.76rem] font-medium transition-colors ${
            isOverLimit ? "text-[#ff5252]" : "text-(--muted)"
          }`}
          aria-live="polite"
        >
          {value.length} / {maxLength}
        </div>
      </div>
    </div>
  );
}

export interface LessonDescriptionEditorProps
  extends Omit<CourseDescriptionEditorProps, "id"> {
  id: string;
}

/** Pre-configured adapter for Curriculum Lesson editing with unique documentId. */
export function LessonDescriptionEditor({
  id,
  label = "Lesson Description",
  placeholder = "Add a detailed description of what students will learn in this lesson...",
  ...props
}: LessonDescriptionEditorProps) {
  return (
    <CourseDescriptionEditor
      id={id}
      label={label}
      placeholder={placeholder}
      {...props}
    />
  );
}
