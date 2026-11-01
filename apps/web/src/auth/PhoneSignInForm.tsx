import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { cn } from "../lib/utils";
import { IdentifierForm } from "./IdentifierForm";
import type { IdentifierSubmission } from "./IdentifierForm";
import {
  LoginHeading,
  loginCardCornerButtonClasses,
  loginQuietLinkClasses,
} from "./LoginCardParts";

/**
 * The login's "Sign in with phone number" step: a number with its country
 * code, for someone who cannot use their email. It leads back to the
 * welcome step, never to sign-up.
 */
export function PhoneSignInForm({
  sending,
  errorMessage,
  onBack,
  onEdit,
  onSubmit,
}: {
  sending: boolean;
  errorMessage?: string;
  /** Back to the welcome step's Google and email. */
  onBack: () => void;
  onEdit: () => void;
  onSubmit: (submission: IdentifierSubmission) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-6">
      <button
        aria-label="Back to sign-in options"
        className={cn(loginCardCornerButtonClasses, "left-3.5")}
        disabled={sending}
        onClick={onBack}
        type="button"
      >
        <CaretLeft aria-hidden size={18} weight="bold" />
      </button>
      <div className="pt-2.5">
        <LoginHeading
          title="Sign in with phone"
          subtitle="We'll text a one-time code to the phone number on your account."
        />
      </div>
      <IdentifierForm
        errorMessage={errorMessage}
        errorPlacement="below"
        footnote={
          <>
            Have email access?{" "}
            <button
              className={loginQuietLinkClasses}
              disabled={sending}
              onClick={onBack}
              type="button"
            >
              Use email instead
            </button>
          </>
        }
        forcedMethod="mobile"
        mobileLabel="Phone number"
        onEdit={onEdit}
        onSubmit={onSubmit}
        status={sending ? "sending" : "idle"}
        submitLabel="Send code"
      />
    </div>
  );
}
