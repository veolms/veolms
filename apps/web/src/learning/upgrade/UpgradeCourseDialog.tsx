import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { LockOpenIcon as LockOpen } from "@phosphor-icons/react/LockOpen";
import { formatMoney } from "@veolms/contracts/commerce/money";
import { Button } from "../../components/Button";
import { useCheckoutPreview } from "../../services/payments";
import { useCourseUpgradePurchase } from "./useCourseUpgradePurchase";

const PhoneVerificationDialog = lazy(
  () => import("../../auth/PhoneVerificationDialog"),
);

export interface UpgradeCourseDialogProps {
  courseId: string;
  courseTitle: string;
  onClose: () => void;
  /** The whole course was bought: the lesson asks for its video again. */
  onUnlocked: () => void;
}

/**
 * For a learner who holds part of a course (an unlisted course that opens
 * some of its sections): what the rest costs, with what they paid for the
 * part taken off, and the payment for it, without leaving the lesson. Every
 * amount here is the server's (`/checkout/preview`); the page only shows it.
 */
export default function UpgradeCourseDialog({
  courseId,
  courseTitle,
  onClose,
  onUnlocked,
}: UpgradeCourseDialogProps) {
  const preview = useCheckoutPreview();
  const purchase = useCourseUpgradePurchase({
    courseId,
    courseTitle,
    onUnlocked,
  });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const payRef = useRef<HTMLButtonElement>(null);
  // Set when the dialog is closed from here (put away for the payment
  // window, or taken down), so that is not read as the learner closing it.
  const closedHereRef = useRef(false);
  const requestPreview = preview.mutate;

  useEffect(() => {
    requestPreview({ items: [{ itemType: "course", courseId }] });
  }, [courseId, requestPreview]);

  // A modal dialog: focus stays in it and the lesson behind is inert. When
  // it goes, focus goes back to what opened it ("Get the full course").
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closedHereRef.current = false;
    if (!dialog.open) dialog.showModal();
    return () => {
      closedHereRef.current = true;
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // The gateway draws its payment window in the page, under the top layer:
  // a modal dialog would cover it and make it inert. The dialog steps aside
  // while the window is open and comes back when it ends.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (purchase.gatewayOpen) {
      closedHereRef.current = true;
      if (dialog.open) dialog.close();
    } else if (!dialog.open) {
      closedHereRef.current = false;
      dialog.showModal();
    }
  }, [purchase.gatewayOpen]);

  const pricing = preview.data?.pricing;
  useEffect(() => {
    if (pricing) payRef.current?.focus();
  }, [pricing]);

  const money = (amount: number) =>
    formatMoney(amount, { currency: pricing?.currency, unit: "major" });
  const credit = pricing?.upgradeCredit;
  const fullPrice =
    pricing?.subtotalAmount ??
    (pricing ? pricing.totalAmount + pricing.discountAmount : 0);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="upgrade-course-title"
      aria-describedby="upgrade-course-description"
      // Escape asks to close; not while a payment is under way.
      onCancel={(event) => {
        event.preventDefault();
        if (!purchase.busy) onClose();
      }}
      // The browser closes it by itself on a second Escape.
      onClose={(event) => {
        if (!closedHereRef.current && !event.currentTarget.open) onClose();
      }}
      // The dialog covers the screen with the card in its middle: a click on
      // the dialog itself is a click on the backdrop around the card.
      onClick={(event) => {
        if (event.target === event.currentTarget && !purchase.busy) onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none place-items-center overflow-y-auto border-0 bg-transparent p-4 text-(--text) open:grid backdrop:bg-black/60 backdrop:backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-[20px] bg-(--card-surface,var(--surface)) p-5 text-(--text) shadow-[var(--surface-frame-edge-shadow),var(--card-floating-shadow)] sm:rounded-3xl sm:p-6">
        <div className="grid size-11 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent-ink,var(--accent))">
          <LockOpen size={24} weight="duotone" aria-hidden="true" />
        </div>
        <h2
          id="upgrade-course-title"
          className="mt-4 text-xl font-bold tracking-tight"
        >
          Unlock the full course
        </h2>
        <p
          id="upgrade-course-description"
          className="mt-2 text-sm leading-relaxed text-(--text-secondary)"
        >
          {credit && credit.from.length > 0
            ? `${credit.from.join(", ")} gave you part of ${courseTitle}. Pay the difference to open every lesson.`
            : `Get every lesson of ${courseTitle}.`}
        </p>

        <div className="mt-5 rounded-xl border border-(--border) p-4 text-sm">
          {preview.isError ? (
            <div className="flex flex-col items-start gap-3">
              <p className="m-0 text-rose-500">
                {preview.error?.message ?? "The price could not be loaded."}
              </p>
              <Button
                type="button"
                variant="quiet"
                onClick={() =>
                  requestPreview({ items: [{ itemType: "course", courseId }] })
                }
              >
                Try again
              </Button>
            </div>
          ) : !pricing ? (
            <div className="flex flex-col gap-2.5" aria-busy="true">
              <span className="h-4 w-3/4 animate-pulse rounded bg-(--surface-strong)" />
              <span className="h-4 w-1/2 animate-pulse rounded bg-(--surface-strong)" />
              <span className="h-5 w-2/3 animate-pulse rounded bg-(--surface-strong)" />
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-4 py-1 text-(--text-secondary)">
                <span>{courseTitle}</span>
                <span className="shrink-0">{money(fullPrice)}</span>
              </div>
              {credit && credit.amount > 0 && (
                <div className="flex justify-between gap-4 py-1 text-(--text-secondary)">
                  <span>Already paid for {credit.from.join(", ")}</span>
                  <span className="shrink-0">−{money(credit.amount)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] pt-2 text-base font-bold">
                <span>To pay</span>
                <span className="text-(--accent)">
                  {money(pricing.totalAmount)}
                </span>
              </div>
            </>
          )}
        </div>

        {purchase.notice && (
          <p className="mt-4 text-sm text-(--text-secondary)" role="status">
            {purchase.notice}
          </p>
        )}
        {purchase.error && (
          <p className="mt-4 text-sm text-rose-500" role="alert">
            {purchase.error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="quiet"
            motion="static"
            onClick={onClose}
            disabled={purchase.busy}
          >
            Not now
          </Button>
          <Button
            ref={payRef}
            type="button"
            onClick={() => void purchase.pay()}
            disabled={!pricing || purchase.busy}
          >
            {purchase.busy
              ? "Processing…"
              : pricing
                ? `Pay ${money(pricing.totalAmount)}`
                : "Pay"}
          </Button>
        </div>
      </div>

      {purchase.needsPhone && (
        <Suspense fallback={null}>
          <PhoneVerificationDialog
            purpose="pay"
            savedPhoneNo={purchase.savedPhoneNo}
            onClose={purchase.closePhoneCheck}
            onVerified={() => {
              purchase.closePhoneCheck();
              void purchase.pay();
            }}
          />
        </Suspense>
      )}
    </dialog>
  );
}
