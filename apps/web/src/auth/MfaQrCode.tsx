import { lazy, Suspense } from "react";

const LocalQrCode = lazy(() =>
  import("qrcode.react").then(({ QRCodeSVG }) => ({ default: QRCodeSVG })),
);

export function MfaQrCode({ value, size }: { value: string; size: number }) {
  return (
    <Suspense
      fallback={
        <span
          aria-hidden="true"
          className="auth-mfa-setup__qr"
          style={{ width: size, height: size }}
        />
      }
    >
      <LocalQrCode
        className="auth-mfa-setup__qr"
        value={value}
        size={size}
        level="M"
      />
    </Suspense>
  );
}
