import { certificatesService } from "../services/certificates";

/** The certificate pages' field look, as the Coupons and Links pages draw theirs. */
export const certificateInputClass =
  "h-11 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-3 text-[0.95rem] text-(--text) outline-none transition-[border-color,box-shadow] placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20 aria-invalid:border-rose-500";

/** "2026-11-26" (a calendar date, no time zone) as "26 November 2026". */
export function formatCertificateDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** The certificate's page on this site. */
export function certificatePath(code: string): string {
  return `/certificate/${encodeURIComponent(code)}`;
}

function fileNamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Asks the API for the PDF and saves it under a readable name. */
export async function downloadCertificatePdf(certificate: {
  code: string;
  courseTitle: string;
  recipientName: string;
}): Promise<void> {
  const blob = await certificatesService.downloadPdf(certificate.code);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `Certificate - ${fileNamePart(certificate.courseTitle)} - ${fileNamePart(certificate.recipientName)}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Give the browser a moment to start the download before freeing it.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/**
 * LinkedIn's "Add to profile" form for a licence or certification. LinkedIn
 * says the form may no longer fill itself in from these fields; the page
 * also shows the ID and address to copy.
 */
export function linkedInAddToProfileUrl(certificate: {
  courseTitle: string;
  academyName: string;
  issuedOn: string;
  verifyUrl: string;
  displayCode: string;
  linkedInOrganizationId?: string | null;
}): string {
  const [year, month] = certificate.issuedOn.split("-");
  const query = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: certificate.courseTitle,
    issueYear: year ?? "",
    issueMonth: String(Number(month ?? "1")),
    certUrl: certificate.verifyUrl,
    certId: certificate.displayCode,
  });
  if (certificate.linkedInOrganizationId) {
    query.set("organizationId", certificate.linkedInOrganizationId);
  } else {
    query.set("organizationName", certificate.academyName);
  }
  return `https://www.linkedin.com/profile/add?${query}`;
}

export function linkedInShareUrl(verifyUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl)}`;
}

export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function xShareUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
