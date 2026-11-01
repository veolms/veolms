import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons/Icon";
import {
  useSendPhoneVerificationOtp,
  useVerifyPhoneNumber,
} from "../services/auth";
import { authStore } from "../store/auth.store";
import type { AuthUser } from "../store/auth.store";
import { AuthCardDialog } from "./AuthCardDialog";
import { AUTH_CARD_HEADING_ID, RESEND_COOLDOWN_SECONDS } from "./authFlow";
import { IdentifierForm } from "./IdentifierForm";
import {
  findCountryByPhoneNumber,
  formatNationalPhoneNumber,
} from "./identifier";
import { LoginHeading } from "./LoginCardParts";
import { OtpForm } from "./OtpForm";
import {
  codeSentAt,
  forgetCodeSent,
  hasUsableSentCode,
  rememberCodeSent,
} from "./sentCode";

type Step =
  | { kind: "number" }
  | { kind: "code"; phoneNo: string; sentAt: number; sendCount: number };

const SENT_CODE_SCOPE = "phone-verification";
const ALREADY_SENT_NOTICE = "We sent you a code a moment ago — enter it below.";

/** The learner's own number in full ("+91 83173 90847"), so a typo shows. */
function formatFullNumber(phoneNo: string): string {
  const country = findCountryByPhoneNumber(phoneNo);
  return country
    ? `${country.dialCode} ${formatNationalPhoneNumber(phoneNo, country)}`
    : phoneNo;
}

function readMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string } | null)?.message;
  return message || fallback;
}

/**
 * Asks a signed-in learner for their mobile number and has them confirm it
 * with a code, before their first enrolment (sign-up asks only for an
 * email). Two steps on the login card: the number, then the code. Once the
 * code is accepted, `onVerified` runs and the enrolment carries on (the
 * payment opens), with nothing more to press.
 *
 * A number already on the account but not yet verified is not asked for
 * again: the code is sent to it as the pop-up opens, which opens on the
 * code step, the number written out in full so a mistake in it shows, and
 * "Use a different number" leads back to the number, filled in to correct.
 */
