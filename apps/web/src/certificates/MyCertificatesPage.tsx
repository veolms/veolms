import { CertificateIcon as Certificate } from "@phosphor-icons/react/Certificate";
import { useNavigate } from "react-router";

import { ElevatedCard } from "../components/ElevatedCard";
import { PageHeading } from "../components/PageHeading";
import { useMyCertificates } from "../services/certificates";
import { certificatePath, formatCertificateDate } from "./certificateUi";

/** `/certificates`: every certificate the learner has earned, newest first. */
export function MyCertificatesPage() {
  const certificates = useMyCertificates();
  const navigate = useNavigate();

  return (
    <main
      className="flex w-full min-w-0 flex-col gap-6 font-sans"
      aria-labelledby="certificates-title"
    >
      <PageHeading
        id="certificates-title"
        title="Certificates"
        description="The certificates you have earned. Open one to download it or share it."
      />
      {certificates.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((key) => (
            <ElevatedCard key={key} padded className="flex flex-col gap-3">
              <span className="h-5 w-48 animate-pulse rounded-md bg-(--surface-strong)" />
              <span className="h-4 w-32 animate-pulse rounded-md bg-(--surface-strong)" />
            </ElevatedCard>
          ))}
        </div>
      ) : certificates.error ? (
        <ElevatedCard padded className="text-sm text-(--muted)">
          We couldn&apos;t load your certificates.{" "}
          <button
            type="button"
            onClick={() => void certificates.refetch()}
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-(--accent) hover:underline"
          >
            Try again
          </button>
        </ElevatedCard>
      ) : certificates.data.items.length === 0 ? (
        <ElevatedCard
          padded
          className="flex flex-col items-center gap-2 py-10 text-center"
        >
          <Certificate
            size={40}
            weight="duotone"
            className="text-[#b8861f]"
            aria-hidden="true"
          />
          <p className="m-0 font-semibold text-(--text)">No certificates yet</p>
          <p className="m-0 max-w-sm text-sm text-(--muted)">
            Finish most of a course&apos;s lessons to unlock its certificate.
            The course page shows how far you are.
          </p>
        </ElevatedCard>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {certificates.data.items.map((item) => (
            <li key={item.code}>
              <ElevatedCard
                as="button"
                type="button"
                padded
                onClick={() => void navigate(certificatePath(item.code))}
                className="flex w-full cursor-pointer items-start gap-3 border-0 text-left"
              >
                <span
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,#c59a2e_16%,transparent)] text-[#b8861f]"
                  aria-hidden="true"
                >
                  <Certificate size={24} weight="fill" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1rem] font-bold text-(--text)">
                    {item.courseTitle}
                  </span>
                  <span className="mt-0.5 block text-[0.84rem] text-(--muted)">
                    {item.status === "revoked"
                      ? "Revoked"
                      : `Issued ${formatCertificateDate(item.issuedOn)}`}{" "}
                    · {item.displayCode}
                  </span>
                </span>
              </ElevatedCard>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
