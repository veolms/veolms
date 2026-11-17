import type { Icon } from "@phosphor-icons/react";
import { ChatsCircleIcon } from "@phosphor-icons/react/ChatsCircle";
import { GridFourIcon } from "@phosphor-icons/react/GridFour";
import { LinkSimpleIcon } from "@phosphor-icons/react/LinkSimple";
import { MegaphoneIcon } from "@phosphor-icons/react/Megaphone";
import { QuestionIcon } from "@phosphor-icons/react/Question";
import { RowsIcon } from "@phosphor-icons/react/Rows";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import { BooksIcon } from "@phosphor-icons/react/Books";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { NavigationArrowIcon } from "@phosphor-icons/react/NavigationArrow";
import { SealCheckIcon } from "@phosphor-icons/react/SealCheck";
import { TagIcon } from "@phosphor-icons/react/Tag";
import { UserCircleIcon } from "@phosphor-icons/react/UserCircle";
import type { SiteSectionType } from "@veolms/contracts";

/**
 * What the editor knows about each section: its name, where it sits in the
 * "Add" gallery, and the fields its Content tab shows. The renderer
 * (@veolms/site-render) owns how a section looks; this file owns how it is
 * edited. A new section type needs an entry here and nothing else in the
 * editor.
 */

export type FieldSpec =
  | {
      kind: "text";
      key: string;
      label: string;
      placeholder?: string;
      max?: number;
    }
  | {
      kind: "textarea";
      key: string;
      label: string;
      placeholder?: string;
      rows?: number;
      max?: number;
    }
  | { kind: "toggle"; key: string; label: string; help?: string }
  | {
      kind: "choice";
      key: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
    }
  | { kind: "number"; key: string; label: string; min: number; max: number }
  | { kind: "image"; key: string; label: string }
  | { kind: "button"; key: string; label: string }
  | { kind: "link"; key: string; label: string }
  | { kind: "courses"; key: string; label: string }
  | {
      kind: "list";
      key: string;
      label: string;
      /** What one item is called ("Point", "Question"). */
      itemLabel: string;
      /** The field whose words name an item in the list. */
      titleKey: string;
      fields: readonly FieldSpec[];
      newItem: () => Record<string, unknown>;
      max: number;
    };

/** A field shown only when the section's settings allow it. */
export type ConditionalField = FieldSpec & {
  showIf?: (settings: Record<string, unknown>) => boolean;
};

export type SectionGroup = "top" | "content" | "selling" | "proof" | "end";

export const SECTION_GROUPS: ReadonlyArray<{
  id: SectionGroup;
  label: string;
}> = [
  { id: "top", label: "Top of the page" },
  { id: "selling", label: "Selling" },
  { id: "content", label: "Content" },
  { id: "proof", label: "Proof and trust" },
  { id: "end", label: "End of the page" },
];

export interface SectionMeta {
  label: string;
  description: string;
  group: SectionGroup;
  Icon: Icon;
  fields: readonly ConditionalField[];
}

const NO_LINK = { kind: "none" } as const;

const button = (key: string, label: string): FieldSpec => ({
  kind: "button",
  key,
  label,
});

