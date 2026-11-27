import type { LegalPageSlug } from "@veolms/contracts";
import { aboutDocument } from "./documents/about";
import { communityGuidelinesDocument } from "./documents/community-guidelines";
import { contactDocument } from "./documents/contact";
import { deleteAccountDocument } from "./documents/delete-account";
import { policiesDocument } from "./documents/policies";
import { privacyDocument } from "./documents/privacy";
import { termsDocument } from "./documents/terms";
import type { LegalDocument } from "./legalDocument";

/** Each legal page's built-in document, by the slug its saved text is kept under. */
export const BUILT_IN_LEGAL_DOCUMENTS: Readonly<
  Record<LegalPageSlug, LegalDocument>
> = {
  terms: termsDocument,
  privacy: privacyDocument,
  policies: policiesDocument,
  "community-guidelines": communityGuidelinesDocument,
  about: aboutDocument,
  contact: contactDocument,
  "delete-account": deleteAccountDocument,
};
