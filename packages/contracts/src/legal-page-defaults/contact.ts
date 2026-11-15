import type { LegalPageTemplate } from "./index.ts";

export const contactTemplate: LegalPageTemplate = {
  slug: "contact",
  title: "Contact {{academyName}}",
  description:
    "Contact {{academyName}} for course support, purchase questions, privacy requests, or postal correspondence.",
  heading: "Contact {{academyName}}",
  effective: null,
  markdown: `Contact us about courses, your learner account, purchases, or privacy requests.

## Email

For support or general questions, email [{{contactEmail}}](mailto:{{contactEmail}}). For account or privacy requests, include the email address associated with your {{academyName}} account.

## Postal address

{{companyName}}  
{{postalAddress}}  

## Grievance Officer

{{grievanceOfficer}}, {{companyName}}, is our Grievance Officer under the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023. Write to [{{contactEmail}}](mailto:{{contactEmail}}) with “Grievance” in the subject line. We acknowledge grievances within 48 hours and aim to resolve them within 30 days.
`,
};
