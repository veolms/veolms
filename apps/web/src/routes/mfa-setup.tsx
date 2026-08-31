import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AUTH_CARD_HEADING_ID } from "../auth/authFlow";
import { MfaEnrollmentSetup } from "../auth/MfaEnrollmentSetup";
import { MfaStepUp } from "../auth/MfaStepUp";
import { resolveMfaSetupView } from "../auth/mfaGate";
import { APP_HOME_PATH } from "../routing/routeAccess";
import { useCurrentUser } from "../services/auth";
export default function MfaSetupRoute() {
  const navigate = useNavigate();
  const { data: user, isLoading } = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const view = resolveMfaSetupView(user);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (view === "login") {
      return;
    }

    if (view === "done") {
      navigate(APP_HOME_PATH, { replace: true });
    }
  }, [isLoading, navigate, view]);

  if (isLoading || view === "login" || view === "done") {
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
