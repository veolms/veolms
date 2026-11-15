import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { SignInIcon as SignIn } from "@phosphor-icons/react/SignIn";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { ShellProfileAvatar } from "./ShellProfileAvatar";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useLocation } from "react-router";
import type { AvatarImageVariant } from "@veolms/contracts";
import { isValidPublicProfileUsername } from "@veolms/contracts/username-rules";
import type { CourseRole } from "../courses/catalogue";
import { getRoleDisplayName, hasAdminRole } from "./workspaceRole";
import { useWebContributions } from "../lib/web-contributions";
import { ProfileHelpScreen } from "./ProfileHelpScreen";

export interface ProfileIdentityData {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarSrcSet?: readonly AvatarImageVariant[] | null;
}

interface ProfileMenuIdentityProps extends ProfileIdentityData {
  variant?: "menu" | "mobile";
  unreadNotificationCount?: number;
  onNavigate: (path: string) => void;
  onClose?: () => void;
}

export function ProfileMenuIdentity({
  displayName,
  username,
  avatarUrl,
  avatarSrcSet,
  variant = "menu",
  unreadNotificationCount = 0,
  onNavigate,
  onClose,
}: ProfileMenuIdentityProps) {
  // A username that cannot be a profile address (an old account's, shorter
  // than a profile address allows) has no profile page to open. The link
  // goes to the profile settings instead, where a line under the username
  // field says why and lets them choose another.
  const profilePath = isValidPublicProfileUsername(username)
    ? `/${encodeURIComponent(username)}`
    : "/settings/profile";
  const handleProfileClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      onClose?.();
      return;
    }
    event.preventDefault();
    onNavigate(profilePath);
  };
  const mobile = variant === "mobile";

  return (
    <div
      className="courses-profile__button profile-menu__identity bg-[color-mix(in_srgb,var(--surface-strong)_94%,white_6%)]!"
      role="group"
      aria-label="Your profile"
    >
      <a
        className="profile-menu__identity-link absolute inset-0 z-0 flex min-w-0 items-center gap-1 rounded-[inherit] pl-0.5 pr-2 py-1 text-inherit no-underline outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--surface-strong)_90%,white_10%)]! focus-visible:ring-2 focus-visible:ring-(--accent)"
        href={profilePath}
        aria-label={`Open ${displayName}'s public profile`}
        role={mobile ? undefined : "menuitem"}
        onClick={handleProfileClick}
      >
        <span className="courses-profile__avatar-wrap">
          <ShellProfileAvatar
            avatarUrl={avatarUrl}
            avatarSrcSet={avatarSrcSet}
          />
          {unreadNotificationCount > 0 ? (
            <i
              className="courses-profile__presence"
              aria-label={`${unreadNotificationCount} unread notifications`}
            />
          ) : null}
        </span>
        <span className="profile-menu__identity-copy grid min-w-0 gap-0.5 text-left">
          <strong className="truncate text-[0.84rem] font-semibold text-(--text)">
            {displayName}
          </strong>
          <small className="truncate text-[0.72rem] text-(--muted)">
            @{username}
          </small>
        </span>
      </a>
      <button
        type="button"
        className="profile-menu__identity-edit group absolute right-1.5 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_84%,black_16%)]! p-0 text-(--muted) outline-none transition-colors hover:text-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        aria-label="Edit profile"
        title="Edit profile"
        role={mobile ? undefined : "menuitem"}
        onClick={() => onNavigate("/settings/profile")}
      >
        <PencilSimple
          className="group-hover:hidden group-focus-visible:hidden"
          size={18}
          weight="regular"
          aria-hidden="true"
        />
        <PencilSimple
          className="hidden group-hover:block group-focus-visible:block"
          size={18}
          weight="fill"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

export { ShellProfileAvatar };

interface ProfileMenuProps {
  role: CourseRole;
  allowedRoles: readonly CourseRole[];
  userRoles?: readonly string[] | null;
  unreadNotificationCount?: number;
  sidebarHidden?: boolean;
  includeSidebarControl?: boolean;
  beforeAccountContent?: ReactNode;
  identity?: ProfileIdentityData;
  isOpen?: boolean;
  id?: string;
  className?: string;
  onClose: () => void;
  onRoleChange: (role: CourseRole) => void;
  onNavigate: (path: string) => void;
  onToggleSidebar?: () => void;
  /** Signed in only; a guest's menu has no Logout. */
  onLogout?: () => void;
  /**
   * A signed-out visitor's menu: no account rows or Logout, only what a
   * guest can use (Help and feedback, the sidebar control).
   */
  guest?: boolean;
  /** A guest's "Log in or sign up" row, at the top (the sidebar's menu; the
   * phone sheet has its own Login button). */
  onLogin?: () => void;
}

/** How long the closing slide takes (`profile-menu-slide-shut`). */
const PROFILE_MENU_SHUT_MS = 260;

/** How long a screen of the menu takes to slide in (Help and feedback). */
const PROFILE_MENU_SCREEN_MS = 300;
const PROFILE_MENU_SCREEN_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Where a screen of the menu stands: the one shown is in the flow and gives
 * the menu its height; the other lies over it, off to one side, and slides
 * across as they swap (the help screen comes in from the right and the
 * first screen goes out to the left, then back again).
 *
 * The transition is on only while they slide: left on, closing the menu
 * hid its background at once while the screens, taking the menu's hidden
 * state as a change of their own, kept their text and icons for the
 * length of the slide.
 */
const screenClasses = (shown: boolean, offside: string, sliding: boolean) =>
  `${sliding ? "transition-[translate,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none" : ""} ${
    shown ? "relative" : `invisible absolute inset-x-0 top-0 ${offside}`
  }`;

/** The settings menu's mark for the page that is open (courses.css). */
const currentPageItemClasses =
  "aria-[current=page]:text-(--text) aria-[current=page]:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface-strong))]! aria-[current=page]:hover:bg-[color-mix(in_srgb,var(--accent)_30%,var(--surface-strong))]!";

export function ProfileMenu({
  role,
  allowedRoles,
  userRoles,
  unreadNotificationCount = 0,
  sidebarHidden = false,
  includeSidebarControl = true,
  beforeAccountContent,
  identity,
  isOpen = true,
  id,
  className,
  onClose,
  onRoleChange,
  onNavigate,
  onToggleSidebar,
  onLogout,
  guest = false,
  onLogin,
}: ProfileMenuProps) {
  // The closing slide is played by a menu marked as having been open. The
  // mark comes off once that slide is over: left on, the slide played again
  // every time the sidebar was expanded, since the collapsed sidebar turns
  // the animation off and expanding it turns it back on.
  const [hasOpened, setHasOpened] = useState(false);
  if (isOpen && !hasOpened) setHasOpened(true);
  // The page the learner is on is marked in the menu, as the settings menu
  // marks its tab.
  const { pathname } = useLocation();
  const isCurrentPage = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);
  // The menu's second screen (Help and feedback). The menu's height follows
  // the screen shown, and while they slide the screens are clipped to it.
  const [screen, setScreen] = useState<"main" | "help">("main");
  const [sliding, setSliding] = useState(false);
  const screensRef = useRef<HTMLDivElement>(null);
  const helpRowRef = useRef<HTMLButtonElement>(null);
  const helpBackRef = useRef<HTMLButtonElement>(null);
  const showScreen = (next: "main" | "help") => {
    const screens = screensRef.current;
    const fromHeight = screens?.offsetHeight ?? 0;
    flushSync(() => {
      setSliding(true);
      setScreen(next);
    });
    const toHeight = screens?.offsetHeight ?? 0;
    if (
      screens &&
      fromHeight !== toHeight &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      screens.animate(
        [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
        {
          duration: PROFILE_MENU_SCREEN_MS,
          easing: PROFILE_MENU_SCREEN_EASING,
        },
      );
    }
    (next === "help" ? helpBackRef : helpRowRef).current?.focus({
      preventScroll: true,
    });
  };
  useEffect(() => {
    if (!sliding) return undefined;
    const timer = window.setTimeout(
      () => setSliding(false),
      PROFILE_MENU_SCREEN_MS + 40,
    );
    return () => window.clearTimeout(timer);
  }, [sliding, screen]);

  useEffect(() => {
    if (isOpen || !hasOpened) return undefined;
    const timer = window.setTimeout(() => {
      setHasOpened(false);
      setScreen("main");
    }, PROFILE_MENU_SHUT_MS + 60);
    return () => window.clearTimeout(timer);
  }, [hasOpened, isOpen]);
  const selectRole = (nextRole: CourseRole) => {
    onRoleChange(nextRole);
    onClose();
  };
  const openDestination = (
    event: MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      onClose();
      return;
    }
    event.preventDefault();
    onNavigate(path);
  };

  // Links plugins add to the account section (see web-core contributions).
  const isAdmin = hasAdminRole(userRoles);
  const contributedLinks = useWebContributions().profileMenuLinks.filter(
    (link) =>
      (!link.roles || link.roles.includes(role)) &&
      (!link.adminOnly || isAdmin),
  );

  const canPreviewAsStudent = allowedRoles.includes("student");
  const canPreviewAsCreator = allowedRoles.includes("creator");
  const canSwitchWorkspace = canPreviewAsStudent && canPreviewAsCreator;
  const authoringRoleLabel = getRoleDisplayName("creator", userRoles);
  const AuthoringRoleIcon =
    authoringRoleLabel === "Admin" ? ShieldCheck : Users;
  const menuClassName = [
    "profile-menu",
    canSwitchWorkspace ? "profile-menu--switchable" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      id={id}
      className={menuClassName}
      role="menu"
      aria-label="Profile menu"
      aria-hidden={!isOpen ? true : undefined}
      inert={!isOpen ? true : undefined}
      data-open={isOpen ? "true" : "false"}
      // A menu that has been open may play its closing; one that has never
      // been opened must not (see `.profile-menu--animated` in courses.css).
      data-has-opened={hasOpened ? "" : undefined}
    >
      <div
        ref={screensRef}
        className={`relative ${sliding ? "overflow-hidden" : ""}`}
      >
        <div
          className={screenClasses(
            screen === "main",
            "-translate-x-full",
            sliding,
          )}
          aria-hidden={screen !== "main" ? true : undefined}
          inert={screen !== "main" ? true : undefined}
        >
          {identity ? (
            <ProfileMenuIdentity
              {...identity}
              unreadNotificationCount={unreadNotificationCount}
              onNavigate={onNavigate}
              onClose={onClose}
            />
          ) : null}
          {canSwitchWorkspace ? (
            <>
              <div className="profile-menu__group profile-menu__group--roles">
                <p className="profile-menu__section">View as</p>
                <button
                  type="button"
                  className="profile-menu__item profile-menu__item--role"
                  role="menuitemradio"
                  aria-checked={role === "student"}
                  onClick={() => selectRole("student")}
                >
                  <Student
                    className="profile-menu__role-icon profile-menu__role-icon--student"
                    size={23}
                    weight="duotone"
                  />
                  <span>Student</span>
                  {role === "student" ? (
                    <Check
                      className="profile-menu__check"
                      size={18}
                      weight="bold"
                    />
                  ) : (
                    <span className="profile-menu__trail" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="profile-menu__item profile-menu__item--role"
                  role="menuitemradio"
                  aria-checked={role === "creator"}
                  onClick={() => selectRole("creator")}
                >
                  <AuthoringRoleIcon
                    className={`profile-menu__role-icon ${authoringRoleLabel === "Admin" ? "profile-menu__role-icon--admin" : "profile-menu__role-icon--creator"}`}
                    size={23}
                    weight="duotone"
                  />
                  <span>{authoringRoleLabel}</span>
                  {role === "creator" ? (
                    <Check
                      className="profile-menu__check"
                      size={18}
                      weight="bold"
                    />
                  ) : (
                    <span className="profile-menu__trail" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div
                className="profile-menu__divider"
                role="separator"
                aria-orientation="horizontal"
              />
            </>
          ) : null}

          {beforeAccountContent}

          {guest ? (
            onLogin ? (
              <>
                <div className="profile-menu__group profile-menu__group--account">
                  <button
                    type="button"
                    className="profile-menu__item"
                    role="menuitem"
                    onClick={() => {
                      onClose();
                      onLogin();
                    }}
                  >
                    <SignIn
                      className="profile-menu__item-icon text-(--accent)"
                      size={21}
                    />
                    <span>Log in or sign up</span>
                  </button>
                </div>
                <div
                  className="profile-menu__divider"
                  role="separator"
                  aria-orientation="horizontal"
                />
              </>
            ) : null
          ) : (
            <>
              <div className="profile-menu__group profile-menu__group--account">
                <a
                  className={`profile-menu__item ${currentPageItemClasses}${isCurrentPage("/progress") ? " is-active" : ""}`}
                  role="menuitem"
                  href="/progress"
                  aria-current={isCurrentPage("/progress") ? "page" : undefined}
                  onClick={(event) => openDestination(event, "/progress")}
                >
                  <ChartLineUp
                    className="profile-menu__item-icon text-[#fb923c]"
                    size={21}
                    weight={isCurrentPage("/progress") ? "fill" : "regular"}
                  />
                  <span>Progress</span>
                </a>
                {contributedLinks.map(
                  ({ id: linkId, label, href, icon: LinkIcon }) => (
                    <a
                      key={linkId}
                      className="profile-menu__item"
                      role="menuitem"
                      href={href}
                      onClick={(event) => openDestination(event, href)}
                    >
                      {LinkIcon ? (
                        <LinkIcon
                          className="profile-menu__item-icon"
                          size={21}
                        />
                      ) : null}
                      <span>{label}</span>
                    </a>
                  ),
                )}
                {role === "student" ? (
                  <a
                    className={`profile-menu__item profile-menu__item--orders ${currentPageItemClasses}${isCurrentPage("/purchase-history") ? " is-active" : ""}`}
                    role="menuitem"
                    href="/purchase-history"
                    aria-current={
                      isCurrentPage("/purchase-history") ? "page" : undefined
                    }
                    onClick={(event) =>
                      openDestination(event, "/purchase-history")
                    }
                  >
                    <Receipt
                      className="profile-menu__item-icon profile-menu__item-icon--orders"
                      size={21}
                      weight={
                        isCurrentPage("/purchase-history") ? "fill" : "regular"
                      }
                    />
                    <span>Purchase History</span>
                  </a>
                ) : null}
              </div>
              <div
                className="profile-menu__divider"
                role="separator"
                aria-orientation="horizontal"
              />
            </>
          )}

          {includeSidebarControl && onToggleSidebar ? (
            <div className="profile-menu__group profile-menu__group--session">
              <button
                type="button"
                className="profile-menu__item profile-menu__item--sidebar"
                role="menuitem"
                onClick={() => {
                  onToggleSidebar();
                  onClose();
                }}
              >
                <EyeSlash
                  className="profile-menu__item-icon profile-menu__item-icon--sidebar"
                  size={21}
                />
                <span>
                  {sidebarHidden ? "Keep sidebar visible" : "Hide sidebar"}
                </span>
              </button>
            </div>
          ) : null}

          <div className="profile-menu__group profile-menu__group--help">
            <button
              ref={helpRowRef}
              type="button"
              className="profile-menu__item"
              role="menuitem"
              aria-haspopup="menu"
              onClick={() => showScreen("help")}
            >
              <Question
                className="profile-menu__item-icon text-[#4ade80]"
                size={21}
              />
              <span className="truncate">Help and feedback</span>
              <CaretRight
                className="profile-menu__trail text-(--muted)"
                size={16}
              />
            </button>
          </div>

          {guest ? null : (
            <div className="profile-menu__group profile-menu__group--logout">
              <button
                type="button"
                className="profile-menu__item profile-menu__item--logout"
                role="menuitem"
                onClick={() => {
                  onClose();
                  onLogout?.();
                }}
              >
                <SignOut
                  className="profile-menu__item-icon profile-menu__item-icon--logout"
                  size={21}
                />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
        <div
          className={screenClasses(
            screen === "help",
            "translate-x-full",
            sliding,
          )}
          aria-hidden={screen !== "help" ? true : undefined}
          inert={screen !== "help" ? true : undefined}
        >
          <ProfileHelpScreen
            backRef={helpBackRef}
            onBack={() => showScreen("main")}
            onNavigate={openDestination}
          />
        </div>
      </div>
    </div>
  );
}
