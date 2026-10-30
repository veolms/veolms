import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { LaptopIcon as Laptop } from "@phosphor-icons/react/Laptop";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/MapPin";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LoginResponse } from "@veolms/contracts";
import { useState } from "react";
import "../styles/features/workspace.css";
import type { ApiError } from "../lib/api-error";
import { authKeys } from "../services/auth/auth.keys";
import { authService } from "../services/auth/auth.service";
import {
  formatRelativeDate,
  formatSessionDevice,
  isMobileSession,
} from "../settings/sessionDisplay";
import { AuthCardDialog } from "./AuthCardDialog";
import { AUTH_CARD_HEADING_ID } from "./authFlow";
import { LoginHeading } from "./LoginCardParts";

const EXPIRED_MESSAGE =
  "This sign-in has expired. Close this and sign in again.";

function errorCode(error: unknown): string | undefined {
  return (error as Partial<ApiError> | null)?.code;
}

/**
 * Shown to a student signing in on one device more than the academy allows:
 * the devices they are signed in on, with roughly where each one signed in
 * from, so they can tell them apart. Signing one out signs them in here.
 */
export default function DeviceLimitDialog({
  onSignedIn,
  onClose,
}: {
  onSignedIn: (response: LoginResponse) => void;
  onClose: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const devices = useQuery({
    queryKey: [...authKeys.all, "device-limit"],
    queryFn: () => authService.getDeviceLimit(),
    gcTime: 0,
    retry: false,
  });
  const signOut = useMutation<LoginResponse, ApiError, string>({
    mutationFn: (sessionId) => authService.resolveDeviceLimit(sessionId),
    onSuccess: onSignedIn,
    onError: (error) => {
      if (errorCode(error) === "SESSION_NOT_FOUND") {
        setNotice("That device is already signed out. Choose another.");
        void devices.refetch();
        return;
      }
      setNotice(
        errorCode(error) === "DEVICE_SIGN_IN_EXPIRED"
          ? EXPIRED_MESSAGE
          : error.message || "That did not work. Please try again.",
      );
    },
  });

  const limit = devices.data?.limit;
  const expired = errorCode(devices.error) === "DEVICE_SIGN_IN_EXPIRED";

  return (
    <AuthCardDialog
      labelledBy={AUTH_CARD_HEADING_ID}
      data-device-limit-dialog
      onClose={onClose}
    >
      <section
        aria-labelledby={AUTH_CARD_HEADING_ID}
        className="auth-card flex w-full flex-col gap-5"
      >
        <LoginHeading
          title="Too many devices"
          subtitle={
            limit
              ? `You can be signed in on ${limit} ${limit === 1 ? "device" : "devices"} at once. Sign out of one to continue here.`
              : "Sign out of one of your devices to continue here."
          }
        />

        {devices.isPending && (
          <p className="m-0 text-[0.9rem] text-(--muted)">Loading devices…</p>
        )}

        {devices.isError && (
          <p className="m-0 text-[0.9rem] text-(--danger)" role="alert">
            {expired
              ? EXPIRED_MESSAGE
              : "Could not load your devices. Close this and try again."}
          </p>
        )}

        {devices.data && (
          <div className="settings-session-list">
            {devices.data.sessions.map((session) => {
              const signingOut =
                signOut.isPending && signOut.variables === session.id;
              return (
                <div className="settings-session" key={session.id}>
                  <span className="settings-session__icon" aria-hidden>
                    {isMobileSession(session.userAgent) ? (
                      <DeviceMobile size={20} weight="duotone" />
                    ) : (
                      <Laptop size={20} weight="duotone" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <strong title={session.userAgent ?? undefined}>
                      {formatSessionDevice(session.userAgent)}
                    </strong>
                    <small>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin aria-hidden className="shrink-0" size={11} />
                        <span className="truncate">
                          {session.location ??
                            session.ipAddress ??
                            "Unknown location"}
                        </span>
                      </span>
                      <span aria-hidden className="shrink-0">
                        ·
                      </span>
                      <span className="shrink-0">
                        {formatRelativeDate(session.lastUsedAt)}
                      </span>
                    </small>
                  </span>
                  <button
                    aria-busy={signingOut}
                    className="settings-action settings-action--quiet"
                    disabled={signOut.isPending}
                    onClick={() => {
                      setNotice(null);
                      signOut.mutate(session.id);
                    }}
                    type="button"
                  >
                    <SignOut size={14} />{" "}
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {notice && (
          <p className="m-0 text-[0.9rem] text-(--danger)" role="alert">
            {notice}
          </p>
        )}
      </section>
    </AuthCardDialog>
  );
}
