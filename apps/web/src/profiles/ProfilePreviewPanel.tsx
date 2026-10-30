import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { PublicProfileResponse } from "@veolms/contracts";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { PublicProfileCard } from "../components/PublicProfileCard";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";
import {
  Drawer,
  DrawerContent,
  type DrawerDismissThen,
} from "../components/ui/drawer";
import { useSidePanelVariant } from "../components/useSidePanelVariant";
import { usePublicProfile } from "../services/auth";
import { getPublicProfilePath, ProfileNavigationContext } from "./ProfileLink";
import { PublicProfileAvatar, PublicProfileLinks } from "./PublicProfilePage";
import { closeProfilePreview } from "./profilePreviewStore";
import "../styles/features/profile.css";

/**
 * A member's profile over the page: a pop-up beside the name or picture on
 * a desktop or tablet, a sheet from the bottom on a phone. Their picture, or "View profile",
 * opens the full profile page.
 */
export function ProfilePreviewPanel({
  username,
  anchor,
}: {
  username: string;
  anchor: HTMLElement | null;
}) {
  const variant = useSidePanelVariant();
  return variant === "phone" ? (
    <PhonePreview username={username} />
  ) : (
    <PopoverPreview username={username} anchor={anchor} />
  );
}

type OpenProfilePage = (event: MouseEvent<HTMLAnchorElement>) => void;

/** Opens the full profile page once `leave` has taken the preview away. */
function useOpenProfilePage(
  username: string,
  leave: (then: () => void) => void,
): OpenProfilePage {
  const navigateTo = useContext(ProfileNavigationContext);
  const path = getPublicProfilePath(username);
  return (event) => {
    if (
      !path ||
      !navigateTo ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    leave(() => navigateTo(path));
  };
}

/** Where the pop-up goes: beside the name or picture, on its right when
 * there is room, else on its left, else under it; kept on the screen. */
function placeBeside(anchor: DOMRect, popup: DOMRect) {
  const gap = 8;
  const edge = 8;
  let left = anchor.right + gap;
  let top = anchor.top;
  if (left + popup.width > window.innerWidth - edge) {
    left = anchor.left - gap - popup.width;
    if (left < edge) {
      left = anchor.left;
      top = anchor.bottom + gap;
    }
  }
  left = Math.min(Math.max(edge, left), window.innerWidth - popup.width - edge);
  top = Math.min(Math.max(edge, top), window.innerHeight - popup.height - edge);
  return { left, top };
}

function PopoverPreview({
  username,
  anchor,
}: {
  username: string;
  anchor: HTMLElement | null;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();

  // Placed before it is painted, and again as its contents load and as the
  // page scrolls under it.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popup) return undefined;
    let faded = false;
    const place = () => {
      const anchorRect = anchor?.isConnected
        ? anchor.getBoundingClientRect()
        : null;
      if (!anchorRect) {
        closeProfilePreview();
        return;
      }
      setPosition(placeBeside(anchorRect, popup.getBoundingClientRect()));
      // Faded in where it belongs, once; it never moves into place.
      if (!faded) {
        faded = true;
        popup.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 150,
          easing: "ease-out",
        });
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(popup);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  // A press anywhere else, or Esc, closes it. A press on the name or picture
  // it came from is left to that link, which closes it on its click.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popupRef.current?.contains(target) || anchor?.contains(target))
        return;
      closeProfilePreview();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeProfilePreview();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor]);

  const openPage = useOpenProfilePage(username, (then) => {
    closeProfilePreview();
    then();
  });

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Profile"
      style={
        position
          ? { left: position.left, top: position.top }
          : { left: 0, top: 0, visibility: "hidden" }
      }
      // The pop-up is the rounded box; the profile card fills it.
      className={`fixed z-1000 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--canvas) shadow-2xl`}
    >
      <ProfilePreviewBody username={username} onOpenPage={openPage} />
    </div>,
    document.body,
  );
}

