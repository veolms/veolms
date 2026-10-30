import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { GuestProfileIcon } from "../icons/GuestProfileIcon";
import { ShellProfileAvatar } from "./ShellProfileAvatar";
import { useEffect } from "react";
import { loginDialogBody } from "../routing/prerenderedBodies";
import type { AuthIdentityHint } from "../store/auth.store";

// The login pop-up's code (and the Google Sans its Google button uses)
// loads only when asked for; fetched on the tap, the first pop-up opened
// 600-700 ms late on a phone. It is fetched as soon as a finger or pointer
// reaches the button, or when the button is shown (`preloadWhenShown`).
const preloadLoginDialog = () => void loginDialogBody.preload();

export function LoginProfileButton({
  className,
  arrowSize,
  onLogin,
  remembered,
  preloadWhenShown = false,
}: {
  className: string;
  arrowSize: number;
  onLogin: () => void;
  /**
   * The profile remembered from the previous page load, shown while the
   * session is still being checked so the button already looks like the
   * signed-in one.
   */
  remembered?: AuthIdentityHint | null;
  /**
   * Fetch the login pop-up as soon as the button is shown: in the phone
   * sheet, opened by a visitor who is about to tap it.
   */
  preloadWhenShown?: boolean;
}) {
  useEffect(() => {
    if (preloadWhenShown) preloadLoginDialog();
  }, [preloadWhenShown]);
  const displayName = remembered?.displayName;
  const handle = remembered?.username
    ? remembered.username.startsWith("@")
      ? remembered.username
      : `@${remembered.username}`
    : null;
  return (
    <button
      type="button"
      className={`${className} courses-profile__login-button`}
      aria-label={
        displayName
          ? `Account for ${displayName}. Open account access`
          : "Login. Sign in for more"
      }
      data-auth-identity-button=""
      onClick={onLogin}
      onPointerDown={preloadLoginDialog}
      onPointerEnter={preloadLoginDialog}
    >
      {/* The box is as large as the profile picture's frame, so the name
          beside it does not move when the picture replaces the icon. The
          icon is drawn a little larger than its default, its circle about
          midway between that default and the picture's size. */}
      {remembered?.avatarUrl ? (
        <span className="courses-profile__avatar-wrap">
          <ShellProfileAvatar avatarUrl={remembered.avatarUrl} />
        </span>
      ) : (
        <LoginProfileIcon />
      )}
      <span className="courses-profile__login-copy">
        <strong
          className="courses-profile__login-title"
          data-auth-identity-title=""
        >
          {displayName || "Login"}
        </strong>
        <small
          className="courses-profile__login-subtitle"
          data-auth-identity-subtitle=""
        >
          {displayName ? (handle ?? "Account") : "Sign in for more"}
        </small>
      </span>
      {remembered ? (
        <CaretDown
          size={19}
          aria-hidden="true"
          className="courses-profile__caret"
        />
      ) : (
        <i
          aria-hidden="true"
          className="courses-profile__login-arrow ml-auto flex shrink-0 items-center justify-center text-(--accent)"
        >
          <CaretRight size={arrowSize} weight="bold" />
        </i>
      )}
    </button>
  );
}

/**
 * The signed-out profile mark in the button's picture frame; also stands
 * for a remembered account that has no picture.
 */
export function LoginProfileIcon() {
  return (
    <i
      aria-hidden="true"
      className="courses-profile__login-icon flex size-13.5 shrink-0 items-center justify-center text-(--accent) [.mobile-menu-sheet\_\_profile_&]:size-13 [&>svg]:size-[52px] [&>svg]:shrink-0"
    >
      <GuestProfileIcon size={45.36} />
    </i>
  );
}
