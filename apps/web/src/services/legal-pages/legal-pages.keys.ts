import type { LegalPageSlug } from "@veolms/contracts";

export const legalPagesKeys = {
  all: ["legal-pages"] as const,
  page: (slug: LegalPageSlug) => [...legalPagesKeys.all, "page", slug] as const,
  adminList: () => [...legalPagesKeys.all, "admin"] as const,
  adminPage: (slug: LegalPageSlug) =>
    [...legalPagesKeys.all, "admin", slug] as const,
};
