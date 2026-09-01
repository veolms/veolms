import { useState } from "react";
import { TwoFactorForm } from "./TwoFactorForm";
import { startPasskeyAuthentication } from "./webauthn";
import {
  usePasskeyLoginOptions,
  usePasskeyLoginVerify,
  useVerifyMfaTotp,
} from "../services/auth";

export interface MfaStepUpProps {
  allowPasskey: boolean;
  allowAuthenticator: boolean;
  onDone: () => void;
}

export function MfaStepUp({
  allowAuthenticator,
  allowPasskey,
  onDone,
}: MfaStepUpProps) {
  const [method, setMethod] = useState<"passkey" | "authenticator">(
    allowPasskey ? "passkey" : "authenticator",
  );
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const verifyMfaMutation = useVerifyMfaTotp();
  const passkeyLoginOptionsMutation = usePasskeyLoginOptions();
  const passkeyLoginVerifyMutation = usePasskeyLoginVerify();

  const verifying =
    verifyMfaMutation.isPending ||
    passkeyLoginOptionsMutation.isPending ||
    passkeyLoginVerifyMutation.isPending;

  const handleVerifyTotp = async (nextCode: string) => {
    const trimmed = nextCode.trim();
    if (!trimmed || verifyMfaMutation.isPending) {
      return;
    }

    setErrorMessage(null);
    try {
      await verifyMfaMutation.mutateAsync({ code: trimmed });
      onDone();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setErrorMessage(
        errorObj?.message || "Something went wrong. Please try again.",
      );
    }
  };

  const handlePasskeyLogin = async () => {
    setErrorMessage(null);
    try {
      const serverOptions = await passkeyLoginOptionsMutation.mutateAsync();
      const credential = await startPasskeyAuthentication(serverOptions);
      await passkeyLoginVerifyMutation.mutateAsync(credential);
      onDone();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setErrorMessage(
        errorObj?.message ||
          "Passkey sign-in failed. Please try again or use your authenticator app.",
      );
    }
  };

  return (
    <TwoFactorForm
      allowAuthenticator={allowAuthenticator}
      allowPasskey={allowPasskey}
      code={code}
      errorMessage={verifying ? undefined : (errorMessage ?? undefined)}
      method={method}
      onCodeChange={(next) => {
        setErrorMessage(null);
        setCode(next);
      }}
      onMethodChange={(next) => {
        setErrorMessage(null);
        setMethod(next);
      }}
      onSubmit={handleVerifyTotp}
      onUsePasskey={handlePasskeyLogin}
      status={verifying ? "verifying" : "idle"}
    />
  );
}
