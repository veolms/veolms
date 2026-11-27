import {
  CERTIFICATE_DEFAULT_THRESHOLD_PERCENT,
  CERTIFICATE_IMAGE_KINDS,
  CERTIFICATE_MIN_THRESHOLD_PERCENT,
} from "@veolms/contracts/certificate";
import { useId, useState } from "react";

import { Button } from "../../components/Button";
import { Switch } from "../../home-page-settings/homePageSettingsControls";
import {
  useCertificateAcademySettings,
  useUpdateCertificateAcademySettings,
} from "../../services/certificates";
import { certificateInputClass } from "../certificateUi";
import { CertificateImageRow } from "./CertificateImageRow";

const cardClass =
  "flex flex-col gap-4 rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-4 shadow-(--card-shadow) sm:p-5";
const rowClass =
  "flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4 first:border-t-0 first:pt-0";

/**
 * Platform > Certificates, above the designs: the share of a course a
 * learner must finish, whether the certificate is then issued and emailed
 * on its own, and the images printed on the built-in certificate: the
 * signature, the badge and the background.
 */
export function CertificateSettingsCard({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const settings = useCertificateAcademySettings();
  const update = useUpdateCertificateAcademySettings();
  // What the person typed, or null to show the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const inputId = useId();
  const noteId = useId();

  if (settings.isPending) {
    return (
      <div className="h-64 animate-pulse rounded-[14px] bg-(--surface-strong)" />
    );
  }
  if (settings.error) {
    return (
      <p className="m-0 text-sm text-(--muted)">
        We couldn&apos;t load the certificate settings.{" "}
        <button
          type="button"
          onClick={() => void settings.refetch()}
          className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-(--accent) hover:underline"
        >
          Try again
        </button>
      </p>
    );
  }
  const current = settings.data;
  const value = draft ?? String(current.thresholdPercent);
  const number = Number(value);
  const valid =
    value.trim() !== "" &&
    Number.isInteger(number) &&
    number >= CERTIFICATE_MIN_THRESHOLD_PERCENT &&
    number <= 100;
  const changed = number !== current.thresholdPercent;

  const saveThreshold = () => {
    if (!valid || !changed) return;
    update.mutate(
      { thresholdPercent: number },
      {
        onSuccess: () => {
          setDraft(null);
          setNotice?.(
            `Courses now ask for ${number}% unless they set their own.`,
          );
        },
      },
    );
  };

  return (
    <section className={cardClass} aria-labelledby="certificate-settings-title">
      <h3
        id="certificate-settings-title"
        className="m-0 text-[1.05rem] font-bold text-(--text)"
      >
        Certificate settings
      </h3>

      <div className={rowClass}>
        <label
          htmlFor={inputId}
          className="text-[0.9rem] font-semibold text-(--text)"
        >
          Completion required
        </label>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveThreshold();
          }}
        >
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={CERTIFICATE_MIN_THRESHOLD_PERCENT}
            max={100}
            step={1}
            value={value}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={!valid}
            aria-describedby={noteId}
            className={`${certificateInputClass} h-10 w-20! text-center font-semibold`}
          />
          <span className="text-[0.86rem] font-bold text-(--text)">
            % of a course&apos;s lessons
          </span>
          {changed ? (
            <Button
              type="submit"
              className="h-9 rounded-lg px-3.5 text-sm"
              disabled={!valid || update.isPending}
            >
              Save
            </Button>
          ) : null}
        </form>
        <p
          id={noteId}
          className={`m-0 text-[0.8rem] ${!valid || update.error ? "text-rose-500" : "text-(--muted)"}`}
        >
          {!valid
            ? `Enter a whole number from ${CERTIFICATE_MIN_THRESHOLD_PERCENT} to 100.`
            : update.error
              ? update.error.message
              : `Every course asks for this share (${CERTIFICATE_DEFAULT_THRESHOLD_PERCENT}% unless you change it), unless the course sets its own in its editor. Learners who already unlocked a certificate keep it.`}
        </p>
      </div>

      <div className={rowClass}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-[0.9rem] font-semibold text-(--text)">
              Issue and email it automatically
            </p>
            <p className="m-0 mt-0.5 text-[0.8rem] text-(--muted)">
              {current.autoIssue
                ? "When a learner reaches the share, the certificate is issued to their profile name and emailed to them as a PDF."
                : "Learners claim the certificate from the course page once they reach the share."}
            </p>
          </div>
          <Switch
            checked={current.autoIssue}
            onChange={(autoIssue) =>
              update.mutate(
                { autoIssue },
                {
                  onSuccess: () =>
                    setNotice?.(
                      autoIssue
                        ? "Certificates are now issued and emailed automatically."
                        : "Learners now claim their certificates themselves.",
                    ),
                },
              )
            }
            label="Issue and email certificates automatically"
          />
        </div>
      </div>

      {CERTIFICATE_IMAGE_KINDS.map((kind) => (
        <CertificateImageRow
          key={kind}
          kind={kind}
          settings={current}
          className={rowClass}
          setNotice={setNotice}
        />
      ))}
    </section>
  );
}
