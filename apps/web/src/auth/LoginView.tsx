import { useEffect, useReducer, useRef, useState } from "react";
import { rememberCodeSignIn, useLastGoogleAccount } from "./lastGoogleAccount";
import { LoginDivider, LoginHeading } from "./LoginCardParts";
import {
  codeSentAt,
  forgetCodeSent,
  hasUsableSentCode,
  rememberCodeSent,
} from "./sentCode";
import { useNavigate, useSearchParams } from "react-router";
import { AccountForm } from "./AccountForm";
import { MfaEnrollmentSetup } from "./MfaEnrollmentSetup";
import { AuthBrandMark } from "./AuthBrandPanel";
import { IdentifierForm } from "./IdentifierForm";
import { OtpForm } from "./OtpForm";
import { AuthProgress } from "./AuthProgress";
import { SocialLoginActions } from "./SocialLoginActions";
import { MfaStepUp } from "./MfaStepUp";
import {
  AUTH_CARD_HEADING_ID,
  RESEND_COOLDOWN_SECONDS,
  authFlowReducer,
  initialAuthFlowState,
} from "./authFlow";
import type { AuthFlowState, AuthIdentifier } from "./authFlow";
import { generateUniqueUsername } from "./username";
import { getSecondaryVerificationMethodRequired } from "./authConfig";
import {
  LOGIN_PURPOSE_PARAM,
  resolveAuthenticatedDestination,
  sanitizeReturnTo,
} from "../routing/routeAccess";
import { productName } from "../routing/routeDescriptors";
import { useLogin, useRegister, useSendOtp } from "../services/auth";
import { authStore } from "../store/auth.store";
import { GoogleOneTap } from "./GoogleOneTap.tsx";

function resolvePayload(identifier: AuthIdentifier) {
  return identifier.method === "email"
    ? { email: identifier.email }
    : { phoneNo: identifier.phoneNo };
}

const ALREADY_SENT_NOTICE = "We sent you a code a moment ago — enter it below.";

// True when the server refuses a send because it is too soon after one this
// tab made to the same destination. The server answers its other request
// limits with the same code, so the earlier send has to be known here.
function isRefusedAsAlreadySent(identifier: AuthIdentifier, error: unknown) {
  const sentAt = codeSentAt(identifier);
  return (
    (error as { code?: string } | null)?.code === "RATE_LIMIT_EXCEEDED" &&
    sentAt !== null &&
    Date.now() - sentAt < RESEND_COOLDOWN_SECONDS * 1000
  );
}

type OtpStepState = Extract<
  AuthFlowState,
  { status: "otp" | "verifyingOtp" | "sendingOtp" }
>;

// Returns the flow narrowed to an OTP-entry step, or null. Not a type guard:
// a first send (sendCount 0) is a sendingOtp state that is NOT an OTP step.
function getOtpStep(flow: AuthFlowState): OtpStepState | null {
  return flow.status === "otp" ||
    flow.status === "verifyingOtp" ||
    (flow.status === "sendingOtp" && flow.sendCount > 0)
    ? flow
    : null;
}

