import { Link } from "react-router";
import type { LegalDocument } from "../legalDocument";

export const policiesDocument: LegalDocument = {
  path: "/policies",
  title: "Refund, Cancellation, Delivery & Contact Policies | ProCodrr",
  description:
    "Refund, cancellation, digital delivery, and contact policies for ProCodrr courses bought on procodrr.com and used on the ProCodrr learning platform and Android app.",
  heading: "Refund, Cancellation, Delivery & Contact Policies",
  effective: "Effective date: November 27, 2026",
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
    { id: "refund-policy", title: "Refund Policy" },
    { id: "cancellation-policy", title: "Cancellation Policy" },
    { id: "delivery-policy", title: "Delivery Policy" },
    { id: "account-deletion", title: "Account Deletion" },
    { id: "contact-us", title: "Contact Us" },
  ],
  body: (
    <>
      {/* The section's old id, so links to #refund-and-cancellation-policy
          still land on the Refund Policy. */}
      <span
        id="refund-and-cancellation-policy"
        aria-hidden="true"
        className="block scroll-mt-6"
      />
      <section id="refund-policy">
        <h2>
          <span>01</span>Refund Policy
        </h2>
        <p>
          You can get a refund yourself from <strong>Purchase History</strong>:
          open the menu next to the course and choose{" "}
          <strong>Request refund</strong>. An eligible refund is processed
          automatically, with no need to contact us. A purchase paid by bank or
          UPI transfer, and a refund our payment provider cannot complete, stay
          as a pending request for our team to process. We process pending
          requests within 7 business days.
        </p>
        <p>
          A purchase is eligible when both of these are true: it was made within
          the last <strong>30 days</strong>, and you have watched no more than{" "}
          <strong>10% of the course or 10 hours of it</strong>, whichever is
          less. For example, you can watch up to 5 hours of a 50-hour course,
          and up to 10 hours of a 200-hour course.
        </p>
        <p>
          A <strong>quiz pass</strong> is eligible when it was bought within the
          last <strong>30 days</strong> and you have attempted no more than{" "}
          <strong>10% of its quizzes</strong>. For example, you can try 1 quiz
          of a pass with 10 quizzes.
        </p>
        <p>
          If you bought part of a course and then upgraded to the whole course,
          the part’s price was taken off the upgrade, so that part cannot be
          refunded on its own.
        </p>
        <p>
          If <strong>Request refund</strong> is greyed out, the purchase is not
          eligible for a refund, and the menu shows why. Emailing us will not
          change that.
        </p>
        <p>
          A refund covers the whole purchase. It is returned to your original
          payment method through the payment provider you paid with, or by bank
          transfer if that is how you paid, and normally appears within 5 to 10
          business days, depending on your bank. Your access to every course in
          the refunded purchase ends when the refund is issued.
        </p>
        <p>
          Refunds are not available after 30 days, where more than 10% of the
          course or 10 hours of it has been watched, where more than 10% of a
          quiz pass’s quizzes have been attempted, for part of a course whose
          price was counted towards an upgrade to the whole course, for
          purchases made with a promotional or bundle discount where the offer
          terms say so, or where an account has been terminated for breaching
          our Terms of Service. Nothing here limits your rights under the
          Consumer Protection Act, 2019.
        </p>
        <p>
          <strong>Android app:</strong> courses cannot be bought inside the
          ProCodrr Android app and we do not use Google Play billing, so Google
          Play’s refund process does not apply. Refunds are requested from
          Purchase History as described above.
        </p>
        <p>
          To cancel an order or a purchase, see the{" "}
          <a href="#cancellation-policy">Cancellation Policy</a> below.
        </p>
      </section>
      <section id="cancellation-policy">
        <h2>
          <span>02</span>Cancellation Policy
        </h2>
        <p>
          All courses and quiz passes on ProCodrr are bought with a one-time
          payment. We do not sell subscriptions and nothing renews
          automatically, so there is no recurring charge to cancel.
        </p>
        <p>
          <strong>Cancelling before payment is confirmed.</strong> You can
          cancel an order at any time before paying by not completing the
          payment. If you paid by bank or UPI transfer and we have not yet
          confirmed it, email{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a> with
          your order number and we will cancel the order and return the full
          amount.
        </p>
        <p>
          <strong>Cancelling after purchase.</strong> Courses are delivered to
          your account as soon as payment is confirmed, so a completed purchase
          is cancelled by requesting a refund from{" "}
          <strong>Purchase History</strong>. The eligibility rules in the Refund
          Policy above apply. A purchase that is not eligible for a refund
          cannot be cancelled.
        </p>
        <p>
          <strong>Cancellation by ProCodrr.</strong> We may cancel an order if
          the payment fails or is duplicated, if the price shown was an error,
          or if we suspect fraud or misuse. If you were charged, we refund the
          full amount to your original payment method, normally within 5 to 10
          business days.
        </p>
        <p>
          <strong>Failed payments.</strong> If money is debited but the course
          is not added to your account, your bank or payment provider normally
          reverses it automatically. If it has not come back within 7 business
          days, email us with your order number.
        </p>
      </section>
      <section id="delivery-policy">
        <h2>
          <span>03</span>Delivery Policy
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
          <span>04</span>Account Deletion
        </h2>
        <p>
          You can ask us to delete your account and personal data at any time by
          email, following the steps on our{" "}
          <Link to="/delete-account">account deletion page</Link>. Deleting your
          account ends access to all courses, including paid ones, and does not
          by itself trigger a refund.
        </p>
      </section>
      <section id="contact-us">
        <h2>
          <span>05</span>Contact Us
        </h2>
        <p>
          For support, purchase questions, or anything else, email{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a>. Our
          postal address and Grievance Officer details are on the{" "}
          <Link to="/contact">Contact page</Link>.
        </p>
      </section>
    </>
  ),
};