export const SECTION_CATALOG: Record<SiteSectionType, SectionMeta> = {
  hero: {
    label: "Hero",
    description: "The first thing visitors see: a big headline and buttons.",
    group: "top",
    Icon: SparkleIcon,
    fields: [
      { kind: "text", key: "eyebrow", label: "Small line above", max: 80 },
      {
        kind: "textarea",
        key: "heading",
        label: "Headline",
        rows: 2,
        max: 140,
      },
      { kind: "textarea", key: "subheading", label: "Text under it", max: 400 },
      { kind: "image", key: "image", label: "Picture" },
      button("primary", "Main button"),
      button("secondary", "Second button"),
    ],
  },
  features: {
    label: "Features",
    description: "Why learn with you: points with an emoji or icon.",
    group: "content",
    Icon: GridFourIcon,
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 140 },
      { kind: "textarea", key: "intro", label: "Introduction", max: 400 },
      {
        kind: "list",
        key: "items",
        label: "Points",
        itemLabel: "Point",
        titleKey: "title",
        max: 12,
        newItem: () => ({ mark: "✨", title: "New point", text: "" }),
        fields: [
          { kind: "text", key: "mark", label: "Emoji", max: 8 },
          { kind: "text", key: "title", label: "Title", max: 100 },
          { kind: "textarea", key: "text", label: "Text", max: 400 },
        ],
      },
    ],
  },
  courses: {
    label: "Courses",
    description: "Course cards with prices, filled from your courses.",
    group: "selling",
    Icon: BooksIcon,
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 140 },
      { kind: "textarea", key: "intro", label: "Introduction", max: 400 },
      {
        kind: "choice",
        key: "source",
        label: "Which courses",
        options: [
          { value: "latest", label: "Newest" },
          { value: "picked", label: "Pick them" },
        ],
      },
      {
        kind: "courses",
        key: "courseIds",
        label: "Courses to show",
        showIf: (settings) => settings.source === "picked",
      },
      {
        kind: "number",
        key: "limit",
        label: "How many",
        min: 1,
        max: 12,
        showIf: (settings) => settings.source !== "picked",
      },
      { kind: "toggle", key: "showPrice", label: "Show prices" },
    ],
  },
  testimonials: {
    label: "Testimonials",
    description: "What your students say, in their own words.",
    group: "proof",
    Icon: ChatsCircleIcon,
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 140 },
      {
        kind: "toggle",
        key: "confirmedReal",
        label: "These are real students' words",
        help: "Shown only when ticked, as Indian rules on fake reviews require.",
      },
      {
        kind: "list",
        key: "items",
        label: "Quotes",
        itemLabel: "Quote",
        titleKey: "name",
        max: 12,
        newItem: () => ({ quote: "", name: "", detail: "" }),
        fields: [
          { kind: "textarea", key: "quote", label: "What they said", max: 600 },
          { kind: "text", key: "name", label: "Name", max: 80 },
          {
            kind: "text",
            key: "detail",
            label: "Detail (city, job)",
            max: 120,
          },
        ],
      },
    ],
  },
  faq: {
    label: "Questions (FAQ)",
    description: "Answers to what buyers ask before paying.",
    group: "proof",
    Icon: QuestionIcon,
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 140 },
      {
        kind: "list",
        key: "items",
        label: "Questions",
        itemLabel: "Question",
        titleKey: "question",
        max: 30,
        newItem: () => ({ question: "New question", answer: "The answer." }),
        fields: [
          { kind: "text", key: "question", label: "Question", max: 200 },
          { kind: "textarea", key: "answer", label: "Answer", max: 1500 },
        ],
      },
    ],
  },
  cta: {
    label: "Call to action",
    description: "One clear next step, with a button.",
    group: "end",
    Icon: MegaphoneIcon,
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 140 },
      { kind: "textarea", key: "text", label: "Text", max: 400 },
      button("button", "Button"),
    ],
  },
  links: {
    label: "Link in bio",
    description: "Your photo, a short bio and a list of links.",
    group: "top",
    Icon: LinkSimpleIcon,
    fields: [
      { kind: "text", key: "name", label: "Name", max: 80 },
      { kind: "textarea", key: "bio", label: "Bio", max: 300 },
      { kind: "image", key: "image", label: "Photo" },
      {
        kind: "list",
        key: "items",
        label: "Links",
        itemLabel: "Link",
        titleKey: "label",
        max: 20,
        newItem: () => ({ label: "New link", link: NO_LINK }),
        fields: [
          { kind: "text", key: "label", label: "Button text", max: 60 },
          { kind: "link", key: "link", label: "Goes to" },
        ],
      },
    ],
  },
  footer: {
    label: "Footer",
    description: "Your name, links and the legal pages, at the very end.",
    group: "end",
    Icon: RowsIcon,
    fields: [
      { kind: "text", key: "tagline", label: "Tagline", max: 200 },
      {
        kind: "toggle",
        key: "showLegal",
        label: "Links to Terms, Privacy and Refunds",
      },
      {
        kind: "list",
        key: "links",
        label: "Links",
        itemLabel: "Link",
        titleKey: "label",
        max: 12,
        newItem: () => ({ label: "New link", link: NO_LINK }),
        fields: [
          { kind: "text", key: "label", label: "Text", max: 60 },
          { kind: "link", key: "link", label: "Goes to" },
        ],
      },
    ],
  },
  header: {
    label: "Header",
    description: "Your name, a few links and a button, at the top.",
    group: "top",
    Icon: NavigationArrowIcon,
    fields: [
      {
        kind: "toggle",
        key: "sticky",
        label: "Stay at the top while scrolling",
      },
      {
        kind: "list",
        key: "links",
        label: "Links",
        itemLabel: "Link",
        titleKey: "label",
        max: 6,
        newItem: () => ({ label: "New link", link: NO_LINK }),
        fields: [
          { kind: "text", key: "label", label: "Text", max: 60 },
          { kind: "link", key: "link", label: "Goes to" },
        ],
      },
      button("button", "Button"),
    ],
  },
  logos: {
    label: "Logo strip",
    description: "Where your students work, or where you were featured.",
    group: "proof",
    Icon: SealCheckIcon,
    fields: [
      { kind: "text", key: "heading", label: "Line above", max: 140 },
      {
        kind: "list",
        key: "items",
        label: "Logos",
        itemLabel: "Logo",
        titleKey: "name",
        max: 16,
        newItem: () => ({ name: "Company", image: { src: "", alt: "" } }),
        fields: [
          { kind: "text", key: "name", label: "Name", max: 60 },
          { kind: "image", key: "image", label: "Logo (optional)" },
        ],
      },
    ],
  },
  stats: {
    label: "Numbers",
    description: "Big numbers that count up: students, rating, lessons.",
    group: "proof",
    Icon: ChartLineUpIcon,
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 140 },
      { kind: "textarea", key: "intro", label: "Introduction", max: 400 },
      {
        kind: "list",
        key: "items",
        label: "Numbers",
        itemLabel: "Number",
        titleKey: "label",
        max: 6,
        newItem: () => ({ value: "100+", label: "Something to count" }),
        fields: [
          {
            kind: "text",
            key: "value",
            label: "Number",
            max: 16,
            placeholder: "12,000+",
          },
          { kind: "text", key: "label", label: "What it counts", max: 80 },
        ],
      },
    ],
  },
  pricing: {
    label: "Pricing",
    description: "Plans with prices, what's included and a button each.",
    group: "selling",
    Icon: TagIcon,
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 140 },
      { kind: "textarea", key: "intro", label: "Introduction", max: 400 },
      {
        kind: "list",
        key: "plans",
        label: "Plans",
        itemLabel: "Plan",
        titleKey: "name",
        max: 4,
        newItem: () => ({
          name: "New plan",
          price: "₹999",
          compareAt: "",
          period: "one-time",
          features: "",
          button: { label: "Buy now", link: { kind: "courses" } },
          highlight: false,
          badge: "",
        }),
        fields: [
          { kind: "text", key: "name", label: "Plan name", max: 60 },
          {
            kind: "text",
            key: "price",
            label: "Price",
            max: 24,
            placeholder: "₹1,999",
          },
          {
            kind: "text",
            key: "compareAt",
            label: "Old price (struck out)",
            max: 24,
          },
          {
            kind: "text",
            key: "period",
            label: "Below the price",
            max: 40,
            placeholder: "one-time",
          },
          {
            kind: "textarea",
            key: "features",
            label: "What's included (one per line)",
            rows: 4,
            max: 1200,
          },
          { kind: "button", key: "button", label: "Button" },
          { kind: "toggle", key: "highlight", label: "Make it stand out" },
          {
            kind: "text",
            key: "badge",
            label: "Badge on top",
            max: 30,
            placeholder: "Most popular",
          },
        ],
      },
      { kind: "text", key: "note", label: "Line under the plans", max: 200 },
    ],
  },
  about: {
    label: "About you",
    description: "Your photo, your story and a few facts about you.",
    group: "content",
    Icon: UserCircleIcon,
    fields: [
      { kind: "text", key: "eyebrow", label: "Small line above", max: 80 },
      { kind: "text", key: "heading", label: "Heading", max: 140 },
      {
        kind: "textarea",
        key: "text",
        label: "Your story",
        rows: 5,
        max: 1500,
      },
      { kind: "image", key: "image", label: "Photo" },
      {
        kind: "list",
        key: "facts",
        label: "Facts",
        itemLabel: "Fact",
        titleKey: "text",
        max: 6,
        newItem: () => ({ text: "A fact about you" }),
        fields: [{ kind: "text", key: "text", label: "Fact", max: 60 }],
      },
      button("button", "Button"),
    ],
  },
};

