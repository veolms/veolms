import type {
  PasskeyAuthenticatorTransport,
  PasskeyAuthenticationOptionsResponse,
  PasskeyRegistrationOptionsResponse,
} from "@veolms/contracts";

const toBrowserTransport = (
  transport: PasskeyAuthenticatorTransport,
): AuthenticatorTransport | null => {
  switch (transport) {
    case "ble":
    case "hybrid":
    case "internal":
    case "nfc":
    case "usb":
      return transport;
    case "smart-card":
      // WebAuthn Level 3 supports this hint, but some lib.dom versions lag it.
      return transport as AuthenticatorTransport;
    default:
      return null;
  }
};

export const toBrowserTransports = (
  transports: PasskeyAuthenticatorTransport[] | undefined,
) => transports?.flatMap((transport) => toBrowserTransport(transport) ?? []);

export function bufferToBase64URL(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function base64URLToBuffer(base64url: string): Uint8Array<ArrayBuffer> {
  const padded =
    base64url.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (base64url.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

export function formatWebAuthnError(
  err: unknown,
  action: "registration" | "authentication",
): string {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError") {
      return action === "registration"
        ? "Passkey registration was cancelled."
        : "Passkey sign-in was cancelled.";
    }
    if (err.name === "InvalidStateError") {
      return "This passkey is already registered on your authenticator.";
    }
    if (err.name === "NotSupportedError") {
      return "Passkeys are not supported on this device or browser.";
    }
    if (err.name === "AbortError") {
      return action === "registration"
        ? "Passkey registration was cancelled."
        : "Passkey sign-in was cancelled.";
    }
    if (err.name === "SecurityError") {
      return "Passkey security error: Ensure you are using HTTPS and a valid domain.";
    }
    if (err.message) {
      return err.message;
    }
  }
  return action === "registration"
    ? "Passkey registration failed. Please try again."
    : "Passkey sign-in failed. Please try again.";
}

export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

export async function startPasskeyRegistration(
  options: PasskeyRegistrationOptionsResponse,
): Promise<{ response: unknown }> {
  if (!isPasskeySupported()) {
    throw new Error(
      "Your browser does not support passkeys. Please use a modern browser such as Chrome, Safari, or Edge.",
    );
  }

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: base64URLToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64URLToBuffer(options.user.id),
    },
    excludeCredentials: (options.excludeCredentials ?? []).map((cred) => ({
      ...cred,
      id: base64URLToBuffer(cred.id),
      transports: toBrowserTransports(cred.transports),
    })),
  };

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: publicKeyOptions,
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw new Error(formatWebAuthnError(err, "registration"));
  }

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
  options: PasskeyAuthenticationOptionsResponse,
): Promise<{ response: unknown }> {
  if (!isPasskeySupported()) {
    throw new Error(
      "Your browser does not support passkeys. Please use a modern browser such as Chrome, Safari, or Edge.",
    );
  }

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64URLToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((cred) => ({
      ...cred,
      id: base64URLToBuffer(cred.id),
      transports: toBrowserTransports(cred.transports),
    })),
  };

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({
      publicKey: publicKeyOptions,
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw new Error(formatWebAuthnError(err, "authentication"));
  }

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
