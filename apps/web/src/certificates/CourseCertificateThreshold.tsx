import { CERTIFICATE_MIN_THRESHOLD_PERCENT } from "@veolms/contracts/certificate";
import { useEffect, useId, useState } from "react";

import { Button } from "../components/Button";
import {
  useCourseCertificates,
  useUpdateCertificateSettings,
} from "../services/certificates";

/**
 * The course editor's "completion required": the share of the course's
 * lessons a learner must finish to unlock the certificate. Learners who
 * already unlocked or hold one keep it whatever the new value.
 */
export function CourseCertificateThreshold({
  courseId,
  disabled,
}: {
  courseId: string;
  disabled: boolean;
}) {
  const list = useCourseCertificates(courseId, "");
  const save = useUpdateCertificateSettings(courseId);
  const saved = list.data?.pages[0]?.thresholdPercent;
  const [value, setValue] = useState("");
  const inputId = useId();
  const noteId = useId();

  useEffect(() => {
    if (saved !== undefined) setValue(String(saved));
  }, [saved]);

  // Without the right to see the course's certificates, nothing to set.
  if (list.error?.status === 403) return null;

  const number = Number(value);
  const valid =
    Number.isInteger(number) &&
    number >= CERTIFICATE_MIN_THRESHOLD_PERCENT &&
    number <= 100;
  const changed = saved !== undefined && number !== saved;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="text-[0.84rem] font-semibold text-(--text-secondary)"
      >
        Completion required
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={CERTIFICATE_MIN_THRESHOLD_PERCENT}
          max={100}
          step={1}
          value={value}
          disabled={disabled || saved === undefined}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={!valid}
          aria-describedby={noteId}
          className="h-10 w-20 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3 text-center text-[0.9rem] font-semibold text-(--text) outline-none focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20 aria-invalid:border-rose-500"
        />
        <span className="text-[0.86rem] font-bold text-(--text)">
          % of lessons
        </span>
        {changed ? (
          <Button
            className="ml-auto h-9 rounded-lg px-3.5 text-sm"
            disabled={!valid || save.isPending || disabled}
            onClick={() => save.mutate(number)}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </div>
      <p
        id={noteId}
        className={`m-0 text-[0.78rem] ${!valid || save.error ? "text-rose-500" : "text-(--muted)"}`}
      >
        {!valid
          ? `Enter a whole number from ${CERTIFICATE_MIN_THRESHOLD_PERCENT} to 100.`
          : save.error
            ? save.error.message
            : "Learners unlock the certificate once they finish this share of the lessons (quizzes count when passed). Changing it never takes away one already unlocked."}
      </p>
    </div>
  );
}
