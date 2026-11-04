import { Link } from "react-router";
import type { LegalDocument } from "../legalDocument";

export const policiesDocument: LegalDocument = {
  path: "/policies",
  title: "Refund, Delivery & Contact Policies | ProCodrr",
  description:
    "Refund and cancellation, digital delivery, and contact policies for ProCodrr courses bought on procodrr.com and used on the ProCodrr learning platform and Android app.",
  heading: "Refund, Delivery & Contact Policies",
  effective: "Effective date: October 18, 2026",
  intro: (
    <>
      <p>
        These policies apply to courses sold by ProCodrr Labs LLP on our website
        and used on the ProCodrr learning platform and Android app. They form
        part of our <Link to="/terms">Terms of Service</Link>.
      </p>
    </>
  ),
  sections: [
    {
      id: "refund-and-cancellation-policy",
      title: "Refund and Cancellation Policy",
    },
    { id: "delivery-policy", title: "Delivery Policy" },
    { id: "account-deletion", title: "Account Deletion" },
    { id: "contact-us", title: "Contact Us" },
  ],
  body: (
    <>
      <section id="refund-and-cancellation-policy">
        <h2>
          <span>01</span>Refund and Cancellation Policy
        </h2>
        <p>
          You may request a refund within <strong>30 days</strong> of your
          purchase if you have completed no more than <strong>10%</strong> of
          the course content. To request one, email{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a> from
          the email address on your account with your order number and the
          course name. We check your course usage and reply within 5 business
          days.
        </p>
        <p>
          Approved refunds are returned to the original payment method through
          our payment provider, Razorpay, or by bank transfer if that is how you
          paid. They normally appear within 5 to 10 business days, depending on
          your bank. Your access to the refunded course ends when the refund is
          issued.
        </p>
        <p>
          Refunds are not available after 30 days, where more than 10% of the
          course has been completed, for purchases made with a promotional or
          bundle discount where the offer terms say so, or where an account has
          been terminated for breaching our Terms of Service. Nothing here
          limits your rights under the Consumer Protection Act, 2019.
        </p>
        <p>
          <strong>Android app:</strong> courses cannot be bought inside the
          ProCodrr Android app and we do not use Google Play billing, so Google
          Play’s refund process does not apply. All refund requests come to us
          directly using the steps above.
        </p>
      </section>
      <section id="delivery-policy">
        <h2>
          <span>02</span>Delivery Policy
        </h2>
        <p>
          ProCodrr does not ship physical goods. Every course is delivered
          digitally: once your payment is confirmed, the course is added to your
          learner account and is available immediately on the learning platform
          and in the Android app when you sign in with the same account. You
          also receive a confirmation email with your receipt. If a course is
          not visible within one hour of a successful payment, email us with
          your order number and we will fix it.
        </p>
        <p>
          Payments made by bank transfer are confirmed manually and may take up
          to 2 business days to reflect.
        </p>
      </section>
      <section id="account-deletion">
        <h2>
          <span>03</span>Account Deletion
        </h2>
        <p>
          You can delete your account and personal data at any time from
          Settings → Account in the app or on the learning platform, or by
          following the steps on our{" "}
          <Link to="/delete-account">account deletion page</Link>. Deleting your
          account ends access to all courses, including paid ones, and does not
          by itself trigger a refund.
        </p>
      </section>
      <section id="contact-us">
        <h2>
          <span>04</span>Contact Us
        </h2>
        <p>
          For support, purchase questions, refunds, or anything else, email{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a>. Our
          postal address and Grievance Officer details are on the{" "}
          <Link to="/contact">Contact page</Link>.
        </p>
      </section>
    </>
  ),
};