function PhonePreview({ username }: { username: string }) {
  // Mounted closed and opened on the next frame, so the sheet slides up
  // rather than appearing at its full height.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const dismissThenRef = useRef<DrawerDismissThen | null>(null);
  const openedRef = useRef(false);
  const openPage = useOpenProfilePage(username, (then) => {
    const dismissThen = dismissThenRef.current;
    if (dismissThen) dismissThen(then);
    else {
      closeProfilePreview();
      then();
    }
  });
  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false);
      }}
      onOpenChangeComplete={(nextOpen) => {
        // Only after it was shown: the first, closed frame is not a close.
        if (!nextOpen && openedRef.current) closeProfilePreview();
        if (nextOpen) openedRef.current = true;
      }}
      showSwipeHandle
      // Over the top of the card, which fills the sheet.
      swipeHandleClassName="absolute inset-x-0 top-0 z-30 pt-2.5 after:w-18 after:bg-[color-mix(in_srgb,var(--text)_42%,transparent)]"
      dismissThenRef={dismissThenRef}
    >
      <DrawerContent
        aria-label="Profile"
        finalFocus={false}
        className="bg-(--surface) data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-2.5rem)]"
      >
        <div data-profile-sheet className="min-h-0 flex-1 overflow-y-auto">
          <ProfilePreviewBody username={username} onOpenPage={openPage} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ProfilePreviewBody({
  username,
  onOpenPage,
}: {
  username: string;
  onOpenPage: OpenProfilePage;
}) {
  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = usePublicProfile(username);
  const path = getPublicProfilePath(username) ?? undefined;

  if (isLoading) {
    return (
      <div
        className="flex animate-pulse flex-col items-center gap-3 py-10"
        role="status"
      >
        <span className="size-28 rounded-full bg-(--surface-strong)" />
        <span className="h-5 w-40 rounded-md bg-(--surface-strong)" />
        <span className="h-4 w-28 rounded-md bg-(--surface-strong)" />
        <span className="sr-only">Loading profile</span>
      </div>
    );
  }
  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="m-0 text-sm text-(--muted)">
          This profile is unavailable.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg border border-(--border) bg-(--surface-strong) px-3 py-2 text-sm font-medium text-(--text) transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <ProfilePreviewCard profile={profile} path={path} onOpenPage={onOpenPage} />
  );
}

