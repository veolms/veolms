import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { LinkedinLogoIcon as LinkedinLogo } from "@phosphor-icons/react/LinkedinLogo";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { WhatsappLogoIcon as WhatsappLogo } from "@phosphor-icons/react/WhatsappLogo";
import { XLogoIcon as XLogo } from "@phosphor-icons/react/XLogo";
import type { ComponentType } from "react";
import { useState } from "react";

import {
  linkedInAddToProfileUrl,
  linkedInShareUrl,
  whatsAppShareUrl,
  xShareUrl,
} from "./certificateUi";

const actionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-(--surface-strong) px-3.5 text-sm font-semibold text-(--text-secondary) no-underline transition-colors hover:bg-(--hover) hover:text-(--text) cursor-pointer border-0";

function ShareLink({
  href,
  Icon,
  label,
}: {
  href: string;
  Icon: ComponentType<{ size?: number | string; weight?: "fill" | "bold" }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={actionClass}
    >
      <Icon size={18} weight="fill" />
      {label}
    </a>
  );
}

/** A value to copy (the credential ID or address), with its own button. */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <p className="m-0 mb-1 text-[0.72rem] font-semibold tracking-wide text-(--muted) uppercase">
        {label}
      </p>
      <div className="flex min-w-0 items-center gap-2 rounded-[10px] bg-(--surface-strong) py-1.5 pr-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[0.82rem] text-(--text)">
          {value}
        </span>
        <button
          type="button"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text)"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

/**
 * The owner's ways to show the certificate: add it to the LinkedIn profile
 * (with the ID and address to copy, since LinkedIn may not fill its form
 * in), post it, or send its link.
 */
export function CertificateShareActions({
  certificate,
}: {
  certificate: {
    courseTitle: string;
    academyName: string;
    issuedOn: string;
    verifyUrl: string;
    displayCode: string;
    linkedInOrganizationId?: string | null;
  };
}) {
  const message = `I completed ${certificate.courseTitle} with ${certificate.academyName}.`;
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <a
          href={linkedInAddToProfileUrl(certificate)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0a66c2] px-4 text-sm font-semibold text-white no-underline transition-colors hover:bg-[#004182]"
        >
          <LinkedinLogo size={18} weight="fill" />
          Add to LinkedIn profile
        </a>
        <ShareLink
          href={linkedInShareUrl(certificate.verifyUrl)}
          Icon={LinkedinLogo}
          label="Post"
        />
        <ShareLink
          href={whatsAppShareUrl(`${message} ${certificate.verifyUrl}`)}
          Icon={WhatsappLogo}
          label="WhatsApp"
        />
        <ShareLink
          href={xShareUrl(message, certificate.verifyUrl)}
          Icon={XLogo}
          label="X"
        />
        {canShare ? (
          <button
            type="button"
            className={actionClass}
            onClick={() =>
              void navigator
                .share({
                  title: certificate.courseTitle,
                  text: message,
                  url: certificate.verifyUrl,
                })
                .catch(() => {})
            }
          >
            <ShareNetwork size={18} weight="bold" />
            More
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CopyField label="Credential ID" value={certificate.displayCode} />
        <CopyField label="Credential URL" value={certificate.verifyUrl} />
      </div>
    </div>
  );
}