/** What each layout is called in the Design tab. */
export const LAYOUT_LABELS: Record<string, string> = {
  centered: "Centred",
  split: "Text and picture",
  banner: "Big banner",
  gradient: "Glowing gradient",
  grid: "Grid",
  list: "List",
  cards: "Cards",
  bento: "Bento grid",
  steps: "Numbered steps",
  checklist: "Checklist",
  row: "Swipe row",
  spotlight: "One big quote",
  wall: "Wall of love",
  marquee: "Gliding row",
  accordion: "Open one at a time",
  columns: "Two columns",
  card: "Card",
  stack: "Stacked buttons",
  pills: "Pills",
  simple: "Simple",
  classic: "Links on the right",
  minimal: "Name and button",
  inline: "In a row",
  band: "Band with dividers",
  single: "One offer",
  left: "Photo on the left",
  right: "Photo on the right",
};

/** A section's colour schemes, with the swatch the Design tab shows. */
export const TONE_CHOICES = [
  { value: "default", label: "Page", swatch: "var(--ed-bg)" },
  { value: "muted", label: "Soft", swatch: "var(--ed-surface)" },
  { value: "accent", label: "Tint", swatch: "var(--ed-soft)" },
  { value: "brand", label: "Brand", swatch: "var(--ed-accent)" },
  { value: "inverse", label: "Dark", swatch: "var(--ed-inverse)" },
] as const;

export const ANIMATION_CHOICES = [
  { value: "", label: "Theme's choice" },
  { value: "none", label: "None" },
  { value: "fade", label: "Fade in" },
  { value: "fade-up", label: "Rise up" },
  { value: "zoom", label: "Zoom in" },
  { value: "slide-left", label: "Slide from right" },
  { value: "slide-right", label: "Slide from left" },
  { value: "blur", label: "Blur in" },
] as const;