/** How long the picture takes to grow over the card, and to shrink back. */
const PHOTO_ZOOM_MS = 380;
const PHOTO_ZOOM_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function ProfilePreviewCard({
  profile,
  path,
  onOpenPage,
}: {
  profile: PublicProfileResponse;
  path: string | undefined;
  onOpenPage: OpenProfilePage;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const photoButtonRef = useRef<HTMLButtonElement>(null);
  // Where the picture sits in the card when it is opened: the big view
  // grows from there and shrinks back to it.
  const [photoFrom, setPhotoFrom] = useState<DOMRect | null>(null);
  const canZoom = Boolean(profile.avatarDataUrl);

  const openPhoto = () => {
    const root = rootRef.current?.getBoundingClientRect();
    const photo = photoButtonRef.current
      ?.querySelector("img")
      ?.getBoundingClientRect();
    if (!root || !photo) return;
    setPhotoFrom(
      new DOMRect(
        photo.left - root.left,
        photo.top - root.top,
        photo.width,
        photo.height,
      ),
    );
  };

  return (
    <div
      ref={rootRef}
      // The card fills the pop-up or the sheet edge to edge, without a frame
      // of its own, at a preview's size rather than the profile page's, with
      // "View profile" as its bottom strip. In the phone sheet it is at least
      // as tall as it is wide, so the picture opened large shows whole.
      className="relative flex flex-col [[data-profile-sheet]_&]:min-h-[min(100vw,calc(100dvh-6rem))] [&_[class*=photo]]:size-24! [&_[class*=public-card]]:flex-1 [&_[class*=public-card]]:flex-col! [&_[class*=public-card]]:rounded-none! [&_[class*=public-card]]:border-0! [&_[class*=public-card]]:shadow-none! [&_[class*=public-content]]:min-h-0! [&_[class*=public-content]]:px-4! [&_[class*=public-content]]:pt-7! [&_[class*=public-content]]:pb-5!"
    >
      <PublicProfileCard
        displayName={profile.displayName}
        username={profile.username}
        nameLink={{ href: path, onClick: onOpenPage }}
        avatar={
          canZoom ? (
            // The picture opens it large, over the card.
            <button
              ref={photoButtonRef}
              type="button"
              onClick={openPhoto}
              aria-label="View profile picture"
              className="grid size-full! cursor-zoom-in overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              <PublicProfileAvatar profile={profile} />
            </button>
          ) : (
            <PublicProfileAvatar profile={profile} />
          )
        }
        bio={profile.bio}
        links={<PublicProfileLinks profile={profile} />}
        verifiedIcon={
          <SealCheck size={21} weight="fill" aria-label="Verified profile" />
        }
        footer={
          <a
            href={path}
            onClick={onOpenPage}
            // The card's whole bottom strip opens the full page; a shade apart
            // so it does not run into the card above it. In the phone sheet it
            // clears the bottom of the screen.
            className="relative flex min-h-12 w-full items-center justify-center gap-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] [[data-profile-sheet]_&]:pb-[env(safe-area-inset-bottom)] text-sm font-semibold text-(--accent) no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
          >
            View profile
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </a>
        }
      />
      {photoFrom && profile.avatarDataUrl && (
        <ProfilePhotoView
          profile={profile}
          from={photoFrom}
          onClosed={() => {
            setPhotoFrom(null);
            photoButtonRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/**
 * The profile picture over the whole card: it grows from the small round
 * picture into the card's full size, and shrinks back into it on close.
 */
function ProfilePhotoView({
  profile,
  from,
  onClosed,
}: {
  profile: PublicProfileResponse;
  from: DOMRect;
  onClosed: () => void;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);

  // The view's own box moves from the small picture's place and size to
  // the card's, so the photo inside is cropped the same way at every step
  // and its last frame on close is exactly the small picture.
  const frames = (view: HTMLElement) => {
    const card = view.parentElement;
    const width = card?.clientWidth ?? view.offsetWidth;
    const height = card?.clientHeight ?? view.offsetHeight;
    // Square at the bottom in the phone sheet, which is square there.
    const radius = view.closest("[data-profile-sheet]")
      ? "16px 16px 0px 0px"
      : "16px";
    return [
      {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        borderRadius: `${from.width / 2}px`,
      },
      {
        left: "0px",
        top: "0px",
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: radius,
      },
    ];
  };

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!prefersReducedMotion()) {
      view.animate(frames(view), {
        duration: PHOTO_ZOOM_MS,
        easing: PHOTO_ZOOM_EASING,
      });
    }
    closeRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  const close = () => {
    const view = viewRef.current;
    if (!view || closing) return;
    setClosing(true);
    if (prefersReducedMotion()) {
      onClosed();
      return;
    }
    const animation = view.animate([...frames(view)].reverse(), {
      duration: PHOTO_ZOOM_MS * 0.85,
      easing: PHOTO_ZOOM_EASING,
      fill: "forwards",
    });
    animation.onfinish = onClosed;
  };

  return (
    <div
      ref={viewRef}
      role="dialog"
      aria-label={`${profile.displayName}'s profile picture`}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Esc closes the picture, not the whole profile.
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        close();
      }}
      className="absolute inset-0 z-10 overflow-hidden rounded-2xl bg-black [[data-profile-sheet]_&]:rounded-b-none"
    >
      <ResponsiveAvatar
        src={profile.avatarDataUrl!}
        srcSet={profile.avatarSrcSet}
        sizes="420px"
        alt=""
        width={420}
        height={420}
        loading="eager"
        className="size-full object-cover"
      />
      <button
        ref={closeRef}
        type="button"
        onClick={close}
        aria-label="Close picture"
        className={`absolute top-2.5 right-2.5 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white ${
          closing ? "opacity-0" : "opacity-100"
        }`}
      >
        <X size={18} weight="bold" />
      </button>
    </div>
  );
}

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
