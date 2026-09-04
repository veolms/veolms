import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AccountForm } from "./AccountForm";
import { MfaEnrollmentSetup } from "./MfaEnrollmentSetup";
import { AuthBrandMark } from "./AuthBrandPanel";
import { IdentifierForm } from "./IdentifierForm";
import { OtpForm } from "./OtpForm";
import { SocialLoginActions } from "./SocialLoginActions";
import { MfaStepUp } from "./MfaStepUp";
import {
  AUTH_CARD_HEADING_ID,
  authFlowReducer,
  initialAuthFlowState,
} from "./authFlow";
import type { AuthIdentifier } from "./authFlow";
import { generateUniqueUsername } from "./username";
import { getSecondaryVerificationMethodRequired } from "./authConfig";
import { resolveAuthenticatedDestination } from "../routing/routeAccess";
import { productName } from "../routing/routeDescriptors";
import { useLogin, useRegister, useSendOtp } from "../services/auth";
import { authStore } from "../store/auth.store";

function resolvePayload(identifier: AuthIdentifier) {
  return identifier.method === "email"
    ? { email: identifier.email }
    : { phoneNo: identifier.phoneNo };
}

export function LoginView() {
  const [flow, dispatch] = useReducer(authFlowReducer, initialAuthFlowState);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
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

  const registrationOtpCodesRef = useRef<
    Partial<Record<"email" | "mobile", string>>
  >({});
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sendOtpMutation = useSendOtp();
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  useEffect(() => {
    if (flow.status !== "authenticated") return;
    navigate(resolveAuthenticatedDestination(searchParams.get("returnTo")), {
      replace: true,
    });
  }, [flow.status, navigate, searchParams]);

  const handleSendCode = async (identifier: AuthIdentifier) => {
    if (sendOtpMutation.isPending) return;
    setIdentifierError(null);
    dispatch({ type: "SUBMIT_IDENTIFIER", identifier });

    try {
      await sendOtpMutation.mutateAsync(resolvePayload(identifier));
      dispatch({ type: "OTP_SENT" });
    } catch (err: unknown) {
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
      await sendOtpMutation.mutateAsync(resolvePayload(identifier));
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

      authStore.setUser(response.user);
      dispatch({ type: "OTP_VERIFIED", next: "authenticated" });
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };

      if (
        errorObj.code === "REGISTRATION_REQUIRED" ||
        errorObj.code === "USER_NOT_FOUND" ||
        errorObj.code === "NO_USER" ||
        (errorObj.message &&
          errorObj.message.toLowerCase().includes("register"))
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
        dispatch({ type: "OTP_VERIFIED", next: "newUserName" });
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
      const errorObj = err as { message?: string };
      const message =
        errorObj?.message || "Something went wrong. Please try again.";
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
            dispatch({ type: "OTP_SENT" });
          }}
          onIdentifierChange={() => {
            setAccountError(null);
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

    if (flow.status === "otp" || flow.status === "verifyingOtp") {
      return (
        <OtpForm
          code={flow.code}
          errorMessage={otpError}
          failure={flow.status === "otp" ? flow.failure : null}
          identifier={flow.identifier}
          onCodeChange={(code) => {
            setOtpError(null);
            dispatch({ type: "CHANGE_OTP_CODE", code });
          }}
          onIdentifierChange={() => {
            setOtpError(null);
            registrationOtpCodesRef.current = {};
            setPrimaryVerifiedIdentifier(null);
            setPendingSecondaryMethod(null);
            dispatch({ type: "CHANGE_IDENTIFIER" });
          }}
          onResend={handleResendCode}
          onSubmit={(code) => handleVerifyCode(flow.identifier, code)}
          sendCount={flow.sendCount}
          status={
            flow.status === "verifyingOtp" || loginMutation.isPending
              ? "verifying"
              : "idle"
          }
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
          onDone={() => {
            dispatch({ type: "TWO_FACTOR_VERIFIED" });
          }}
        />
      );
    }

    if (flow.status === "authenticated") {
      return (
        <div
          aria-label="Redirecting"
          role="region"
          style={{
            display: "grid",
            justifyItems: "center",
            gap: "16px",
            padding: "40px 0",
            width: "100%",
          }}
        >
          <AuthBrandMark />
          <p className="auth-mfa-setup__loading" style={{ margin: 0 }}>
            Redirecting to your profile…
          </p>
        </div>
      );
    }

    if (pendingSecondaryMethod) {
      return (
        <>
          <AuthBrandMark />
          <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
            {pendingSecondaryMethod === "email"
              ? "Link your email"
              : "Link your mobile"}
          </h1>
          <p className="auth-card__subheading">
            {pendingSecondaryMethod === "email"
              ? "Please verify your email address to complete registration."
              : "Please verify your mobile number to complete registration."}
          </p>

          <div className="auth-card__form-slot">
            <IdentifierForm
              errorMessage={identifierError ?? undefined}
              forcedMethod={pendingSecondaryMethod}
              onSubmit={(identifier) => handleSendCode(identifier)}
              status={
                flow.status === "sendingOtp" || sendOtpMutation.isPending
                  ? "sending"
                  : "idle"
              }
            />
          </div>
        </>
      );
    }

    return (
      <>
        <AuthBrandMark />
        <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
          Welcome to {productName}
        </h1>
        <p className="auth-card__subheading">
          Log in or create an account to continue.
        </p>

        <div className="auth-card__form-slot">
          <IdentifierForm
            errorMessage={identifierError ?? undefined}
            onSubmit={(identifier) => handleSendCode(identifier)}
            status={
              flow.status === "sendingOtp" || sendOtpMutation.isPending
                ? "sending"
                : "idle"
            }
          />
          <SocialLoginActions
            onError={setIdentifierError}
            returnTo={searchParams.get("returnTo")}
          />
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
      {renderStep()}
    </section>
  );
}
