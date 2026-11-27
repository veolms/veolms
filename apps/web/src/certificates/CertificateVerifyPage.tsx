import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { Button } from "../components/Button";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { ElevatedCard } from "../components/ElevatedCard";
import {
  certificateNameProblem,
  normalizeCertificateName,
} from "@veolms/contracts/certificate";
import { useCurrentUser } from "../services/auth";
import {
  useMyCertificates,
  usePublicCertificate,
  useUpdateCertificateName,
} from "../services/certificates";
import { CertificateNameDialog } from "./CertificateNameDialog";
import { CertificateShareActions } from "./CertificateShareActions";
import { downloadCertificatePdf, formatCertificateDate } from "./certificateUi";

const pageClasses = "flex w-full min-w-0 flex-col gap-5 font-sans";

/**
 * `/verify/<code>`: anyone checks a certificate here (the QR code on
 * the PDF leads here). It shows who it was given to, for which course, by
 * which academy and when, and whether it is valid. Its owner also gets the
 * download, sharing and a name correction.
 */
export function CertificateVerifyPage() {
  const { code = "" } = useParams();
  const certificate = usePublicCertificate(code);
  const me = useCurrentUser();
  const signedIn = Boolean(me.data);
  const mine = useMyCertificates({ enabled: signedIn });
  const own = mine.data?.items.find(
    (item) => item.code === certificate.data?.code,
  );
  const correct = useUpdateCertificateName();
  const profileName = normalizeCertificateName(me.data?.displayName ?? "");
  const [renaming, setRenaming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (certificate.isPending) {
    return (
      <main className={pageClasses} aria-busy="true">
        <ElevatedCard padded className="flex flex-col gap-4">
          <span className="h-6 w-40 animate-pulse rounded-md bg-(--surface-strong)" />
          <span className="h-10 w-72 max-w-full animate-pulse rounded-md bg-(--surface-strong)" />
          <span className="h-5 w-96 max-w-full animate-pulse rounded-md bg-(--surface-strong)" />
        </ElevatedCard>
      </main>
    );
  }

  if (certificate.error || !certificate.data) {
    const notFound = certificate.error?.status === 404;
    return (
      <main className={pageClasses}>
        <ElevatedCard
          padded
          className="flex flex-col items-center gap-2 py-12 text-center"
        >
          <WarningCircle
            size={40}
            weight="duotone"
            className="text-(--muted)"
            aria-hidden="true"
          />
          <h1 className="m-0 text-[1.3rem] font-bold text-(--text)">
            {notFound ? "No certificate has this ID" : "We couldn't check it"}
          </h1>
          <p className="m-0 max-w-md text-sm text-(--muted)">
            {notFound
              ? "Check the ID or link you were given. IDs look like 7P5S-1588-Z9M0-4ASG."
              : "Check your connection and try again."}
          </p>
          {!notFound ? (
            <Button
              variant="quiet"
              className="mt-2"
              onClick={() => void certificate.refetch()}
            >
              Try again
            </Button>
          ) : null}
        </ElevatedCard>
      </main>
    );
  }

  const data = certificate.data;
  const valid = data.status === "valid";
  const download = async () => {
    if (!own) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadCertificatePdf(own);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "The download failed.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className={pageClasses} aria-labelledby="certificate-title">
      <ElevatedCard
        padded
        className="relative isolate flex flex-col gap-5 overflow-hidden"
      >
        {/* The profile card's glow, in the theme's accent colour. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_110%_at_50%_-25%,color-mix(in_srgb,var(--accent)_30%,transparent),transparent_70%),radial-gradient(circle_at_8%_30%,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_40%),radial-gradient(circle_at_94%_25%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_36%),linear-gradient(165deg,color-mix(in_srgb,var(--accent)_10%,var(--surface))_0%,var(--surface)_70%)]"
        />
        <div
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[0.8rem] font-semibold ${
            valid
              ? "bg-emerald-500/15 text-emerald-400 [:root[data-theme=light]_&]:bg-emerald-700/12 [:root[data-theme=light]_&]:text-emerald-800"
              : "bg-rose-500/15 text-rose-400 [:root[data-theme=light]_&]:text-rose-700"
          }`}
        >
          {valid ? (
            <SealCheck size={16} weight="fill" aria-hidden="true" />
          ) : (
            <Prohibit size={16} weight="bold" aria-hidden="true" />
          )}
          {valid
            ? `Verified certificate from ${data.academyName}`
            : `Revoked${data.revokedOn ? ` on ${formatCertificateDate(data.revokedOn)}` : ""}`}
        </div>

        <div>
          <p className="m-0 text-[0.78rem] font-semibold tracking-[0.12em] text-(--muted) uppercase">
            Certificate of completion
          </p>
          <h1
            id="certificate-title"
            className="m-0 mt-2 font-serif text-[clamp(1.9rem,4.5vw,2.6rem)] leading-tight font-bold text-[#b8861f] italic"
          >
            {data.recipientName ?? "Name no longer shown"}
          </h1>
          <p className="m-0 mt-3 text-[1rem] leading-7 text-(--text-secondary)">
            completed{" "}
            {data.courseSlug ? (
              <Link
                to={`/courses/${encodeURIComponent(data.courseSlug)}/overview`}
                className="font-semibold text-(--text) underline-offset-2 hover:underline"
              >
                {data.courseTitle}
              </Link>
            ) : (
              <span className="font-semibold text-(--text)">
                {data.courseTitle}
              </span>
            )}{" "}
            with {data.academyName}.
          </p>
        </div>

        <dl className="m-0 grid grid-cols-2 gap-4 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4 max-[420px]:grid-cols-1">
          <div>
            <dt className="text-[0.72rem] font-semibold tracking-wide text-(--muted) uppercase">
              Issued
            </dt>
            <dd className="m-0 mt-1 text-sm font-semibold text-(--text)">
              {formatCertificateDate(data.issuedOn)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.72rem] font-semibold tracking-wide text-(--muted) uppercase">
              Certificate ID
            </dt>
            <dd className="m-0 mt-1 font-mono text-sm font-semibold text-(--text)">
              {data.displayCode}
            </dd>
          </div>
        </dl>
        {!valid ? (
          <p className="m-0 text-sm text-(--muted)">
            {data.academyName} has revoked this certificate. It is no longer
            valid.
          </p>
        ) : null}
      </ElevatedCard>

      {own && valid ? (
        <ElevatedCard padded className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 text-[1.05rem] font-bold text-(--text)">
                Your certificate
              </h2>
              <p className="m-0 mt-0.5 text-[0.84rem] text-(--muted)">
                Download it, add it to your profile, or share the link above.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {own.nameCorrectionsLeft > 0 &&
              profileName &&
              profileName !== own.recipientName ? (
                <Button
                  variant="quiet"
                  className="h-10 rounded-xl px-3.5"
                  onClick={() => {
                    correct.reset();
                    setRenaming(true);
                  }}
                >
                  <PencilSimple size={16} aria-hidden="true" />
                  Use profile name
                </Button>
              ) : null}
              <Button
                className="h-10 rounded-xl px-4 font-semibold"
                disabled={downloading}
                aria-busy={downloading}
                onClick={() => void download()}
              >
                {downloading ? (
                  <LoadingSpinnerIcon size={17} className="text-current!" />
                ) : (
                  <DownloadSimple size={17} weight="bold" aria-hidden="true" />
                )}
                {downloading ? "Preparing…" : "Download PDF"}
              </Button>
            </div>
          </div>
          {downloadError ? (
            <p className="m-0 text-[0.82rem] text-rose-500" role="alert">
              {downloadError}
            </p>
          ) : null}
          <CertificateShareActions
            certificate={{
              ...own,
              linkedInOrganizationId: data.linkedInOrganizationId,
            }}
          />
          <CertificateNameDialog
            open={renaming}
            mode="update"
            courseTitle={own.courseTitle}
            name={profileName}
            currentName={own.recipientName}
            problem={certificateNameProblem(profileName)}
            correctionsLeft={own.nameCorrectionsLeft}
            pending={correct.isPending}
            error={correct.error?.message ?? null}
            onCancel={() => setRenaming(false)}
            onConfirm={(closeThen) =>
              // Shown at once (optimistic); put back if refused.
              closeThen(() => correct.mutate({ code: own.code, profileName }))
            }
          />
        </ElevatedCard>
      ) : null}
    </main>
  );
}
