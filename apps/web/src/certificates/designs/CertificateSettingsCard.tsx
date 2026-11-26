import { SignatureIcon as Signature } from "@phosphor-icons/react/Signature";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import {
  CERTIFICATE_DEFAULT_THRESHOLD_PERCENT,
  CERTIFICATE_MIN_THRESHOLD_PERCENT,
  CERTIFICATE_SIGNATURE_MAX_BYTES,
  CERTIFICATE_SIGNATURE_MIN_WIDTH,
} from "@veolms/contracts/certificate";
import { useId, useRef, useState } from "react";

import { Button } from "../../components/Button";
import { Switch } from "../../home-page-settings/homePageSettingsControls";
import {
  useCertificateAcademySettings,
  useCertificateSignatureImage,
  useRemoveCertificateSignature,
  useUpdateCertificateAcademySettings,
  useUploadCertificateSignature,
} from "../../services/certificates";
import { certificateInputClass } from "../certificateUi";

const SIGNATURE_TYPES = ["image/png", "image/jpeg"];

const cardClass =
  "flex flex-col gap-4 rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-4 shadow-(--card-shadow) sm:p-5";
const rowClass =
  "flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4 first:border-t-0 first:pt-0";

/** The width of a picked image, read in the browser before uploading it. */
function imageWidth(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image.naturalWidth);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The image could not be read."));
    };
    image.src = url;
  });
}

/**
 * Platform > Certificates, above the designs: the share of a course a
 * learner must finish, whether the certificate is then issued and emailed
 * on its own, and the signature printed on every certificate.
 */
export function CertificateSettingsCard({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const settings = useCertificateAcademySettings();
  const update = useUpdateCertificateAcademySettings();
  const upload = useUploadCertificateSignature();
  const remove = useRemoveCertificateSignature();
  const signature = useCertificateSignatureImage(
    settings.data?.signature?.updatedAt ?? null,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  // What the person typed, or null to show the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
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

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!SIGNATURE_TYPES.includes(file.type)) {
      setProblem("Upload a PNG or JPEG.");
      return;
    }
    if (file.size > CERTIFICATE_SIGNATURE_MAX_BYTES) {
      setProblem("The signature must be 2 MB or smaller.");
      return;
    }
    try {
      if ((await imageWidth(file)) < CERTIFICATE_SIGNATURE_MIN_WIDTH) {
        setProblem(
          `Use a sharper picture: at least ${CERTIFICATE_SIGNATURE_MIN_WIDTH} pixels wide.`,
        );
        return;
      }
    } catch {
      setProblem("The image could not be read. Try another file.");
      return;
    }
    setProgress(0);
    upload.mutate(
      { file, onProgress: setProgress },
      {
        onSuccess: () =>
          setNotice?.("The signature is saved. New certificates print it."),
        onError: (error) => setProblem(error.message),
        onSettled: () => setProgress(null),
      },
    );
  };

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

      <div className={rowClass}>
        <div>
          <p className="m-0 text-[0.9rem] font-semibold text-(--text)">
            Signature
          </p>
          <p className="m-0 mt-0.5 text-[0.8rem] text-(--muted)">
            Printed on uploaded designs where their layout places it. The
            built-in ProCodrr design always carries Anurag Singh&apos;s
            signature. A PNG with a transparent background looks best; at least{" "}
            {CERTIFICATE_SIGNATURE_MIN_WIDTH} pixels wide, 2 MB at most.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Always on white: it is printed on a light sheet. */}
          <div className="grid h-20 w-56 max-w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-white px-3 shadow-[0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)]">
            {current.signature ? (
              signature.data ? (
                <img
                  src={signature.data}
                  alt="The academy's signature"
                  className="max-h-16 max-w-full object-contain"
                />
              ) : (
                <span
                  className={`h-10 w-36 rounded ${signature.error ? "" : "animate-pulse"} bg-black/8`}
                />
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[0.8rem] text-neutral-500">
                <Signature size={18} aria-hidden="true" />
                No signature uploaded
              </span>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={SIGNATURE_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant={current.signature ? "quiet" : "primary"}
              className="h-9 rounded-lg px-3 text-sm"
              disabled={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <UploadSimple size={15} weight="bold" aria-hidden="true" />
              {upload.isPending
                ? progress !== null && progress < 100
                  ? `Uploading… ${progress}%`
                  : "Checking…"
                : current.signature
                  ? "Replace"
                  : "Upload signature"}
            </Button>
            {current.signature ? (
              <Button
                variant="danger"
                className="h-9 rounded-lg px-3 text-sm"
                disabled={remove.isPending || upload.isPending}
                onClick={() =>
                  remove.mutate(undefined, {
                    onSuccess: () =>
                      setNotice?.(
                        "The uploaded signature is removed from new certificates.",
                      ),
                  })
                }
              >
                <Trash size={15} aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        {problem || remove.error ? (
          <p className="m-0 text-[0.82rem] text-rose-500" role="alert">
            {problem ?? remove.error?.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
