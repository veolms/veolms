import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { DeviceMobileIcon } from "@phosphor-icons/react/DeviceMobile";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/EnvelopeSimple";
import { KeyIcon } from "@phosphor-icons/react/Key";
import { LockIcon } from "@phosphor-icons/react/Lock";
import { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
import { StarIcon } from "@phosphor-icons/react/Star";
import { UserCircleIcon } from "@phosphor-icons/react/UserCircle";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import ArrowLeftGlyph from "lucide-react/dist/esm/icons/arrow-left.mjs";
import ArrowRightGlyph from "lucide-react/dist/esm/icons/arrow-right.mjs";
import Check from "lucide-react/dist/esm/icons/check.mjs";
import CircleAlert from "lucide-react/dist/esm/icons/circle-alert.mjs";
import CircleUserRound from "lucide-react/dist/esm/icons/circle-user-round.mjs";
import Clock from "lucide-react/dist/esm/icons/clock.mjs";
import Copy from "lucide-react/dist/esm/icons/copy.mjs";
import Download from "lucide-react/dist/esm/icons/download.mjs";
import Lock from "lucide-react/dist/esm/icons/lock.mjs";
import Mail from "lucide-react/dist/esm/icons/mail.mjs";
import UserRoundKey from "lucide-react/dist/esm/icons/user-round-key.mjs";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.mjs";
import Smartphone from "lucide-react/dist/esm/icons/smartphone.mjs";
import Star from "lucide-react/dist/esm/icons/star.mjs";
import type { ComponentType } from "react";

export const ICON_PACKS = ["lucide", "phosphor"] as const;

export type IconPack = (typeof ICON_PACKS)[number];

export type IconEmphasis = "regular" | "bold" | "fill";

export interface IconGlyphProps {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  weight?: IconEmphasis;
  strokeWidth?: number;
}

export type IconGlyph = ComponentType<IconGlyphProps>;

export const iconRegistry = {
  email: { lucide: Mail, phosphor: EnvelopeSimpleIcon },
  mobile: { lucide: Smartphone, phosphor: DeviceMobileIcon },
  validationError: { lucide: CircleAlert, phosphor: WarningCircleIcon },
  arrowLeft: { lucide: ArrowLeftGlyph, phosphor: ArrowLeft },
  arrowRight: { lucide: ArrowRightGlyph, phosphor: ArrowRight },
  verified: { lucide: Check, phosphor: CheckIcon },
  person: { lucide: CircleUserRound, phosphor: UserCircleIcon },
  passkey: { lucide: UserRoundKey, phosphor: KeyIcon },
  authenticator: { lucide: Lock, phosphor: LockIcon },
  lock: { lucide: Lock, phosphor: LockIcon },
  recommended: { lucide: Star, phosphor: StarIcon },
  shield: { lucide: ShieldCheck, phosphor: ShieldCheckIcon },
  refreshTimer: { lucide: Clock, phosphor: ClockIcon },
  copy: { lucide: Copy, phosphor: CopyIcon },
  download: { lucide: Download, phosphor: DownloadSimpleIcon },
} as const satisfies Record<string, Record<IconPack, IconGlyph>>;

export type IconName = keyof typeof iconRegistry;
