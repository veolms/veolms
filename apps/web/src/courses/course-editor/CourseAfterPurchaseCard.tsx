import { useEffect, useRef, useState } from "react";
import {
  AfterPurchaseWelcomeFields,
  EMPTY_WELCOME_DRAFT,
  sameWelcome,
  welcomeDraftFrom,
  welcomeErrors,
  welcomePayload,
  type WelcomeDraft,
} from "../../after-purchase/AfterPurchaseWelcomeFields";
import { useCourseEditor } from "../../services/courses/courses.queries";
import { useUpsertSettings } from "../../services/courses/courses.mutations";
import { ExtrasControlStatusIndicator } from "./statusIndicators";

// The course editor's own field look (see BasicsStepPanel).
const fieldBase =
  "w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.88rem] outline-none transition-[border-color] duration-150 focus:border-(--accent) aria-[invalid=true]:border-rose-500 font-[inherit]";
const inputClass = `${fieldBase} h-10`;
const textareaClass = `${fieldBase} min-h-[104px] max-h-[260px] resize-y py-2.5 pb-7`;
const labelClass = "text-(--text-secondary) text-[0.84rem] font-semibold";

/**
 * Extras › After purchase: what a buyer of this course reads on the order
 * page and in the confirmation email right after paying. Saved when a field
 * loses focus, like the rest of the course editor.
 */
export function CourseAfterPurchaseCard({ courseId }: { courseId: string }) {
  const editor = useCourseEditor(courseId);
  const upsert = useUpsertSettings();
  const saved = editor.data?.settings?.welcome;

  const [draft, setDraft] = useState<WelcomeDraft>(EMPTY_WELCOME_DRAFT);
  const baselineRef = useRef<WelcomeDraft>(EMPTY_WELCOME_DRAFT);
  const loadedRef = useRef(false);
  const [status, setStatus] = useState<"saving" | "saved" | "failed" | null>(
    null,
  );
  const [failure, setFailure] = useState<string | null>(null);

  // Filled once from the course; later refetches never overwrite typing.
  useEffect(() => {
    if (loadedRef.current || !editor.data) return;
    loadedRef.current = true;
    const initial = welcomeDraftFrom(saved);
    baselineRef.current = initial;
    setDraft(initial);
  }, [editor.data, saved]);

  const save = async () => {
    if (sameWelcome(draft, baselineRef.current)) return;
    if (Object.keys(welcomeErrors(draft)).length > 0) return;
    const payload = welcomePayload(draft);
    setStatus("saving");
    setFailure(null);
    try {
      await upsert.mutateAsync({ courseId, payload: { welcome: payload } });
      baselineRef.current = welcomeDraftFrom(payload);
      setStatus("saved");
    } catch (error) {
      setStatus("failed");
      setFailure(
        (error as { message?: string })?.message ??
          "Could not save. Check your connection and try again.",
      );
    }
  };

  return (
    <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
      <div className="mb-4.5 flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
            After purchase
          </h3>
          <p className="m-0 text-(--muted) text-[0.83rem]">
            A welcome your buyers read on their order page and in the
            confirmation email, right after paying. Add a button for your
            WhatsApp or Telegram group.
          </p>
        </div>
        <ExtrasControlStatusIndicator
          status={status}
          testId="extras-field-status-afterPurchase"
        />
      </div>

      <AfterPurchaseWelcomeFields
        idPrefix={`course-${courseId}-welcome`}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          if (status !== "saving") setStatus(null);
        }}
        onBlur={() => void save()}
        inputClassName={inputClass}
        textareaClassName={textareaClass}
        labelClassName={labelClass}
      />
      {failure ? (
        <p className="m-0 mt-3 text-[0.8rem] text-rose-500" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