export function LoginView({
  returnTo: returnToOverride,
  onAuthenticated,
}: {
  /**
   * Where the visitor goes once signed in. The login pop-up passes the page
   * it is open over; without it the address's `returnTo` is used.
   */
  returnTo?: string;
  /** Takes over from navigating away once the visitor is signed in. */
  onAuthenticated?: () => void;
} = {}) {
  const [flow, dispatch] = useReducer(authFlowReducer, initialAuthFlowState);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  // A failed Google sign-in (the button or One Tap): shown by the Google
  // button, so the email field is never marked for it.
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [primaryVerifiedIdentifier, setPrimaryVerifiedIdentifier] =
    useState<AuthIdentifier | null>(null);
  const [pendingSecondaryMethod, setPendingSecondaryMethod] = useState<
    "email" | "mobile" | null
  >(null);
  const [mfaCapabilities, setMfaCapabilities] = useState<{
    allowPasskey: boolean;
    allowAuthenticator: boolean;
  }>({
    allowPasskey: true,
    allowAuthenticator: true,
  });
  const [oneTapPending, setOneTapPending] = useState(false);

  const registrationOtpCodesRef = useRef<
    Partial<Record<"email" | "mobile", string>>
  >({});
  // The name typed on the name step, kept while the visitor is sent back to
  // the code step, so it is still filled in when they return.
  const keptAccountNameRef = useRef("");
  const otpSnapshotRef = useRef<{
    identifier: AuthIdentifier;
    code: string;
    sendCount: number;
  } | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedReturnTo = returnToOverride ?? searchParams.get("returnTo");
  const returnTo = sanitizeReturnTo(requestedReturnTo);
  const returnPath = returnTo?.split(/[?#]/, 1)[0] ?? "";
  const isReturningToDiscussions =
    returnPath === "/discussions" || returnPath.startsWith("/discussions/");
  // Asked to log in from a lesson's discussion (the reply box, say).
  const isJoiningDiscussion =
    isReturningToDiscussions ||
    searchParams.get(LOGIN_PURPOSE_PARAM) === "discussion";
  // A browser that has signed in with Google before is greeted back, and
  // its account leads the card (see SocialLoginActions).
  const { account: rememberedGoogleAccount } = useLastGoogleAccount();
  const isReturningVisitor = rememberedGoogleAccount !== null;

  // Keep the last OTP screen so it stays visible (as "verifying") during the
  // authenticated redirect. Written in an effect, not during render.
  useEffect(() => {
    const otpStep = getOtpStep(flow);
    if (otpStep) {
      otpSnapshotRef.current = {
        identifier: otpStep.identifier,
        code: "code" in otpStep ? otpStep.code : "",
        sendCount: otpStep.sendCount,
      };
    } else if (flow.status !== "authenticated") {
      otpSnapshotRef.current = null;
    }
  }, [flow]);

  const sendOtpMutation = useSendOtp();
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  useEffect(() => {
    if (flow.status !== "authenticated") return;
    if (onAuthenticated) {
      onAuthenticated();
      return;
    }
    navigate(resolveAuthenticatedDestination(requestedReturnTo), {
      replace: true,
    });
  }, [flow.status, navigate, onAuthenticated, requestedReturnTo]);

  const handleSendCode = async (identifier: AuthIdentifier) => {
    if (sendOtpMutation.isPending) return;
    setIdentifierError(null);
    setGoogleError(null);
    dispatch({ type: "SUBMIT_IDENTIFIER", identifier });

    if (hasUsableSentCode(identifier)) {
      setOtpNotice(ALREADY_SENT_NOTICE);
      dispatch({ type: "OTP_SENT" });
      return;
    }

    setOtpNotice(null);

    try {
      const sent = await sendOtpMutation.mutateAsync(
        resolvePayload(identifier),
      );
      rememberCodeSent(identifier, sent.codeExpiresInSeconds);
      dispatch({ type: "OTP_SENT" });
    } catch (err: unknown) {
      // The visitor asked for a code, closed the pop-up and came back within
      // the minute. Refusing to send another used to leave them on this step
      // with "wait 60 seconds" and no way to enter the code they already
      // have, so go to the code step as if it had just been sent.
      if (isRefusedAsAlreadySent(identifier, err)) {
        setOtpNotice(ALREADY_SENT_NOTICE);
        dispatch({ type: "OTP_SENT" });
        return;
      }

      const errorObj = err as { message?: string };
      const message =
        errorObj?.message || "Something went wrong. Please try again.";
      setIdentifierError(message);
      dispatch({ type: "OTP_SEND_FAILED" });
    }
  };

  const handleResendCode = async () => {
    if (!("identifier" in flow) || sendOtpMutation.isPending) return;
    const { identifier } = flow;
    setOtpError(null);
    dispatch({ type: "RESEND_OTP" });

    try {
      const sent = await sendOtpMutation.mutateAsync(
        resolvePayload(identifier),
      );
      rememberCodeSent(identifier, sent.codeExpiresInSeconds);
      setOtpNotice(null);
      dispatch({ type: "OTP_SENT" });
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      const message =
        errorObj?.message || "Something went wrong. Please try again.";
      setOtpError(message);
      dispatch({ type: "OTP_SEND_FAILED" });
    }
  };

  const handleVerifyCode = async (
    identifier: AuthIdentifier,
    directCode?: string,
  ) => {
    if (loginMutation.isPending) return;
    const rawCode = directCode ?? ("code" in flow ? flow.code : "");
    const code = rawCode.trim();
    if (!code || code.length !== 6) return;

    setOtpError(null);
    dispatch({ type: "SUBMIT_OTP" });

    try {
      const response = await loginMutation.mutateAsync({
        ...resolvePayload(identifier),
        code,
      });
      forgetCodeSent();

      if (response.mfaRequired) {
        const allowPasskey = Boolean(response.passkeyEnabled);
        const allowAuthenticator = Boolean(response.totpEnabled);

        setMfaCapabilities({ allowPasskey, allowAuthenticator });

        if (allowPasskey) {
          dispatch({ type: "OTP_VERIFIED", next: "twoFactorPasskey" });
          return;
        }
        if (allowAuthenticator) {
          dispatch({ type: "OTP_VERIFIED", next: "twoFactorAuthenticator" });
          return;
        }
        if (response.mfaMandatory) {
          dispatch({ type: "OTP_VERIFIED", next: "adminMfaSetup" });
          return;
        }
      }

      rememberCodeSignIn();
      authStore.setUser(response.user);
      dispatch({ type: "OTP_VERIFIED", next: "authenticated" });
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };

      // By its code only. Any refusal whose wording happened to mention
      // registering was once taken for "this is a new account" as well, and
      // moved the visitor on to the name step with a code nobody had checked.
      if (
        errorObj.code === "REGISTRATION_REQUIRED" ||
        errorObj.code === "USER_NOT_FOUND" ||
        errorObj.code === "NO_USER"
      ) {
        const requiredSecondary =
          primaryVerifiedIdentifier === null
            ? getSecondaryVerificationMethodRequired(identifier.method)
            : null;

        if (requiredSecondary !== null) {
          registrationOtpCodesRef.current[identifier.method] = code;
          setPrimaryVerifiedIdentifier(identifier);
          setPendingSecondaryMethod(requiredSecondary);
          dispatch({ type: "CHANGE_IDENTIFIER" });
          return;
        }

        registrationOtpCodesRef.current[identifier.method] = code;
        setPendingSecondaryMethod(null);
        dispatch({
          type: "OTP_VERIFIED",
          next: "newUserName",
          name: keptAccountNameRef.current,
        });
        return;
      }

      const message =
        errorObj?.message || "Something went wrong. Please try again.";
      setOtpError(message);
      dispatch({ type: "OTP_REJECTED", reason: "verifyFailed" });
    }
  };

  const handleCreateAccount = async (name: string) => {
    if (!("identifier" in flow) || registerMutation.isPending) return;
    const { identifier } = flow;
    setAccountError(null);
    dispatch({ type: "SUBMIT_ACCOUNT_NAME", name });

    try {
      const username = generateUniqueUsername(name);
      const codePayload = primaryVerifiedIdentifier
        ? {
            emailCode: registrationOtpCodesRef.current.email,
            phoneCode: registrationOtpCodesRef.current.mobile,
          }
        : { code: registrationOtpCodesRef.current[identifier.method] };
      const payload = {
        ...(primaryVerifiedIdentifier
          ? resolvePayload(primaryVerifiedIdentifier)
          : {}),
        ...resolvePayload(identifier),
        ...codePayload,
        displayName: name,
        username,
      };

      const response = await registerMutation.mutateAsync(payload);
      forgetCodeSent();
      rememberCodeSignIn();
      authStore.setUser(response.user);

      if (
        response.mfaRequired &&
        response.mfaMandatory &&
        !response.passkeyEnabled &&
        !response.totpEnabled
      ) {
        dispatch({ type: "ACCOUNT_CREATED_REQUIRES_MFA" });
        return;
      }

      dispatch({ type: "ACCOUNT_CREATED" });
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      const message =
        errorObj?.message || "Something went wrong. Please try again.";

      // For a new account the server checks the code only now. A refused code
      // used to be reported under the Name field, which the visitor cannot
      // fix there; show it on the code step instead and keep the name.
      if (errorObj?.code === "INVALID_CODE" && !primaryVerifiedIdentifier) {
        keptAccountNameRef.current = name;
        setOtpError(message);
        dispatch({ type: "ACCOUNT_CODE_REJECTED" });
        return;
      }

      setAccountError(message);
      dispatch({ type: "ACCOUNT_CREATION_FAILED", message });
    }
  };

  function renderStep() {
    if (flow.status === "adminMfaSetup") {
      return (
        <MfaEnrollmentSetup
          onDone={() => {
            dispatch({ type: "ADMIN_MFA_SETUP_DONE" });
          }}
          onClearError={() => {
            dispatch({ type: "ADMIN_MFA_SETUP_ERROR_CLEARED" });
          }}
          onError={(message) => {
            dispatch({ type: "ADMIN_MFA_SETUP_FAILED", message });
          }}
        />
      );
    }

    if (flow.status === "newUserName" || flow.status === "creatingAccount") {
      return (
        <AccountForm
          errorMessage={accountError ?? undefined}
          identifier={primaryVerifiedIdentifier ?? flow.identifier}
          secondaryIdentifier={
            primaryVerifiedIdentifier ? flow.identifier : undefined
          }
          name={"name" in flow ? flow.name : ""}
          onBackToOtp={() => {
            setAccountError(null);
            keptAccountNameRef.current = "name" in flow ? flow.name : "";
            dispatch({ type: "OTP_SENT" });
          }}
          onIdentifierChange={() => {
            setAccountError(null);
            keptAccountNameRef.current = "";
            registrationOtpCodesRef.current = {};
            setPrimaryVerifiedIdentifier(null);
            setPendingSecondaryMethod(null);
            dispatch({ type: "CHANGE_IDENTIFIER" });
          }}
          onNameChange={(name) => {
            setAccountError(null);
            dispatch({ type: "CHANGE_ACCOUNT_NAME", name });
          }}
          onSubmit={handleCreateAccount}
          status={
            flow.status === "creatingAccount" || registerMutation.isPending
              ? "creating"
              : "idle"
          }
        />
      );
    }

    const otpStep = getOtpStep(flow);
    if (otpStep) {
      return (
        <OtpForm
          code={"code" in otpStep ? otpStep.code : ""}
          errorMessage={otpError}
          failure={otpStep.status === "otp" ? otpStep.failure : null}
          identifier={otpStep.identifier}
          notice={otpNotice}
          onCodeChange={(code) => {
            setOtpError(null);
            dispatch({ type: "CHANGE_OTP_CODE", code });
          }}
          onIdentifierChange={() => {
            setOtpError(null);
            keptAccountNameRef.current = "";
            registrationOtpCodesRef.current = {};
            setPrimaryVerifiedIdentifier(null);
            setPendingSecondaryMethod(null);
            dispatch({ type: "CHANGE_IDENTIFIER" });
          }}
          onResend={handleResendCode}
          onSubmit={(code) => handleVerifyCode(otpStep.identifier, code)}
          resending={otpStep.status === "sendingOtp"}
          sendCount={otpStep.sendCount}
          sentAt={codeSentAt(otpStep.identifier)}
          status={otpStep.status === "verifyingOtp" ? "verifying" : "idle"}
        />
      );
    }

    if (
      flow.status === "twoFactorPasskey" ||
      flow.status === "twoFactorAuthenticator" ||
      flow.status === "verifyingTwoFactor"
    ) {
      return (
        <MfaStepUp
          allowAuthenticator={mfaCapabilities.allowAuthenticator}
          allowPasskey={mfaCapabilities.allowPasskey}
          onBack={() => {
            setIdentifierError(null);
            setOtpError(null);
            setAccountError(null);
            registrationOtpCodesRef.current = {};
            setPrimaryVerifiedIdentifier(null);
            setPendingSecondaryMethod(null);
            dispatch({ type: "CHANGE_IDENTIFIER" });
          }}
          onDone={() => {
            dispatch({ type: "TWO_FACTOR_VERIFIED" });
          }}
        />
      );
    }

    if (flow.status === "authenticated") {
      const snapshot = otpSnapshotRef.current;
      if (snapshot) {
        return (
          <OtpForm
            code={snapshot.code}
            errorMessage={otpError}
            failure={null}
            identifier={snapshot.identifier}
            notice={otpNotice}
            onCodeChange={() => undefined}
            onIdentifierChange={() => undefined}
            onResend={() => undefined}
            onSubmit={() => undefined}
            sendCount={snapshot.sendCount}
            status="verifying"
          />
        );
      }

      return (
        <AuthProgress
          detail={
            isReturningToDiscussions
              ? "Opening Discussions."
              : "Opening your courses."
          }
          title="Signing you in"
        />
      );
    }

    const brand = (
      // A whole-pixel height: the logo's height sets every edge below
      // it, and a fraction there drew the field and the button a screen
      // pixel apart in height on scaled displays.
      <AuthBrandMark className="block h-9 text-(--text) [&_svg]:block [&_svg]:h-full [&_svg]:w-auto" />
    );

    if (pendingSecondaryMethod) {
      return (
        <div className="flex w-full flex-col gap-6">
          <div className="flex flex-col items-start gap-4.5">
            {brand}
            <LoginHeading
              title={
                pendingSecondaryMethod === "email"
                  ? "Link your email"
                  : "Link your mobile"
              }
              subtitle={
                pendingSecondaryMethod === "email"
                  ? "Verify your email to finish creating your account."
                  : "Verify your mobile number to finish creating your account."
              }
            />
          </div>
          <IdentifierForm
            errorMessage={identifierError ?? undefined}
            onEdit={() => setIdentifierError(null)}
            forcedMethod={pendingSecondaryMethod}
            onSubmit={(identifier) => handleSendCode(identifier)}
            status={
              flow.status === "sendingOtp" || sendOtpMutation.isPending
                ? "sending"
                : "idle"
            }
          />
        </div>
      );
    }

    const welcomeSubtitle = isJoiningDiscussion
      ? isReturningVisitor
        ? "Log in to join the discussion"
        : "Log in or sign up to join the discussion"
      : isReturningVisitor
        ? "Log in to continue"
        : "Log in or sign up to continue";

    return (
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col items-start gap-4.5">
          {brand}
          <LoginHeading
            title={
              isReturningVisitor ? "Welcome back" : `Welcome to ${productName}`
            }
            subtitle={welcomeSubtitle}
          />
        </div>
        <SocialLoginActions
          errorMessage={googleError}
          onError={setGoogleError}
          oneTapPending={oneTapPending}
          returnTo={requestedReturnTo}
        />
        <LoginDivider />
        <IdentifierForm
          disabled={oneTapPending}
          errorMessage={identifierError ?? undefined}
          onEdit={() => setIdentifierError(null)}
          onSubmit={(identifier) => handleSendCode(identifier)}
          status={
            flow.status === "sendingOtp" || sendOtpMutation.isPending
              ? "sending"
              : "idle"
          }
          submitTone={isReturningVisitor ? "secondary" : "primary"}
        />
      </div>
    );
  }

  const welcomeStep =
    !pendingSecondaryMethod &&
    (flow.status === "identifier" ||
      flow.status === "error" ||
      (flow.status === "sendingOtp" && flow.sendCount === 0));

  return (
    <>
      <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
        {renderStep()}
        {welcomeStep ? (
          <GoogleOneTap
            onError={(message) => {
              setOneTapPending(false);
              setGoogleError(message);
            }}
            onPendingChange={setOneTapPending}
            returnTo={requestedReturnTo}
          />
        ) : null}
      </section>
    </>
  );
}
