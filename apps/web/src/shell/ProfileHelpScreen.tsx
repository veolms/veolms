import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ChatCircleTextIcon as ChatCircleText } from "@phosphor-icons/react/ChatCircleText";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import type { ComponentType, MouseEvent, Ref } from "react";

interface HelpLink {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  iconClassName: string;
}

/**
 * The support form, told which page the learner was on so the report can
 * say where it happened.
 */
function withOrigin(path: string): string {
  if (typeof window === "undefined" || !path.startsWith("/support/new")) {
    return path;
  }
  const from = `${window.location.pathname}${window.location.search}`;
  if (from.startsWith("/support")) return path;
  const label = document.title.replace(/\s*[·|-]\s*ProCodrr\s*$/u, "").trim();
  const params = new URLSearchParams({ from });
  if (label) params.set("fromLabel", label);
  return `${path}&${params.toString()}`;
}

// Three groups: help from the team, the policies, then the company (as the
// legal pages group them). Each row has a colour of its own.
const HELP_GROUPS: readonly (readonly HelpLink[])[] = [
  [
    {
      title: "Report a problem",
      href: "/support/new?type=problem",
      icon: Flag,
      iconClassName: "text-[#f1be4b]",
    },
    {
      title: "Send feedback",
      href: "/support/new?type=feedback",
      icon: ChatCircleText,
      iconClassName: "text-[#4ade80]",
    },
  ],
  [
    {
      title: "Terms of Service",
      href: "/terms",
      icon: FileText,
      iconClassName: "text-(--muted)",
    },
    {
      title: "Privacy Policy",
      href: "/privacy",
      icon: ShieldCheck,
      iconClassName: "text-(--muted)",
    },
    {
      title: "Refund Policy",
      href: "/policies",
      icon: ArrowCounterClockwise,
      iconClassName: "text-(--muted)",
    },
    {
      title: "Community Guidelines",
      href: "/community-guidelines",
      icon: UsersThree,
      iconClassName: "text-(--muted)",
    },
  ],
  [
    {
      title: "About ProCodrr",
      href: "/about",
      icon: Info,
      iconClassName: "text-[#63c8d5]",
    },
    {
      title: "Contact us",
      href: "/contact",
      icon: EnvelopeSimple,
      iconClassName: "text-[#5da9ff]",
    },
  ],
];

/**
 * The profile menu's second screen: help and support, the legal pages and
 * About, reached from "Help and feedback" and left with the back arrow.
 */
export function ProfileHelpScreen({
  backRef,
  onBack,
  onNavigate,
}: {
  backRef: Ref<HTMLButtonElement>;
  onBack: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
        <button
          ref={backRef}
          type="button"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
          aria-label="Back"
          onClick={onBack}
        >
          <ArrowLeft size={19} weight="bold" />
        </button>
        <p className="m-0 min-w-0 flex-1 truncate text-[0.92rem] font-semibold text-(--text)">
          Help and feedback
        </p>
      </div>
      {HELP_GROUPS.map((group, index) => (
        <div key={group[0]!.href}>
          {index > 0 ? (
            <div
              className="profile-menu__divider"
              role="separator"
              aria-orientation="horizontal"
            />
          ) : null}
          <div className="profile-menu__group" role="group">
            {group.map(({ title, href, icon: Icon, iconClassName }) => (
              <a
                key={href}
                className="profile-menu__item"
                role="menuitem"
                href={href}
                onClick={
                  href.startsWith("/")
                    ? (event) => onNavigate(event, withOrigin(href))
                    : undefined
                }
              >
                <Icon
                  className={`profile-menu__item-icon ${iconClassName}`}
                  size={21}
                />
                <span className="truncate">{title}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
