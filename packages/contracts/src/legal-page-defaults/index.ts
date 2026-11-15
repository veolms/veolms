/**
 * Default words for an academy's legal and company pages, as Markdown
 * templates. Each template fills `{{companyName}}`, `{{postalAddress}}`,
 * `{{contactEmail}}`, `{{grievanceOfficer}}`, `{{academyName}}` and
 * `{{siteUrl}}` (a full origin, such as https://example.com) from the
 * academy's own details.
 */
import { aboutTemplate } from "./about.ts";
import { communityGuidelinesTemplate } from "./community-guidelines.ts";
import { contactTemplate } from "./contact.ts";
import { deleteAccountTemplate } from "./delete-account.ts";
import { policiesTemplate } from "./policies.ts";
import { privacyTemplate } from "./privacy.ts";
import { termsTemplate } from "./terms.ts";

export interface LegalPageTemplate {
  slug:
    | "terms"
    | "privacy"
    | "policies"
    | "community-guidelines"
    | "about"
    | "contact"
    | "delete-account";
  title: string;
  description: string;
  heading: string;
  /** "Effective date: …", as the page states it, or null when it has none. */
  effective: string | null;
  /** The intro paragraphs, then one `## ` section per heading. */
  markdown: string;
}

export const LEGAL_PAGE_TEMPLATES: Readonly<
  Record<LegalPageTemplate["slug"], LegalPageTemplate>
> = {
  terms: termsTemplate,
  privacy: privacyTemplate,
  policies: policiesTemplate,
  "community-guidelines": communityGuidelinesTemplate,
  about: aboutTemplate,
  contact: contactTemplate,
  "delete-account": deleteAccountTemplate,
};
