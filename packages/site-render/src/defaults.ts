import {
  SITE_PAGE_SCHEMA_VERSION,
  SITE_SECTION_LAYOUTS,
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
  header: {
    tone: "default",
    spacing: "sm",
    animation: "none",
    links: [{ label: "Courses", link: { kind: "courses" } }],
    button: { label: "Start learning", link: { kind: "courses" } },
    sticky: true,
  },
  logos: {
    tone: "default",
    spacing: "sm",
    heading: "Our students work at",
    items: [
      { name: "Infosys", image: NO_IMAGE },
      { name: "TCS", image: NO_IMAGE },
      { name: "Flipkart", image: NO_IMAGE },
      { name: "Zomato", image: NO_IMAGE },
      { name: "Razorpay", image: NO_IMAGE },
    ],
  },
  stats: {
    tone: "default",
    spacing: "md",
    heading: "",
    intro: "",
    items: [
      { value: "12,000+", label: "Students taught" },
      { value: "4.8★", label: "Average rating" },
      { value: "150+", label: "Lessons" },
      { value: "92%", label: "Finish their course" },
    ],
  },
  pricing: {
    tone: "muted",
    spacing: "lg",
    heading: "Choose how you learn",
    intro: "Pay once, learn for life. Prices include GST.",
    plans: [
      {
        name: "Course",
        price: "₹1,999",
        compareAt: "₹3,999",
        period: "one-time",
        features:
          "Every lesson\nPractice exercises\nCertificate when you finish",
        button: { label: "Buy the course", link: { kind: "courses" } },
        highlight: false,
        badge: "",
      },
      {
        name: "Course + mentoring",
        price: "₹4,999",
        compareAt: "",
        period: "one-time",
        features:
          "Everything in Course\nWeekly live doubt classes\nResume and interview review",
        button: { label: "Join with mentoring", link: { kind: "courses" } },
        highlight: true,
        badge: "Most popular",
      },
    ],
    note: "30-day refund if it isn't for you.",
  },
  about: {
    tone: "default",
    spacing: "lg",
    eyebrow: "Your teacher",
    heading: "Hi, I'm your instructor",
    text: "I've spent years doing this work and teaching it. Here you learn what actually matters, in the order that makes it click.",
    image: NO_IMAGE,
    facts: [{ text: "10+ years experience" }, { text: "5,000+ students" }],
    button: { label: "", link: NO_LINK },
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
    layout:
      SITE_THEMES[themeId].defaultLayouts[type] ??
      SITE_SECTION_LAYOUTS[type][0],
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
