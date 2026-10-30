import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { LoginProfileButton } from "./LoginProfileButton";
import { ProfileButtonPlaceholder } from "./ProfileButtonPlaceholder";
import {
  FALLBACK_AVATAR_CLASS,
  IMAGE_AVATAR_CLASS,
} from "./ShellProfileAvatar";

/**
 * The profile button until the session check has answered, in the
 * prerendered page and after it. All three forms are there and a style
 * keyed on what the document's head found picks one before the first paint
 * (see `profileHintEarlyState.ts`):
 *
 * - nobody signed in: "Login", the real button;
 * - signed in, the account remembered in this tab: the signed-in button as
 *   `SidebarProfileButton` draws it, with the name, picture, second line,
 *   role icon and unread dot it showed last, so nothing moves when the real
 *   one takes its place;
 * - signed in, nothing remembered: the placeholder.
 *
 * They are siblings, not wrapped: the sidebar's styles address the button
 * as a direct child of `.courses-profile`. Each hides itself with an
 * important `display: none`; the shown one keeps the button's own display.
 * Inside the remembered one the parts are found by data attributes: a class
 * name with "__" cannot go in a Tailwind selector, whose underscores stand
 * for spaces.
 */
export function EarlyProfileButtons({
  className,
  arrowSize,
  onLogin,
}: {
  className: string;
  arrowSize: number;
  onLogin: () => void;
}) {
  const roleIcon = (role: "student" | "admin" | "creator") =>
    `courses-profile__role-icon courses-profile__role-icon--${role}`;
  return (
    <>
      <LoginProfileButton
        className={`${className} [:root[data-session-hint]_&]:hidden!`}
        arrowSize={arrowSize}
        onLogin={onLogin}
      />
      <div
        aria-hidden="true"
        data-early-profile=""
        className={`${className} pointer-events-none [:root:not([data-profile-hint])_&]:hidden! [:root[data-profile-hint-avatar]_&_[data-early-fallback]]:hidden! [:root:not([data-profile-hint-avatar])_&_[data-early-avatar]]:hidden! [:root:not([data-profile-hint-unread])_&_[data-early-dot]]:hidden! [:root:not([data-profile-hint-icon=student])_&_[data-early-icon=student]]:hidden! [:root:not([data-profile-hint-icon=admin])_&_[data-early-icon=admin]]:hidden! [:root:not([data-profile-hint-icon=creator])_&_[data-early-icon=creator]]:hidden!`}
      >
        <span className="courses-profile__avatar-wrap">
          <i className={IMAGE_AVATAR_CLASS} data-early-avatar="">
            <span className="block size-full bg-(image:--profile-hint-avatar) bg-cover bg-center" />
          </i>
          <i className={FALLBACK_AVATAR_CLASS} data-early-fallback="">
            <UserCircle size={28} weight="duotone" />
          </i>
          <i className="courses-profile__presence" data-early-dot="" />
        </span>
        <span>
          <strong className="block truncate after:content-(--profile-hint-name)" />
          {/* The text comes first and the role icon after it, as in the
              real button: drawn before the icons. */}
          <small className="before:content-(--profile-hint-subtitle) [:root[data-profile-hint-role]_&]:mt-0.5!">
            <Student
              className={roleIcon("student")}
              data-early-icon="student"
              size={15}
              weight="duotone"
              aria-hidden="true"
            />
            <ShieldCheck
              className={roleIcon("admin")}
              data-early-icon="admin"
              size={15}
              weight="duotone"
              aria-hidden="true"
            />
            <Users
              className={roleIcon("creator")}
              data-early-icon="creator"
              size={15}
              weight="duotone"
              aria-hidden="true"
            />
          </small>
        </span>
        <CaretDown
          size={19}
          aria-hidden="true"
          className="courses-profile__caret"
        />
      </div>
      <ProfileButtonPlaceholder
        className={`${className} [:root:not([data-session-hint])_&]:hidden! [:root[data-profile-hint]_&]:hidden!`}
      />
    </>
  );
}
