import { useState } from "react";
import { useNavigate } from "react-router";
import { MfaEnrollmentSetup } from "../auth/MfaEnrollmentSetup";

export default function MfaSetupRoute() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      )}
      <MfaEnrollmentSetup
        onDone={() => navigate("/", { replace: true })}
        onError={setError}
      />
    </>
  );
}
