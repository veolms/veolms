import { CertificateIcon as Certificate } from "@phosphor-icons/react/Certificate";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "../components/Button";
import { ElevatedCard } from "../components/ElevatedCard";
import {
  useClaimCertificate,
  useCourseCertificateStatus,
} from "../services/certificates";
import { CertificateNameDialog } from "./CertificateNameDialog";
import {
  certificatePath,
  downloadCertificatePdf,
  formatCertificateDate,
} from "./certificateUi";

/**
 * The course page's certificate card, for a learner in the course: how far
 * they are from it, the claim once it is unlocked, and the certificate once
 * they hold it. Nothing shows for a course that gives none.
 */
export function CourseCertificatePanel({ courseKey }: { courseKey: string }) {
  const status = useCourseCertificateStatus(courseKey);
  const claim = useClaimCertificate(courseKey);
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const data = status.data;
  if (!data || data.state === "disabled") return null;

  const download = async () => {
    if (!data.certificate) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadCertificatePdf(data.certificate);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "The download failed.",
      );
    } finally {
      setDownloading(false);
    }
  };

  const towards = Math.min(
    100,
    data.thresholdPercent > 0
      ? (data.progressPercent / data.thresholdPercent) * 100
      : 0,
  );
  const lessonsNeeded = Math.ceil(
    (data.thresholdPercent / 100) * data.totalLessons,
  );

  return (
    <ElevatedCard
      padded
      className="flex flex-col gap-4 @2xl/price:flex-row @2xl/price:items-center @2xl/price:justify-between"
      aria-label="Certificate of completion"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${
            data.state === "locked"
              ? "bg-(--surface-strong) text-(--muted)"
              : "bg-[color-mix(in_srgb,#c59a2e_16%,transparent)] text-[#b8861f]"
          }`}
          aria-hidden="true"
        >
          {data.state === "issued" ? (
            <SealCheck size={24} weight="fill" />
          ) : data.state === "unlocked" ? (
            <Certificate size={24} weight="fill" />
          ) : (
            <LockSimple size={22} weight="bold" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[1rem] font-bold text-(--text)">
            {data.state === "issued"
              ? "You earned the certificate"
              : data.state === "unlocked"
                ? "Your certificate is ready"
                : "Certificate of completion"}
          </p>
          <p className="m-0 mt-0.5 text-[0.84rem] text-(--muted)">
            {data.state === "issued" && data.certificate
              ? data.certificate.status === "revoked"
                ? "This certificate has been revoked."
                : `Issued ${formatCertificateDate(data.certificate.issuedOn)} to ${data.certificate.recipientName}`
              : data.state === "unlocked"
                ? `It will be issued to ${data.recipientName || "the name on your profile"}. Claim it to download and share.`
                : `Finish ${lessonsNeeded} of ${data.totalLessons} lessons (${data.thresholdPercent}%) to unlock it. ${data.completedLessons} done so far.`}
          </p>
          {data.state === "locked" ? (
            <span
              role="progressbar"
              aria-label="Progress towards the certificate"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(towards)}
              className="mt-2.5 block h-1.5 max-w-80 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_9%,transparent)]"
            >
              <span
                className="block h-full rounded-full bg-[#c59a2e]"
                style={{ width: `${towards}%` }}
              />
            </span>
          ) : null}
          {downloadError ? (
            <p className="m-0 mt-1.5 text-[0.8rem] text-rose-500" role="alert">
              {downloadError}
            </p>
          ) : null}
        </div>
      </div>

      {data.state === "unlocked" ? (
        <Button
          className="h-11 shrink-0 rounded-xl px-5 font-semibold"
          onClick={() => {
            claim.reset();
            setDialogOpen(true);
          }}
        >
          <Certificate size="1.1em" weight="fill" aria-hidden="true" />
          Claim certificate
        </Button>
      ) : data.state === "issued" &&
        data.certificate &&
        data.certificate.status === "active" ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to={certificatePath(data.certificate.code)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-(--surface-strong) px-4 text-sm font-semibold text-(--text-secondary) no-underline transition-colors hover:bg-(--hover) hover:text-(--text)"
          >
            View and share
          </Link>
          <Button
            className="h-11 rounded-xl px-4 font-semibold"
            disabled={downloading}
            onClick={() => void download()}
          >
            <DownloadSimple size="1.1em" weight="bold" aria-hidden="true" />
            {downloading ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      ) : null}

      <CertificateNameDialog
        open={dialogOpen}
        mode="claim"
        courseTitle={data.courseTitle}
        name={data.recipientName}
        problem={data.nameProblem}
        pending={claim.isPending}
        error={claim.error?.message ?? null}
        onCancel={() => setDialogOpen(false)}
        onConfirm={(closeThen) =>
          claim.mutate(undefined, {
            onSuccess: (certificate) =>
              closeThen(() => void navigate(certificatePath(certificate.code))),
          })
        }
      />
    </ElevatedCard>
  );
}
