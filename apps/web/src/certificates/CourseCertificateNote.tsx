import { CERTIFICATE_COURSE_NOTE_MAX_LENGTH } from "@veolms/contracts/certificate";
import { useId, useState } from "react";

import { Button } from "../components/Button";
import {
  useCourseCertificates,
  useUpdateCertificateSettings,
} from "../services/certificates";
import { certificateInputClass } from "./certificateUi";

/**
 * The course editor's "Line under the course title": what the certificate
 * prints under the course's name ("270+ hours of comprehensive backend
 * engineering coursework."). Left empty, the certificate writes one from
 * the course's length, shown as the placeholder.
 */
export function CourseCertificateNote({
  courseId,
  disabled,
}: {
  courseId: string;
  disabled: boolean;
}) {
  const list = useCourseCertificates(courseId, "");
  const save = useUpdateCertificateSettings(courseId);
  const page = list.data?.pages[0];
  const saved = page?.courseNote ?? null;
  const automatic = page?.autoCourseNote ?? null;
  // What the person typed, or null to show the saved line.
  const [draft, setDraft] = useState<string | null>(null);
  const inputId = useId();
  const noteId = useId();

  if (list.error?.status === 403) return null;

  const loading = page === undefined;
  const value = draft ?? saved ?? "";
  const changed = draft !== null && draft.trim() !== (saved ?? "");

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="text-[0.84rem] font-semibold text-(--text-secondary)"
      >
        Line under the course title
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          value={value}
          maxLength={CERTIFICATE_COURSE_NOTE_MAX_LENGTH}
          disabled={disabled || loading}
          placeholder={automatic ?? "Written from the course's length"}
          onChange={(event) => setDraft(event.target.value)}
          aria-describedby={noteId}
          className={`${certificateInputClass} h-10 min-w-0 flex-1 text-sm ${loading ? "animate-pulse" : ""}`}
        />
        {changed ? (
          <Button
            className="h-9 shrink-0 rounded-lg px-3.5 text-sm"
            disabled={save.isPending || disabled}
            onClick={() =>
              save.mutate(
                { courseNote: draft.trim() || null },
                { onSuccess: () => setDraft(null) },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </div>
      <p
        id={noteId}
        className={`m-0 text-[0.78rem] ${save.error ? "text-rose-500" : "text-(--muted)"}`}
      >
        {save.error
          ? save.error.message
          : saved
            ? "Printed under the course title on every certificate for this course. Clear it to use the line written from the course's length."
            : "Printed under the course title on the certificate. Left empty, the certificate uses the line shown in the box, written from the course's length."}
      </p>
    </div>
  );
}
