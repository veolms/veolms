import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { useState } from "react";

import { ElevatedCard } from "../components/ElevatedCard";

/**
 * The affiliate's link and code. Any page of the academy becomes their link
 * by adding ?ref=CODE, so they can point straight at the course they talk
 * about: paste its address and the link is made for them.
 */
export function AffiliateLinkCard({
  code,
  link,
}: {
  code: string;
  link: string;
}) {
  const [page, setPage] = useState("");
  const built = buildLink(page, code) ?? link;
  return (
    <ElevatedCard padded className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-semibold text-(--text)">Your link</h2>
        <p className="m-0 text-sm text-(--muted)">
          Code <span className="font-semibold text-(--text)">{code}</span>
        </p>
      </div>
      <CopyField value={built} label="your link" />
      <label className="flex flex-col gap-1.5 text-sm text-(--text-secondary)">
        Link to a particular page: paste its address
        <input
          className="min-h-11 w-full rounded-xl bg-(--surface-strong) px-3 text-sm text-(--text) outline-none focus:ring-2 focus:ring-(--accent)"
          placeholder="https://…/courses/react/overview"
          value={page}
          onChange={(event) => setPage(event.target.value)}
        />
      </label>
    </ElevatedCard>
  );
}

/** The pasted address with ?ref=CODE, or null when it is not an address. */
function buildLink(page: string, code: string): string | null {
  if (!page.trim()) return null;
  try {
    const url = new URL(page.trim());
    url.searchParams.set("ref", code);
    return url.toString();
  } catch {
    return null;
  }
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-(--surface-strong) py-1.5 pl-3 pr-1.5">
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-(--text)">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-(--accent) px-3 text-sm font-semibold text-(--on-accent) hover:bg-(--accent-hover)"
      >
        {copied ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
