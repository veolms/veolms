import type { LegalPagePlaceholder } from "@veolms/contracts";

/** What each placeholder stands for, as the editor explains it. */
export const PLACEHOLDER_LABELS: Record<LegalPagePlaceholder, string> = {
  academyName: "Academy name",
  companyName: "Company name",
  contactEmail: "Contact email",
  postalAddress: "Postal address",
  grievanceOfficer: "Grievance Officer",
  siteUrl: "Website address",
};
