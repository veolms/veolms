import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { ChatCircleIcon as ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import type { ComponentType, ReactNode, RefObject } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import { LEGAL_SUPPORT_EMAIL } from "../legal/legalPages";

const ITEM_CLASS =
  "flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-(--text-secondary) no-underline outline-none select-none data-highlighted:bg-(--hover) data-highlighted:text-(--text) [&>svg]:size-4.5 [&>svg]:shrink-0";

const GROUP_LABEL_CLASS =
  "px-3 pt-2 pb-1.5 text-[11px] font-bold tracking-[0.11em] text-(--muted) uppercase";

function MenuLink({
  href,
  icon: Icon,
  iconClassName,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  children: ReactNode;
}) {
  const external = !href.startsWith("mailto:");
  return (
    <MenuPrimitive.LinkItem
      className={`group/logo-item ${ITEM_CLASS}`}
      href={href}
      closeOnClick
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
    >
      <Icon className={iconClassName} />
      <span className="flex-1">{children}</span>
      {external ? (
        <ArrowUpRight
          aria-hidden="true"
          className="size-3.5! text-(--muted) opacity-60 transition-opacity group-data-highlighted/logo-item:opacity-100"
        />
      ) : null}
    </MenuPrimitive.LinkItem>
  );
}

const mailto = (subject: string) =>
  `mailto:${LEGAL_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

/**
 * The menu the sidebar's logo opens: help and support, the legal pages and
 * About. The pages open in a new tab, so the lesson or page behind is kept.
 */
export function LogoMenu({
  open,
  onOpenChange,
  anchor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<Element | null>;
}) {
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
    >
      <DropdownMenuContent
        anchor={anchor}
        align="start"
        side="bottom"
        sideOffset={8}
        aria-label="ProCodrr"
        className="w-75 max-w-[calc(100vw-1rem)] rounded-2xl p-2"
      >
        <DropdownMenuGroup>
          <MenuPrimitive.GroupLabel className={GROUP_LABEL_CLASS}>
            Help &amp; support
          </MenuPrimitive.GroupLabel>
          <MenuLink
            href="/contact"
            icon={EnvelopeSimple}
            iconClassName="text-(--accent)"
          >
            Contact Us
          </MenuLink>
          <MenuLink
            href={mailto("Report a problem")}
            icon={Flag}
            iconClassName="text-(--accent)"
          >
            Report a Problem
          </MenuLink>
          <MenuLink
            href={mailto("Feedback")}
            icon={ChatCircle}
            iconClassName="text-(--accent)"
          >
            Send Feedback
          </MenuLink>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="mx-1.5 my-1.5" />
        <DropdownMenuGroup>
          <MenuPrimitive.GroupLabel className={GROUP_LABEL_CLASS}>
            Legal
          </MenuPrimitive.GroupLabel>
          <MenuLink
            href="/terms"
            icon={FileText}
            iconClassName="text-(--muted)"
          >
            Terms of Service
          </MenuLink>
          <MenuLink
            href="/privacy"
            icon={ShieldCheck}
            iconClassName="text-(--muted)"
          >
            Privacy Policy
          </MenuLink>
          <MenuLink
            href="/policies"
            icon={ArrowCounterClockwise}
            iconClassName="text-(--muted)"
          >
            Refund Policy
          </MenuLink>
          <MenuLink
            href="/community-guidelines"
            icon={UsersThree}
            iconClassName="text-(--muted)"
          >
            Community Guidelines
          </MenuLink>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="mx-1.5 my-1.5" />
        <MenuLink href="/about" icon={Info} iconClassName="text-teal-400">
          About ProCodrr
        </MenuLink>
        <div className="mt-1 border-t border-(--border) px-3 pt-2.5 pb-1.5 text-xs text-(--muted)">
          © 2026 ProCodrr
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
