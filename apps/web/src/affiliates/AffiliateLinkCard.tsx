import { useState } from "react";
import type { AffiliateMeResponse } from "@veolms/contracts";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { CursorClickIcon as CursorClick } from "@phosphor-icons/react/CursorClick";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { PercentIcon as Percent } from "@phosphor-icons/react/Percent";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";

import { ElevatedCard } from "../components/ElevatedCard";
import { inputClassName } from "../team/TeamBits";
import { CodeChip } from "./admin/AdminPanelBits";
import { formatAffiliateMoney, formatAffiliateRate } from "./affiliateFormat";

const cardTitle =
  "m-0 text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase";

/**
 * The affiliate's link and code, and what sharing it earns. Any page of the
 * academy becomes their link with ?ref=CODE, so they can point straight at
 * the course they talk about: paste its address and the link is made.
 */
export function AffiliateLinkCard({ me }: { me: AffiliateMeResponse }) {
  const [page, setPage] = useState("");
  const pasted = page.trim();
  const built = buildLink(pasted, me.code);
  const { program } = me;
  const terms = [
    {
      icon: Percent,
      label: "You earn",
      value: program.defaultRate
        ? `${formatAffiliateRate(program.defaultRate)} a sale`
        : "Set by the academy",
    },
    {
      icon: CursorClick,
      label: "A click counts for",
      value: `${program.attributionWindowDays} days`,
    },
    {
      icon: Tag,
      label: "Buyers with your code",
      value:
        program.buyerDiscountPercent > 0
          ? `get ${program.buyerDiscountPercent}% off`
          : "pay full price",
    },
  ];

  return (
    <ElevatedCard
      as="section"
      className="overflow-hidden p-0"
      aria-label="Your link"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={cardTitle}>Your link</h2>
          <span className="flex items-center gap-2 text-xs text-(--muted)">
            Your code <CodeChip code={me.code} />
          </span>
        </header>
        <CopyField value={me.link} label="your link" />
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-(--text)">
            <span className="flex items-center gap-1.5">
              <LinkSimple
                size={15}
                aria-hidden="true"
                className="text-(--muted)"
              />
              Link to a particular course or page
            </span>
            <input
              className={inputClassName}
              placeholder="Paste its address, like https://…/courses/react/overview"
              value={page}
              onChange={(event) => setPage(event.target.value)}
            />
          </label>
          {pasted &&
            (built ? (
              <CopyField value={built} label="the page link" />
            ) : (
              <p className="m-0 text-xs text-rose-600 dark:text-rose-400">
                That isn&apos;t a full address. Copy it from the browser&apos;s
                address bar.
              </p>
            ))}
        </div>
      </div>
      <dl className="m-0 grid grid-cols-1 divide-y divide-(--border) border-t border-(--border) sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {terms.map((term) => (
          <div
            key={term.label}
            className="flex items-center gap-3 px-4 py-3 sm:px-5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
              <term.icon size={16} weight="duotone" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="truncate text-xs text-(--muted)">{term.label}</dt>
              <dd className="m-0 truncate text-sm font-semibold text-(--text)">
                {term.value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="m-0 border-t border-(--border) px-4 py-2.5 text-xs text-(--muted) sm:px-5">
        Commissions wait {program.holdDays} days for refunds, then you can
        withdraw from {formatAffiliateMoney(program.minPayout)}.
      </p>
    </ElevatedCard>
  );
}

/** The pasted address with ?ref=CODE, or null when it is not an address. */
function buildLink(page: string, code: string): string | null {
  if (!page) return null;
  try {
    const url = new URL(page);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.searchParams.set("ref", code);
    return url.toString();
  } catch {
    return null;
  }
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_60%,transparent)] py-1.5 pr-1.5 pl-3.5">
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-(--text) select-all">
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
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-(--accent) px-3.5 text-sm font-bold text-(--on-accent) hover:opacity-90"
      >
        {copied ? (
          <Check size={15} weight="bold" aria-hidden="true" />
        ) : (
          <Copy size={15} weight="bold" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
