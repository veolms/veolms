import { useState } from "react";
import type { MarketingEmail } from "@veolms/contracts";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { StopCircleIcon as StopCircle } from "@phosphor-icons/react/StopCircle";
import { Button } from "../components/Button";
import { getApiError } from "../lib/api-error";
import type { NavigateTo } from "../routing/navigation";
import {
  useCancelMarketingEmail,
  useDuplicateMarketingEmail,
  useResendMarketingEmail,
} from "../services/marketing";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import { fieldClass } from "../workshops/workshopHelpers";
import { MarketingPreview } from "./MarketingPreview";
import { MarketingReport } from "./MarketingReport";
import {
  MARKETING_PATH,
  emailStatusClass,
  emailStatusLabel,
  formatWhen,
  marketingEmailPath,
} from "./marketingHelpers";

/** A broadcast that has started: its results, and what can still be done. */
export function MarketingSentEmail({
  email,
  onNavigatePage,
  setNotice,
}: {
  email: MarketingEmail;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}) {
  const duplicate = useDuplicateMarketingEmail();
  const resend = useResendMarketingEmail();
  const cancel = useCancelMarketingEmail();
  const [resendOpen, setResendOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [subject, setSubject] = useState(
    `In case you missed it: ${email.subject}`.slice(0, 150),
  );
  const [error, setError] = useState<string | null>(null);
  const finished = email.status === "sent" || email.status === "cancelled";
  const notOpened = email.stats.sent - email.stats.opened;
  const isResend = email.audience?.segment.type === "not_opened";

  async function copy() {
    try {
      const created = await duplicate.mutateAsync(email.id);
      onNavigatePage?.(marketingEmailPath(created.id));
    } catch (failure) {
      setError(getApiError(failure).message);
    }
  }

  async function startResend() {
    try {
      const created = await resend.mutateAsync({ id: email.id, subject });
      setResendOpen(false);
      setNotice?.(
        "A copy for those who didn't open is ready. Check it, then send.",
      );
      onNavigatePage?.(marketingEmailPath(created.id));
    } catch (failure) {
      setError(getApiError(failure).message);
    }
  }

  return (
    <main
      className="mx-auto grid w-full max-w-[1800px] gap-6"
      aria-labelledby="marketing-sent-title"
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigatePage?.(MARKETING_PATH)}
            className="mb-4 inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-sm font-medium text-(--muted) hover:text-(--text)"
          >
            <ArrowLeft size={16} weight="bold" />
            Back to emails
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              id="marketing-sent-title"
              className="m-0 min-w-0 truncate text-[clamp(1.6rem,2.2vw,2rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)"
            >
              {email.name}
            </h1>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${emailStatusClass(email.status)}`}
            >
              {emailStatusLabel(email.status)}
            </span>
          </div>
          <p className="mt-1.5 mb-0 text-[0.88rem] leading-6 text-(--muted)">
            {email.startedAt ? `Started ${formatWhen(email.startedAt)}` : null}
            {email.finishedAt
              ? ` · finished ${formatWhen(email.finishedAt)}`
              : null}
            {" · "}“{email.subject}”
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {email.status === "sending" ? (
            <Button variant="danger" onClick={() => setStopOpen(true)}>
              <StopCircle size={16} />
              Stop sending
            </Button>
          ) : null}
          <Button
            variant="quiet"
            onClick={() => void copy()}
            disabled={duplicate.isPending}
          >
            <Copy size={16} />
            Duplicate
          </Button>
          {finished && !isResend ? (
            <Button
              onClick={() => setResendOpen(true)}
              disabled={notOpened <= 0}
            >
              <ArrowClockwise size={16} weight="bold" />
              Resend to people who didn’t open
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500"
        >
          {error}
        </div>
      ) : null}

      <div className="grid w-full min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]">
        <MarketingReport email={email} />
        <div className="min-w-0 xl:sticky xl:top-4">
          <MarketingPreview
            subject={email.subject}
            preheader={email.preheader}
            blocks={email.blocks}
          />
        </div>
      </div>

      <ConfirmActionModal
        id="marketing-resend"
        isOpen={resendOpen}
        isPending={resend.isPending}
        onClose={() => setResendOpen(false)}
        onConfirm={() => void startResend()}
        icon={ArrowClockwise}
        title="Resend to people who didn't open"
        description="A copy goes only to those who didn't open the first email. A new subject line gives it a second chance. You'll check it before it's sent."
        cancelLabel="Cancel"
        confirmLabel="Make the copy"
        pendingLabel="Making…"
        confirmDisabled={!subject.trim()}
      >
        <div className="grid gap-1.5 text-left">
          <label
            htmlFor="marketing-resend-subject"
            className="text-[13px] font-medium text-(--text)"
          >
            New subject line
          </label>
          <input
            id="marketing-resend-subject"
            type="text"
            value={subject}
            maxLength={150}
            onChange={(event) => setSubject(event.target.value)}
            className={`${fieldClass} w-full`}
          />
        </div>
      </ConfirmActionModal>

      <ConfirmActionModal
        id="marketing-stop"
        isOpen={stopOpen}
        isPending={cancel.isPending}
        onClose={() => setStopOpen(false)}
        onConfirm={() =>
          void cancel
            .mutateAsync(email.id)
            .then(() => setStopOpen(false))
            .catch((failure: unknown) => setError(getApiError(failure).message))
        }
        icon={StopCircle}
        tone="danger"
        title="Stop sending this email?"
        description="People who already got it keep it. Nobody else will get it, and it can't be restarted."
        cancelLabel="Keep sending"
        confirmLabel="Stop sending"
        pendingLabel="Stopping…"
      />
    </main>
  );
}
