import type { LegalPageTemplate } from "./index.ts";

export const policiesTemplate: LegalPageTemplate = {
  slug: "policies",
  title: "Refund, Delivery & Contact Policies | {{academyName}}",
  description:
    "Refund and cancellation, digital delivery, and contact policies for {{academyName}} courses bought on {{siteUrl}} and used on the {{academyName}} learning platform and Android app.",
  heading: "Refund, Delivery & Contact Policies",
  effective: "Effective date: November 9, 2026",
  markdown: `These policies apply to courses sold by {{companyName}} on our website and used on the {{academyName}} learning platform and Android app. They form part of our [Terms of Service](/terms).

## Refund and Cancellation Policy

You can get a refund yourself from **Purchase History**: open the menu next to the course and choose **Request refund**. An eligible refund is processed automatically, with no need to contact us. A purchase paid by bank or UPI transfer, and a refund our payment provider cannot complete, stay as a pending request for our team to process.

A purchase is eligible when both of these are true: it was made within the last **30 days**, and you have watched no more than **10% of the course or 10 hours of it**, whichever is less. For example, you can watch up to 5 hours of a 50-hour course, and up to 10 hours of a 200-hour course.

A **quiz pass** is eligible when it was bought within the last **30 days** and you have attempted no more than **10% of its quizzes**. For example, you can try 1 quiz of a pass with 10 quizzes.

If you bought part of a course and then upgraded to the whole course, the part’s price was taken off the upgrade, so that part cannot be refunded on its own.

If **Request refund** is greyed out, the purchase is not eligible for a refund, and the menu shows why. Emailing us will not change that.

A refund covers the whole purchase. It is returned to your original payment method through the payment provider you paid with, or by bank transfer if that is how you paid, and normally appears within 5 to 10 business days, depending on your bank. Your access to every course in the refunded purchase ends when the refund is issued.

Refunds are not available after 30 days, where more than 10% of the course or 10 hours of it has been watched, where more than 10% of a quiz pass’s quizzes have been attempted, for part of a course whose price was counted towards an upgrade to the whole course, for purchases made with a promotional or bundle discount where the offer terms say so, or where an account has been terminated for breaching our Terms of Service. Nothing here limits your rights under the Consumer Protection Act, 2019.

**Android app:** courses cannot be bought inside the {{academyName}} Android app and we do not use Google Play billing, so Google Play’s refund process does not apply. Refunds are requested from Purchase History as described above.

## Delivery Policy

{{academyName}} does not ship physical goods. Every course is delivered digitally: once your payment is confirmed, the course is added to your learner account and is available immediately on the learning platform and in the Android app when you sign in with the same account. You also receive a confirmation email with your receipt. If a course is not visible within one hour of a successful payment, email us with your order number and we will fix it.

Payments made by bank transfer are confirmed manually and may take up to 2 business days to reflect.

## Account Deletion

You can ask us to delete your account and personal data at any time by email, following the steps on our [account deletion page](/delete-account). Deleting your account ends access to all courses, including paid ones, and does not by itself trigger a refund.

## Contact Us

For support, purchase questions, or anything else, email [{{contactEmail}}](mailto:{{contactEmail}}). Our postal address and Grievance Officer details are on the [Contact page](/contact).
`,
};
