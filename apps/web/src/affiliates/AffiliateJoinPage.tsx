import { HandshakeIcon as Handshake } from "@phosphor-icons/react/Handshake";
import { AFFILIATE_CODE_PATTERN } from "@veolms/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "../components/Button";
import { ElevatedCard } from "../components/ElevatedCard";
import { PageHeading } from "../components/PageHeading";
import { useCurrentUser } from "../services/auth";
import {
  useAffiliateMe,
  useAffiliateProgram,
  useApplyAffiliate,
} from "../services/affiliates";
import { inputClassName } from "../team/TeamBits";
import { formatAffiliateMoney, formatAffiliateRate } from "./affiliateFormat";

/**
 * /affiliates/join: the program's rules in plain words, and the form to
 * apply (or to accept an invitation; the server knows which). A visitor is
 * asked to sign in first; someone who already joined goes to /affiliate.
 */
export function AffiliateJoinPage() {
  const navigate = useNavigate();
  const { data: user, isPending: userPending } = useCurrentUser();
  const program = useAffiliateProgram();
  const me = useAffiliateMe({ enabled: Boolean(user) });
  const apply = useApplyAffiliate();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (me.data) void navigate("/affiliate", { replace: true });
  }, [me.data, navigate]);

  const codeInvalid =
    code.trim() !== "" && !AFFILIATE_CODE_PATTERN.test(code.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!accepted || codeInvalid) return;
    apply.mutate(
      {
        acceptTerms: true,
        ...(code.trim() ? { code: code.trim() } : {}),
        ...(note.trim() ? { applicationNote: note.trim() } : {}),
      },
      { onSuccess: () => void navigate("/affiliate") },
    );
  }

  const facts = program.data;
  return (
    <main
      className="flex w-full min-w-0 flex-col gap-6 font-sans"
      aria-labelledby="affiliate-join-title"
    >
      <PageHeading
        id="affiliate-join-title"
        title="Become an affiliate"
        description="Share the academy with your audience and earn a commission on every paid purchase you bring."
      />

      {program.isPending ? (
        <ElevatedCard
          padded
          className="h-48 animate-pulse"
          aria-hidden="true"
        />
      ) : !facts?.enabled ? (
        <ElevatedCard
          padded
          className="flex flex-col items-center gap-2 py-10 text-center"
        >
          <Handshake
            size={40}
            weight="duotone"
            className="text-(--accent)"
            aria-hidden="true"
          />
          <p className="m-0 font-semibold text-(--text)">
            The affiliate program isn&apos;t open
          </p>
          <p className="m-0 max-w-sm text-sm text-(--muted)">
            Check back later.
          </p>
        </ElevatedCard>
      ) : (
        <>
          <ElevatedCard padded className="flex flex-col gap-4">
            <h2 className="m-0 text-base font-semibold text-(--text)">
              How it works
            </h2>
            <dl className="m-0 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <Fact
                label="You earn"
                value={formatAffiliateRate(facts.defaultRate)}
                detail="of each purchase, before tax"
              />
              <Fact
                label="A click counts for"
                value={`${facts.attributionWindowDays} days`}
                detail="the last link clicked wins"
              />
              <Fact
                label="Commissions are held"
                value={`${facts.holdDays} days`}
                detail="the refund period"
              />
              <Fact
                label="Payouts from"
                value={formatAffiliateMoney({
                  amountMinor: facts.minPayoutMinor,
                  currency: "INR",
                })}
                detail="by UPI or bank transfer"
              />
            </dl>
            {facts.buyerDiscountPercent > 0 ? (
              <p className="m-0 text-sm text-(--text-secondary)">
                Your code also gives your buyers {facts.buyerDiscountPercent}%
                off.
              </p>
            ) : null}
          </ElevatedCard>

          {userPending || (user && me.isPending) ? null : !user ? (
            <ElevatedCard
              padded
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="m-0 text-sm text-(--text-secondary)">
                Sign in or create an account to apply.
              </p>
              <Link
                to={`/login?returnTo=${encodeURIComponent("/affiliates/join")}`}
                className="inline-flex h-10 items-center rounded-lg bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) no-underline hover:bg-(--accent-hover)"
              >
                Sign in to apply
              </Link>
            </ElevatedCard>
          ) : (
            <ElevatedCard
              as="form"
              padded
              className="flex flex-col gap-4"
              onSubmit={submit}
            >
              <h2 className="m-0 text-base font-semibold text-(--text)">
                {facts.joinMode === "invite_only"
                  ? "Accept your invitation"
                  : "Apply"}
              </h2>
              {facts.joinMode !== "invite_only" ? (
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-(--text)">
                  Your code{" "}
                  <span className="font-normal text-(--muted)">
                    (optional; we&apos;ll suggest one from your name)
                  </span>
                  <input
                    className={inputClassName}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="RAHUL"
                    maxLength={20}
                    autoCapitalize="characters"
                    aria-invalid={codeInvalid}
                  />
                  {codeInvalid ? (
                    <span className="text-xs font-normal text-rose-500">
                      Use 3 to 20 letters, digits or hyphens.
                    </span>
                  ) : null}
                </label>
              ) : null}
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-(--text)">
                How will you share the academy?{" "}
                <span className="font-normal text-(--muted)">(optional)</span>
                <textarea
                  className={`${inputClassName} min-h-24 py-2.5`}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                />
              </label>
              <details className="rounded-xl bg-(--surface-strong) px-3 py-2 text-sm text-(--text-secondary)">
                <summary className="cursor-pointer font-semibold text-(--text)">
                  Program terms
                </summary>
                <p className="mt-2 whitespace-pre-line">{facts.termsText}</p>
              </details>
              <label className="flex items-start gap-2 text-sm text-(--text-secondary)">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-(--accent)"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                I have read and accept the program terms.
              </label>
              {apply.error ? (
                <p role="alert" className="m-0 text-sm text-rose-500">
                  {apply.error.message}
                </p>
              ) : null}
              <div>
                <Button
                  type="submit"
                  disabled={!accepted || codeInvalid || apply.isPending}
                  className="h-10 rounded-lg px-4 text-sm font-semibold"
                >
                  {apply.isPending
                    ? "Sending…"
                    : facts.joinMode === "invite_only"
                      ? "Accept and join"
                      : "Apply"}
                </Button>
              </div>
            </ElevatedCard>
          )}
        </>
      )}
    </main>
  );
}

function Fact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-(--surface-strong) px-4 py-3">
      <dt className="text-xs text-(--muted)">{label}</dt>
      <dd className="m-0 mt-1 text-lg font-bold text-(--text)">{value}</dd>
      <dd className="m-0 text-xs text-(--muted)">{detail}</dd>
    </div>
  );
}
