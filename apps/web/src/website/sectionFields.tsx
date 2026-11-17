import type { CustomField, Field, Fields } from "@puckeditor/core";
import {
  SITE_SECTION_LAYOUTS,
  type SiteLink,
  type SiteSectionType,
} from "@veolms/contracts";
import { CoursePickerControl, LinkControl } from "./WebsiteFieldControls";

/** What each section is called in the editor. */
export const SECTION_LABELS: Record<SiteSectionType, string> = {
  hero: "Hero",
  features: "Features",
  courses: "Courses",
  testimonials: "Testimonials",
  faq: "Questions (FAQ)",
  cta: "Call to action",
  links: "Link in bio",
  footer: "Footer",
};

const LAYOUT_LABELS: Record<string, string> = {
  centered: "Centred",
  split: "Text and image",
  banner: "Big banner",
  grid: "Grid",
  list: "List",
  cards: "Cards",
  row: "Swipe row",
  spotlight: "One big quote",
  accordion: "Open one at a time",
  columns: "Two columns",
  card: "Card",
  stack: "Stacked buttons",
  pills: "Pills",
  simple: "Simple",
};

const layoutField = (type: SiteSectionType): Field => ({
  type: "radio",
  label: "Layout",
  options: SITE_SECTION_LAYOUTS[type].map((layout) => ({
    label: LAYOUT_LABELS[layout] ?? layout,
    value: layout,
  })),
});

const lookFields: Fields = {
  tone: {
    type: "select",
    label: "Background",
    options: [
      { label: "Page", value: "default" },
      { label: "Soft", value: "muted" },
      { label: "Brand tint", value: "accent" },
      { label: "Dark", value: "inverse" },
    ],
  },
  spacing: {
    type: "radio",
    label: "Space around",
    options: [
      { label: "Small", value: "sm" },
      { label: "Medium", value: "md" },
      { label: "Large", value: "lg" },
    ],
  },
};

const yesNo = (label: string): Field => ({
  type: "radio",
  label,
  options: [
    { label: "Yes", value: true },
    { label: "No", value: false },
  ],
});

const text = (label: string, placeholder?: string): Field => ({
  type: "text",
  label,
  ...(placeholder ? { placeholder } : {}),
});

const longText = (label: string): Field => ({
  type: "textarea",
  label,
});

const linkField = (label: string): Field =>
  ({
    type: "custom",
    label,
    render: ({ value, onChange }) => (
      <LinkControl value={value} onChange={onChange} label={label} />
    ),
  }) satisfies CustomField<SiteLink> as Field;

const buttonField = (label: string): Field => ({
  type: "object",
  label,
  objectFields: {
    label: { type: "text", label: "Button text" },
    link: linkField("Goes to"),
  },
});

const imageField = (label: string): Field => ({
  type: "object",
  label,
  objectFields: {
    src: { type: "text", label: "Image address", placeholder: "https://" },
    alt: { type: "text", label: "Describe the image" },
  },
});

/** The side-panel fields of each section, in reading order. */
export function sectionFields(type: SiteSectionType): Fields {
  const layout = { layout: layoutField(type) };
  switch (type) {
    case "hero":
      return {
        ...layout,
        eyebrow: text("Small line above the heading"),
        heading: longText("Heading"),
        subheading: longText("Text under the heading"),
        image: imageField("Image"),
        primary: buttonField("Main button"),
        secondary: buttonField("Second button"),
        ...lookFields,
      };
    case "features":
      return {
        ...layout,
        heading: text("Heading"),
        intro: longText("Introduction"),
        items: {
          type: "array",
          label: "Points",
          max: 12,
          arrayFields: {
            mark: { type: "text", label: "Emoji" },
            title: { type: "text", label: "Title" },
            text: { type: "textarea", label: "Text" },
          },
          defaultItemProps: { mark: "✨", title: "A new point", text: "" },
          getItemSummary: (item) => String(item.title || "Point"),
        },
        ...lookFields,
      };
    case "courses":
      return {
        ...layout,
        heading: text("Heading"),
        intro: longText("Introduction"),
        source: {
          type: "radio",
          label: "Which courses",
          options: [
            { label: "Newest", value: "latest" },
            { label: "Ones I pick", value: "picked" },
          ],
        },
        courseIds: {
          type: "custom",
          label: "Picked courses",
          render: ({ value, onChange }) => (
            <CoursePickerControl
              value={value}
              onChange={onChange}
              label="Picked courses"
            />
          ),
        },
        limit: { type: "number", label: "How many", min: 1, max: 12 },
        showPrice: yesNo("Show prices"),
        ...lookFields,
      };
    case "testimonials":
      return {
        ...layout,
        heading: text("Heading"),
        confirmedReal: yesNo("These are real students' words"),
        items: {
          type: "array",
          label: "What students said",
          max: 12,
          arrayFields: {
            quote: { type: "textarea", label: "Their words" },
            name: { type: "text", label: "Name" },
            detail: { type: "text", label: "Detail (city, batch, result)" },
          },
          defaultItemProps: { quote: "", name: "", detail: "" },
          getItemSummary: (item) => String(item.name || "Student"),
        },
        ...lookFields,
      };
    case "faq":
      return {
        ...layout,
        heading: text("Heading"),
        items: {
          type: "array",
          label: "Questions",
          max: 30,
          arrayFields: {
            question: { type: "text", label: "Question" },
            answer: { type: "textarea", label: "Answer" },
          },
          defaultItemProps: {
            question: "A new question?",
            answer: "The answer.",
          },
          getItemSummary: (item) => String(item.question || "Question"),
        },
        ...lookFields,
      };
    case "cta":
      return {
        ...layout,
        heading: longText("Heading"),
        text: longText("Text"),
        button: buttonField("Button"),
        ...lookFields,
      };
    case "links":
      return {
        ...layout,
        name: text("Your name"),
        bio: longText("A line about you"),
        image: imageField("Photo"),
        items: {
          type: "array",
          label: "Links",
          max: 20,
          arrayFields: {
            label: { type: "text", label: "Button text" },
            link: linkField("Goes to"),
          },
          defaultItemProps: { label: "New link", link: { kind: "none" } },
          getItemSummary: (item) => String(item.label || "Link"),
        },
        ...lookFields,
      };
    case "footer":
      return {
        ...layout,
        tagline: longText("A line about the academy"),
        links: {
          type: "array",
          label: "Links",
          max: 12,
          arrayFields: {
            label: { type: "text", label: "Link text" },
            link: linkField("Goes to"),
          },
          defaultItemProps: { label: "New link", link: { kind: "none" } },
          getItemSummary: (item) => String(item.label || "Link"),
        },
        showLegal: yesNo("Show Terms, Privacy and Refunds"),
        ...lookFields,
      };
  }
}
