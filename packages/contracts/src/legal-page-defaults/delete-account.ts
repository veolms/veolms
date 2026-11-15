import type { LegalPageTemplate } from "./index.ts";

export const deleteAccountTemplate: LegalPageTemplate = {
  slug: "delete-account",
  title: "Delete Your {{academyName}} Account",
  description:
    "How to request deletion of your {{academyName}} account and personal data by email, what is deleted, and what is kept.",
  heading: "Delete your {{academyName}} account",
  effective: null,
  markdown: `You can ask us to delete your {{academyName}} account and the personal data linked to it at any time. This applies to the {{academyName}} website, the learning platform at [{{siteUrl}}]({{siteUrl}}), and the {{academyName}} mobile apps, which all use the same account. This page explains how to make the request, what is deleted, and what we keep.

## How to request deletion

Account deletion is handled by email. To delete your account:

1. Email [{{contactEmail}}](mailto:{{contactEmail}}?subject=Delete%20my%20account) with the subject line **“Delete my account”**.
2. Send it from the email address registered on your {{academyName}} account, so we can confirm the request is yours. If you signed up with a phone number or with Google, tell us the email or phone number shown in your profile.

You do not need to sign in, and you do not need the app installed, to make a request.

## What happens next

We reply within 48 hours to confirm your request, and may ask you to confirm it once more if the email did not come from the address on the account. We then delete your account within 30 days. Once it is deleted you are signed out of every device, the account can no longer be used, and it cannot be restored.

## What is deleted

We permanently delete all of the private data linked to your account, including:

- your name, username, email address, mobile number, and profile photo;
- your sign-in sessions, including IP addresses and device descriptions, and any passkeys or authenticator settings;
- your enrolments, learning progress, quiz results, wishlist, notes, and settings;
- your notification history and push notification tokens;
- any lesson files downloaded to your devices, the next time the app runs.

Your access to all courses ends, including courses you paid for. Deleting your account does not by itself trigger a refund; see our [Refund Policy](/policies). Deleted data is removed from our backups within a further 30 days.

## Your public comments

Comments and replies you posted publicly, such as in course discussions, are not deleted, because other learners and creators have replied to them. Your name, username, profile photo, and link to your account are removed from them, and they are shown as posted by a **“Deleted user”**.

## What is kept, and for how long

- **Order, invoice, and payment records** are kept for up to 8 years because Indian tax and accounting laws require it. They are detached from your account and are not used for any other purpose.
- **Public comments**, without your name or profile, as described above, for as long as the course exists.
- **Records of fraud or abuse investigations**, if any, are kept as long as needed to protect the Services and other learners.

## Questions

Our [Privacy Policy](/privacy) describes all of our data practices. For anything about deletion or your data, contact our Grievance Officer, {{grievanceOfficer}}, at [{{contactEmail}}](mailto:{{contactEmail}}).
`,
};
