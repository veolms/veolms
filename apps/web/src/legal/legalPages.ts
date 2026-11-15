import type { LegalPageSlug } from "@veolms/contracts";

/**
 * The legal and company pages, as the logo menu and the pages' own
 * navigation list them. Their words come from the API (Platform > Legal
 * pages), each by its slug.
 */
export interface LegalPageLink {
  path: string;
  slug: LegalPageSlug;
  /** The page's name in menus and the side navigation. */
  title: string;
  /** A shorter name, for the phone layout's chips and the footer. */
  label: string;
  group: "policies" | "company";
}

export const LEGAL_PAGES = [
  {
    path: "/terms",
    slug: "terms",
    title: "Terms of Service",
    label: "Terms",
    group: "policies",
  },
  {
    path: "/privacy",
    slug: "privacy",
    title: "Privacy Policy",
    label: "Privacy",
    group: "policies",
  },
  {
    path: "/policies",
    slug: "policies",
    title: "Refund Policy",
    label: "Refunds",
    group: "policies",
  },
  {
    path: "/community-guidelines",
    slug: "community-guidelines",
    title: "Community Guidelines",
    label: "Guidelines",
    group: "policies",
  },
  {
    path: "/about",
    slug: "about",
    // Shown with the academy's name: see legalPageTitle.
    title: "About",
    label: "About",
    group: "company",
  },
  {
    path: "/contact",
    slug: "contact",
    title: "Contact Us",
    label: "Contact",
    group: "company",
  },
  {
    path: "/delete-account",
    slug: "delete-account",
    title: "Delete Your Account",
    label: "Delete account",
    group: "company",
  },
] as const satisfies readonly LegalPageLink[];

export type LegalPagePath = (typeof LEGAL_PAGES)[number]["path"];

/** A page's name in menus: "About" names the academy. */
export function legalPageTitle(
  page: LegalPageLink,
  academyName: string,
): string {
  return page.slug === "about" ? `About ${academyName}` : page.title;
}
