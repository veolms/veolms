/**
 * The academy's legal and company pages. The text here is a placeholder:
 * each page says so, and lists what its final version covers, until the
 * academy's own wording replaces it.
 */
export interface LegalPage {
  path: string;
  /** The page's name, as links and its heading show it. */
  title: string;
  /** One line under the heading. */
  summary: string;
  sections: readonly { heading: string; body: string }[];
}

const PLACEHOLDER_NOTE =
  "This page is a placeholder. The academy's final text will be published here.";

export const LEGAL_PAGES = [
  {
    path: "/terms",
    title: "Terms of Service",
    summary: "The terms that apply when you use this academy.",
    sections: [
      { heading: "About this page", body: PLACEHOLDER_NOTE },
      {
        heading: "What it will cover",
        body: "Your account, using the courses and their content, purchases and access, community rules in discussions, and how these terms change.",
      },
    ],
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    summary: "What we collect, why, and the choices you have.",
    sections: [
      { heading: "About this page", body: PLACEHOLDER_NOTE },
      {
        heading: "What it will cover",
        body: "The information collected when you sign up, learn and pay; how it is used and kept; who it is shared with; and how to see, change or delete it.",
      },
    ],
  },
  {
    path: "/refund-policy",
    title: "Refund Policy",
    summary: "When and how a purchase can be refunded.",
    sections: [
      { heading: "About this page", body: PLACEHOLDER_NOTE },
      {
        heading: "What it will cover",
        body: "Which purchases can be refunded, the time to ask in, how to ask, and how long a refund takes.",
      },
    ],
  },
  {
    path: "/contact",
    title: "Contact Us",
    summary: "How to reach the academy.",
    sections: [
      { heading: "About this page", body: PLACEHOLDER_NOTE },
      {
        heading: "What it will cover",
        body: "Where to write for help with your account, a purchase or a course, and when to expect an answer.",
      },
    ],
  },
  {
    path: "/about",
    title: "About Us",
    summary: "Who runs this academy and why.",
    sections: [
      { heading: "About this page", body: PLACEHOLDER_NOTE },
      {
        heading: "What it will cover",
        body: "The people behind the academy, what it teaches, and how its courses are made.",
      },
    ],
  },
] as const satisfies readonly LegalPage[];

export type LegalPagePath = (typeof LEGAL_PAGES)[number]["path"];

export function findLegalPage(pathname: string): LegalPage | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  return LEGAL_PAGES.find((page) => page.path === path);
}