export default function PhoneVerificationDialog({
  purpose,
  savedPhoneNo,
  onClose,
  onVerified,
}: {
  /** What comes after: paying, or a free enrolment. Names the last button. */
  purpose: "pay" | "enroll";
  /** The account's number, when it has one that is not verified. */
  savedPhoneNo?: string | null;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [step, setStep] = useState<Step>(() =>
    savedPhoneNo
      ? {
          kind: "code",
          phoneNo: savedPhoneNo,
          sentAt: Date.now(),
          sendCount: 1,
        }
      : { kind: "number" },
  );
  // The number the number step starts with: the saved one, then the last
  // one a code went to.
  const [numberToEdit, setNumberToEdit] = useState(savedPhoneNo ?? undefined);
  // The first code to the saved number is on its way.
  const [sendingToSaved, setSendingToSaved] = useState(Boolean(savedPhoneNo));
  const [code, setCode] = useState("");
  const [numberError, setNumberError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sendCode = useSendPhoneVerificationOtp();
  const verifyNumber = useVerifyPhoneNumber();

  // A code this tab already had sent to the number, still good: the code
  // step again, with that code, as the sign-in card does.
  const showSentCode = (phoneNo: string) => {
    const identifier = { method: "mobile", phoneNo } as const;
    setCode("");
    setNotice(ALREADY_SENT_NOTICE);
    setStep({
      kind: "code",
      phoneNo,
      sentAt: codeSentAt(identifier, SENT_CODE_SCOPE) ?? Date.now(),
      sendCount: 1,
    });
  };

  const send = async (phoneNo: string, sendCount: number) => {
    setNumberError(null);
    setCodeError(null);
    const identifier = { method: "mobile", phoneNo } as const;
    // Only a first send from the number step. "Resend" on the code step
    // asks for a new code on purpose.
    if (sendCount === 1 && hasUsableSentCode(identifier, SENT_CODE_SCOPE)) {
      showSentCode(phoneNo);
      return;
    }
    try {
      const sent = await sendCode.mutateAsync({ phoneNo });
      rememberCodeSent(identifier, sent.codeExpiresInSeconds, SENT_CODE_SCOPE);
      setCode("");
      setNotice(null);
      setStep({ kind: "code", phoneNo, sentAt: Date.now(), sendCount });
    } catch (error) {
      // Refused as too soon after a code this tab had sent there (the
      // dialog was closed and opened again): that code is the one to enter.
      const sentAt = codeSentAt(identifier, SENT_CODE_SCOPE);
      if (
        sendCount === 1 &&
        (error as { code?: string } | null)?.code === "RATE_LIMIT_EXCEEDED" &&
        sentAt !== null &&
        Date.now() - sentAt < RESEND_COOLDOWN_SECONDS * 1000
      ) {
        showSentCode(phoneNo);
        return;
      }
      const message = readMessage(
        error,
        "We could not send a code to that number. Please try again.",
      );
      if (sendCount > 1) {
        setCodeError(message);
      } else {
        // Also when it was sent by itself to the saved number: the number
        // is shown again, filled in, with what went wrong.
        setNumberToEdit(phoneNo);
        setNumberError(message);
        setStep({ kind: "number" });
      }
    }
  };

  // Sent once, as the pop-up opens (an effect, so once in strict mode too).
  const sentToSavedRef = useRef(false);
  useEffect(() => {
    if (!savedPhoneNo || sentToSavedRef.current) return;
    sentToSavedRef.current = true;
    void send(savedPhoneNo, 1).finally(() => setSendingToSaved(false));
    // Once, on opening; `send` is this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (phoneNo: string, entered: string) => {
    setCodeError(null);
    try {
      await verifyNumber.mutateAsync({ phoneNo, code: entered });
      forgetCodeSent(SENT_CODE_SCOPE);
      // The page's copy of the account learns it at once; the account
      // itself is fetched again by the mutation.
      const user = authStore.getState().user;
      if (user) {
        authStore.setUser(
          { ...user, phoneNo, mobileVerified: true } as AuthUser,
          { refresh: true },
        );
      }
      onVerified();
    } catch (error) {
      // The server's wording covers every case at length; one line is
      // enough here.
      setCodeError(
        (error as { code?: string } | null)?.code === "INVALID_CODE"
          ? "Invalid or expired OTP."
          : readMessage(error, "That code did not work. Please try again."),
      );
    }
  };

  return (
    <AuthCardDialog
      labelledBy={AUTH_CARD_HEADING_ID}
      data-phone-verification-dialog
      onClose={onClose}
    >
      <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
        {step.kind === "number" ? (
          <div className="flex w-full flex-col gap-6.5">
            <div className="flex flex-col items-center gap-4.5 pt-2.5">
              <span
                aria-hidden="true"
                className="grid size-13 place-items-center rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent-ink,var(--accent))"
              >
                <Icon aria-hidden name="mobile" size={24} />
              </span>
              <LoginHeading
                centered
                title="Add your mobile number"
                subtitle={
                  purpose === "pay"
                    ? "Verify it once before your first purchase. We'll text you a 6-digit code."
                    : "Verify it once before you enroll. We'll text you a 6-digit code."
                }
              />
            </div>
            <IdentifierForm
              errorMessage={numberError ?? undefined}
              initialPhoneNo={numberToEdit}
              footnote="You only need to do this once."
              forcedMethod="mobile"
              onEdit={() => setNumberError(null)}
              onSubmit={(submission) => {
                if (submission.method === "mobile") {
                  void send(submission.phoneNo, 1);
                }
              }}
              status={sendCode.isPending ? "sending" : "idle"}
              submitLabel="Send code"
            />
          </div>
        ) : (
          <OtpForm
            code={code}
            errorMessage={codeError}
            failure={null}
            identifier={{ method: "mobile", phoneNo: step.phoneNo }}
            notice={notice}
            subtitle={
              sendingToSaved ? (
                <>
                  Sending a 6-digit code to{" "}
                  <span className="font-semibold text-(--text)">
                    {formatFullNumber(step.phoneNo)}
                  </span>
                  …
                </>
              ) : (
                <>
                  {notice
                    ? "We already sent a code to "
                    : "We sent a 6-digit code to "}
                  <span className="font-semibold text-(--text)">
                    {formatFullNumber(step.phoneNo)}
                  </span>
                  {notice ? ". Enter it below." : ""}
                </>
              )
            }
            onCodeChange={(next) => {
              setCodeError(null);
              setCode(next);
            }}
            onIdentifierChange={() => {
              setCodeError(null);
              setNotice(null);
              setNumberToEdit(step.phoneNo);
              setStep({ kind: "number" });
            }}
            onResend={() => void send(step.phoneNo, step.sendCount + 1)}
            onSubmit={(entered) => void verify(step.phoneNo, entered)}
            resending={sendCode.isPending || sendingToSaved}
            sendCount={step.sendCount}
            sentAt={step.sentAt}
            status={verifyNumber.isPending ? "verifying" : "idle"}
            submitLabel={
              purpose === "pay"
                ? "Verify & continue to payment"
                : "Verify & enroll"
            }
          />
        )}
      </section>
    </AuthCardDialog>
  );
}
