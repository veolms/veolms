/**
 * The legal and company pages, as the logo menu and the pages' own
 * navigation list them. Their words are in `documents/`.
 */
export const LEGAL_SUPPORT_EMAIL = "contact@procodrr.com";

export interface LegalPageLink {
  path: string;
  /** The page's name in menus and the side navigation. */
  title: string;
  /** A shorter name, for the phone layout's chips and the footer. */
  label: string;
  group: "policies" | "company";
}

export const LEGAL_PAGES = [
  {
    path: "/terms",
    title: "Terms of Service",
    label: "Terms",
    group: "policies",
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    label: "Privacy",
    group: "policies",
  },
  {
    path: "/policies",
    title: "Refund Policy",
    label: "Refunds",
    group: "policies",
  },
  {
    path: "/community-guidelines",
    title: "Community Guidelines",
    label: "Guidelines",
    group: "policies",
  },
  {
    path: "/about",
    title: "About ProCodrr",
    label: "About",
    group: "company",
  },
  {
    path: "/contact",
    title: "Contact Us",
    label: "Contact",
    group: "company",
  },
  {
    path: "/delete-account",
    title: "Delete Your Account",
    label: "Delete account",
    group: "company",
  },
] as const satisfies readonly LegalPageLink[];

export type LegalPagePath = (typeof LEGAL_PAGES)[number]["path"];
