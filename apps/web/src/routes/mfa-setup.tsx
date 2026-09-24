import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AUTH_CARD_HEADING_ID } from "../auth/authFlow";
import { MfaEnrollmentSetup } from "../auth/MfaEnrollmentSetup";
import { MfaStepUp } from "../auth/MfaStepUp";
import { resolveMfaSetupView, type MfaSetupView } from "../auth/mfaGate";
import { APP_HOME_PATH, resolveMfaBackPath, sanitizeReturnTo } from "../routing/routeAccess";
import { useCurrentUser } from "../services/auth";
export default function MfaSetupRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: user, isLoading } = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const [initialView, setInitialView] = useState<MfaSetupView | null>(null);

  useEffect(() => {
    if (isLoading || initialView !== null) {
      return;
    }

    const resolved = resolveMfaSetupView(user);
    setInitialView(resolved);

    if (resolved === "done") {
      const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
      navigate(returnTo ?? APP_HOME_PATH, { replace: true });
    }
  }, [isLoading, initialView, navigate, searchParams, user]);

  const view = initialView ?? (isLoading ? null : resolveMfaSetupView(user));
  const backPath = resolveMfaBackPath(searchParams.get("returnTo"));

  if (isLoading || view === null || view === "login" || view === "done") {
    return (
      <section aria-label="Checking your account" className="auth-card">
        <p className="auth-mfa-setup__loading" style={{ margin: 0 }}>
          Checking your account…
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
      {error ? (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      ) : null}
      {view === "verify" ? (
        <MfaStepUp
          allowAuthenticator={Boolean(user?.totpEnabled)}
          allowPasskey={Boolean(user?.passkeyEnabled)}
          onBack={() => navigate(backPath, { replace: true })}
          onDone={() => navigate(APP_HOME_PATH, { replace: true })}
        />
      ) : (
        <MfaEnrollmentSetup
          onDone={() => navigate(APP_HOME_PATH, { replace: true })}
          onError={setError}
        />
      )}
    </section>
  );
}
