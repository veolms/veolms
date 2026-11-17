import {
  SITE_PAGE_SCHEMA_VERSION,
  SITE_THEMES,
  type SitePageDocument,
  type SitePageType,
  type SiteSection,
  type SiteSectionSettings,
  type SiteSectionType,
  type SiteThemeId,
} from "@veolms/contracts";

const NO_LINK = { kind: "none" } as const;
const NO_IMAGE = { src: "", alt: "" };

/** What a newly added section says before the creator changes it. */
export const SECTION_DEFAULTS: {
  [Type in SiteSectionType]: SiteSectionSettings<Type>;
} = {
  hero: {
    tone: "default",
    spacing: "lg",
    eyebrow: "",
    heading: "Learn the skill that changes your work",
    subheading:
      "Short, practical lessons you can follow at your own pace, from your phone or laptop.",
    image: NO_IMAGE,
    primary: { label: "See the courses", link: { kind: "courses" } },
    secondary: { label: "", link: NO_LINK },
  },
  features: {
    tone: "default",
    spacing: "md",
    heading: "Why learn with us",
    intro: "",
    items: [
      {
        mark: "🎯",
        title: "Practical",
        text: "Every lesson ends with something you can use.",
      },
      {
        mark: "⏱️",
        title: "At your pace",
        text: "Watch when it suits you, as often as you like.",
      },
      {
        mark: "💬",
        title: "Real help",
        text: "Ask questions and get answers from the teacher.",
      },
    ],
  },
  courses: {
    tone: "muted",
    spacing: "md",
    heading: "Courses",
    intro: "",
    source: "latest",
    courseIds: [],
    limit: 6,
    showPrice: true,
  },
  testimonials: {
    tone: "default",
    spacing: "md",
    heading: "What students say",
    confirmedReal: false,
    items: [],
  },
  faq: {
    tone: "default",
    spacing: "md",
    heading: "Questions",
    items: [
      {
        question: "How long do I have access?",
        answer: "You keep access for as long as the course says on its page.",
      },
      {
        question: "Can I learn on my phone?",
        answer: "Yes. Every lesson works on a phone, a tablet or a computer.",
      },
    ],
  },
  cta: {
    tone: "accent",
    spacing: "md",
    heading: "Ready to start?",
    text: "Join today and take the first lesson in the next five minutes.",
    button: { label: "See the courses", link: { kind: "courses" } },
  },
  links: {
    tone: "default",
    spacing: "lg",
    name: "",
    bio: "",
    image: NO_IMAGE,
    items: [{ label: "See my courses", link: { kind: "courses" } }],
  },
  footer: {
    tone: "muted",
    spacing: "sm",
    tagline: "",
    links: [],
    showLegal: true,
  },
};

let idCounter = 0;

/** A short id, unique within a page. */
export function newSectionId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `s${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A new section with its default words and the theme's default layout. */
export function newSection<Type extends SiteSectionType>(
  type: Type,
  themeId: SiteThemeId,
  overrides: Partial<SiteSectionSettings<Type>> = {},
): SiteSection {
  return {
    id: newSectionId(),
    type,
    layout: SITE_THEMES[themeId].defaultLayouts[type],
    settings: structuredClone({ ...SECTION_DEFAULTS[type], ...overrides }),
  } as unknown as SiteSection;
}

/** The sections each kind of page starts with. */
export function pageTemplate(
  type: SitePageType,
  title: string,
  themeId: SiteThemeId,
): SitePageDocument {
  const seo = { title, description: "" };
  const sections: SiteSection[] = (() => {
    switch (type) {
      case "home":
        return [
          newSection("hero", themeId),
          newSection("features", themeId),
          newSection("courses", themeId),
          newSection("testimonials", themeId),
          newSection("faq", themeId),
          newSection("cta", themeId),
          newSection("footer", themeId),
        ];
      case "landing":
        return [
          newSection("hero", themeId, { heading: title }),
          newSection("features", themeId),
          newSection("testimonials", themeId),
          newSection("faq", themeId),
          newSection("cta", themeId),
          newSection("footer", themeId),
        ];
      case "link_in_bio":
        return [
          newSection("links", themeId, { name: title }),
          newSection("footer", themeId, { tone: "default" }),
        ];
      case "blank":
        return [];
    }
  })();
  return { schemaVersion: SITE_PAGE_SCHEMA_VERSION, seo, sections };
}
