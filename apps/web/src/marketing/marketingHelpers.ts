import type {
  MarketingAudience,
  MarketingAutomationKey,
  MarketingBlock,
  MarketingBlockType,
  MarketingEmailStats,
  MarketingEmailStatus,
  MarketingSegmentType,
  MarketingTemplateKey,
  MarketingTheme,
} from "@veolms/contracts";

export const MARKETING_PATH = "/marketing";
export const MARKETING_AUTOMATIONS_PATH = "/marketing/automations";

export function marketingEmailPath(id: string): string {
  return `/marketing/emails/${id}`;
}

export function marketingAutomationPath(key: MarketingAutomationKey): string {
  return `/marketing/automations/${key}`;
}

/** Which Marketing screen an address is: the lists, an email, an automation. */
export type MarketingView =
  | { kind: "emails" }
  | { kind: "automations" }
  | { kind: "email"; id: string }
  | { kind: "automation"; key: string };

export function marketingViewOf(pathname: string): MarketingView {
  const parts = pathname.split(/[?#]/u, 1)[0]!.split("/").filter(Boolean);
  if (parts[1] === "emails" && parts[2]) return { kind: "email", id: parts[2] };
  if (parts[1] === "automations" && parts[2]) {
    return { kind: "automation", key: parts[2] };
  }
  if (parts[1] === "automations") return { kind: "automations" };
  return { kind: "emails" };
}

export function emailStatusLabel(status: MarketingEmailStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "cancelled":
      return "Stopped";
    case "active":
      return "On";
    case "paused":
      return "Off";
  }
}

export function emailStatusClass(status: MarketingEmailStatus): string {
  switch (status) {
    case "scheduled":
      return "bg-(--accent)/12 text-(--accent) border border-(--accent)/20";
    case "sending":
    case "active":
      return "bg-emerald-500/12 text-emerald-500 border border-emerald-500/20";
    case "cancelled":
      return "bg-rose-500/12 text-rose-500 border border-rose-500/20";
    case "sent":
    case "draft":
    case "paused":
      return "bg-(--canvas) text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]";
  }
}

/** "42%" of those sent; "—" before anything was sent. */
export function rateOf(part: number, stats: MarketingEmailStats): string {
  if (stats.sent === 0) return "—";
  return `${Math.round((part / stats.sent) * 100)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatRupees(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export const TEMPLATE_CHOICES: readonly {
  key: MarketingTemplateKey;
  title: string;
  description: string;
  /** The look it starts with (the API's template sets the same). */
  theme: MarketingTheme;
}[] = [
  {
    key: "blank",
    title: "Blank",
    description: "Start from an empty email.",
    theme: "midnight",
  },
  {
    key: "welcome",
    theme: "clean",
    title: "Welcome",
    description: "Greet new students and show them where to start.",
  },
  {
    key: "launch",
    theme: "ocean",
    title: "New course launch",
    description: "Announce a course with what students will learn.",
  },
  {
    key: "workshop",
    theme: "warm",
    title: "Workshop invite",
    description: "Invite students to a live session.",
  },
  {
    key: "offer",
    theme: "ember",
    title: "Limited-time offer",
    description: "Share a coupon with a clear end date.",
  },
  {
    key: "newsletter",
    theme: "forest",
    title: "Newsletter",
    description: "A short round-up: what's new and one tip.",
  },
];

export const SEGMENT_CHOICES: readonly {
  type: Exclude<MarketingSegmentType, "not_opened">;
  label: string;
  hint: string;
}[] = [
  {
    type: "all",
    label: "All students",
    hint: "Everyone who is a student and can get email.",
  },
  {
    type: "bought",
    label: "Bought a course",
    hint: "Students with access to any of the courses you pick.",
  },
  {
    type: "not_bought",
    label: "Haven't bought a course",
    hint: "Students without the courses you pick: good for a launch.",
  },
  {
    type: "workshop",
    label: "Workshop registrants",
    hint: "People who registered for a workshop.",
  },
  { type: "new", label: "New students", hint: "Joined in the last few days." },
  {
    type: "inactive",
    label: "Inactive students",
    hint: "Have a course but haven't learned in a while.",
  },
  {
    type: "not_started",
    label: "Bought but not started",
    hint: "Have a course but never opened a lesson in it.",
  },
];

export function defaultSegment(
  type: MarketingSegmentType,
): MarketingAudience["segment"] {
  switch (type) {
    case "all":
      return { type: "all" };
    case "bought":
      return { type: "bought", courseIds: [] };
    case "not_bought":
      return { type: "not_bought", courseIds: [] };
    case "workshop":
      return { type: "workshop", workshopId: "", attendance: "all" };
    case "new":
      return { type: "new", days: 7 };
    case "inactive":
      return { type: "inactive", days: 14 };
    case "not_started":
      return { type: "not_started", courseIds: [] };
    case "not_opened":
      return { type: "all" };
  }
}

/** Whether the audience is complete enough to count (a course or workshop picked). */
export function audienceIsComplete(audience: MarketingAudience): boolean {
  const segment = audience.segment;
  if (segment.type === "bought" || segment.type === "not_bought") {
    return segment.courseIds.length > 0;
  }
  if (segment.type === "workshop") return Boolean(segment.workshopId);
  return true;
}

/** What "Add" offers. Course and workshop are cards filled from your own. */
export type MarketingBlockChoice = MarketingBlockType | "course" | "workshop";

export const BLOCK_GROUPS: readonly {
  title: string;
  choices: readonly {
    type: MarketingBlockChoice;
    label: string;
    hint: string;
  }[];
}[] = [
  {
    title: "Write",
    choices: [
      { type: "heading", label: "Heading", hint: "A big title" },
      { type: "text", label: "Text", hint: "Paragraphs, bold and links" },
      { type: "quote", label: "Quote", hint: "A student's words" },
    ],
  },
  {
    title: "Sell",
    choices: [
      { type: "button", label: "Button", hint: "One clear action" },
      { type: "coupon", label: "Coupon", hint: "A code to copy" },
      { type: "course", label: "Course", hint: "A card for one course" },
      { type: "workshop", label: "Workshop", hint: "Date, time and seat" },
      { type: "card", label: "Card", hint: "Picture, words, button" },
    ],
  },
  {
    title: "Layout",
    choices: [
      { type: "image", label: "Image", hint: "Upload or link one" },
      { type: "divider", label: "Divider", hint: "A thin line" },
      { type: "spacer", label: "Space", hint: "Room to breathe" },
    ],
  },
];

export const BLOCK_CHOICES = BLOCK_GROUPS.flatMap((group) => group.choices);

let blockCounter = 0;

export function newBlockId(): string {
  blockCounter += 1;
  return `b${Date.now().toString(36)}${blockCounter.toString(36)}`;
}

/** A page of this academy's site, so a new button or card already works. */
function sitePage(path: string): string {
  const origin =
    typeof window === "undefined"
      ? "https://example.com"
      : window.location.origin;
  return `${origin}${path}`;
}

export function newBlock(type: MarketingBlockChoice): MarketingBlock {
  const id = newBlockId();
  switch (type) {
    case "heading":
      return {
        id,
        type,
        text: "A clear headline",
        size: "large",
        align: "left",
      };
    case "text":
      return {
        id,
        type,
        text: "Hi {first_name},\n\nWrite your message here.",
        align: "left",
      };
    case "button":
      return {
        id,
        type,
        label: "Learn more",
        url: sitePage("/courses"),
        align: "left",
        style: "filled",
        color: null,
        fullWidth: false,
      };
    case "image":
      return {
        id,
        type,
        url: "https://",
        alt: "",
        link: null,
        size: "full",
        align: "center",
      };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: "medium" };
    case "coupon":
      return { id, type, code: "SAVE20", title: "Your code", note: "" };
    case "quote":
      return { id, type, text: "What a student said about you.", name: "" };
    case "card":
    case "course":
    case "workshop":
      return {
        id,
        type: "card",
        source: type === "card" ? "custom" : type,
        sourceId: null,
        title:
          type === "course"
            ? "Pick a course"
            : type === "workshop"
              ? "Pick a workshop"
              : "Card title",
        meta: "",
        text: "",
        imageUrl: null,
        url: sitePage(type === "workshop" ? "/workshops" : "/courses"),
        buttonLabel: type === "workshop" ? "Save my seat" : "Learn more",
      };
  }
}

export function blockLabel(block: MarketingBlock): string {
  if (block.type === "card") {
    return block.source === "course"
      ? "Course"
      : block.source === "workshop"
        ? "Workshop"
        : "Card";
  }
  return (
    BLOCK_CHOICES.find((choice) => choice.type === block.type)?.label ?? "Block"
  );
}

/** Where a block's choice icon comes from: a card shows its source. */
export function blockChoiceOf(block: MarketingBlock): MarketingBlockChoice {
  if (block.type === "card" && block.source !== "custom") return block.source;
  return block.type;
}

/** Accent colours offered next to the theme's own. */
export const ACCENT_CHOICES = [
  "#6E7CFF",
  "#4F46E5",
  "#7C3AED",
  "#DB2777",
  "#E11D48",
  "#EA580C",
  "#D97706",
  "#16A34A",
  "#0D9488",
  "#0284C7",
  "#111827",
] as const;

export function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

/** "Sends 2 hours after they buy": an automation's timing in one sentence. */
export function automationTimingSentence(
  key: MarketingAutomationKey,
  wait: number,
  unit: "hours" | "days",
): string {
  const amount = `${wait} ${wait === 1 ? unit.slice(0, -1) : unit}`;
  switch (key) {
    case "welcome":
      return wait === 0
        ? "Sends as soon as they join"
        : `Sends ${amount} after they join`;
    case "purchase_thanks":
      return wait === 0
        ? "Sends as soon as they buy"
        : `Sends ${amount} after they buy`;
    case "start_nudge":
      return `Sends ${amount} after buying, if they haven't started`;
    case "win_back":
      return `Sends after ${amount} without learning`;
    case "access_ending":
      return `Sends ${amount} before their access ends`;
    case "checkout_reminder":
      return `Sends ${amount} after a checkout that wasn't paid`;
  }
}
