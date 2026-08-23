export function bufferToBase64URL(buffer: ArrayBuffer | Uint8Array): string {
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function base64URLToBuffer(base64url: string): Uint8Array {
  const padded =
    base64url.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (base64url.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

export async function startPasskeyRegistration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverOptions: any,
): Promise<{ response: unknown }> {
  if (!isPasskeySupported()) {
    throw new Error(
      "Your browser does not support passkeys. Please use a modern browser such as Chrome, Safari, or Edge.",
    );
  }

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    ...serverOptions,
    challenge: base64URLToBuffer(serverOptions.challenge),
    user: {
      ...serverOptions.user,
      id: base64URLToBuffer(serverOptions.user.id),
    },
    excludeCredentials: (serverOptions.excludeCredentials ?? []).map(
      (cred: { id: string; type: string }) => ({
        ...cred,
        id: base64URLToBuffer(cred.id),
      }),
    ),
  };

  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey registration was cancelled.");
  }

  const attestation = credential.response as AuthenticatorAttestationResponse;

  return {
    response: {
      id: credential.id,
      rawId: bufferToBase64URL(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64URL(attestation.clientDataJSON),
        attestationObject: bufferToBase64URL(attestation.attestationObject),
        transports: attestation.getTransports?.() ?? [],
      },
    },
  };
}

export async function startPasskeyAuthentication(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverOptions: any,
): Promise<{ response: unknown }> {
  if (!isPasskeySupported()) {
    throw new Error(
      "Your browser does not support passkeys. Please use a modern browser such as Chrome, Safari, or Edge.",
    );
  }

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    ...serverOptions,
    challenge: base64URLToBuffer(serverOptions.challenge),
    allowCredentials: (serverOptions.allowCredentials ?? []).map(
      (cred: { id: string; type: string; transports?: string[] }) => ({
        ...cred,
        id: base64URLToBuffer(cred.id),
      }),
    ),
  };

  const credential = (await navigator.credentials.get({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey sign-in was cancelled.");
  }

  const assertion = credential.response as AuthenticatorAssertionResponse;

  return {
    response: {
      id: credential.id,
      rawId: bufferToBase64URL(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64URL(assertion.clientDataJSON),
        authenticatorData: bufferToBase64URL(assertion.authenticatorData),
        signature: bufferToBase64URL(assertion.signature),
        userHandle: assertion.userHandle
          ? bufferToBase64URL(assertion.userHandle)
          : null,
      },
    },
  };
}
