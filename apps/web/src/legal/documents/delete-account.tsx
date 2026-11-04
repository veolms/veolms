import { Link } from "react-router";
import type { LegalDocument } from "../legalDocument";

export const deleteAccountDocument: LegalDocument = {
  path: "/delete-account",
  title: "Delete Your ProCodrr Account",
  description:
    "How to delete your ProCodrr account and personal data from the Android app, the learning platform, or by email, and what is deleted or kept.",
  heading: "Delete your ProCodrr account",
  intro: (
    <>
      <p>
        You can delete your account and the personal data linked to it at any
        time. This page explains how, what is deleted, and what we keep.
      </p>
    </>
  ),
  sections: [
    {
      id: "option-1-delete-from-the-app-or-the-learning-platform",
      title: "Option 1: Delete from the app or the learning platform",
    },
    {
      id: "option-2-request-deletion-by-email",
      title: "Option 2: Request deletion by email",
    },
    { id: "what-is-deleted", title: "What is deleted" },
    {
      id: "what-is-kept-and-for-how-long",
      title: "What is kept, and for how long",
    },
    { id: "questions", title: "Questions" },
  ],
  body: (
    <>
      <section id="option-1-delete-from-the-app-or-the-learning-platform">
        <h2>
          <span>01</span>Option 1: Delete from the app or the learning platform
        </h2>
        <ol>
          <li>
            Sign in to the ProCodrr Android app or to the learning platform at{" "}
            <a href="https://procodrr.com">procodrr.com</a>.
          </li>
          <li>
            Open <strong>Settings</strong>, then the <strong>Account</strong>{" "}
            tab.
          </li>
          <li>
            Under <strong>Delete account</strong>, press{" "}
            <strong>Delete account</strong>.
          </li>
          <li>Type the confirmation word shown in the dialog and confirm.</li>
        </ol>
        <p>
          You are signed out of every device immediately and your account can no
          longer be used. We send a confirmation email to the address on the
          account.
        </p>
      </section>
      <section id="option-2-request-deletion-by-email">
        <h2>
          <span>02</span>Option 2: Request deletion by email
        </h2>
        <p>
          If you cannot sign in or no longer have the app installed, email{" "}
          <a href="mailto:contact@procodrr.com?subject=Delete%20my%20account">
            contact@procodrr.com
          </a>{" "}
          with the subject line <strong>“Delete my account”</strong>. Send the
          email from the address registered on your ProCodrr account so we can
          verify it is you. If you signed up with a different address or with
          Google, tell us the email shown in your profile. We confirm the
          request within 48 hours and complete the deletion within 30 days.
        </p>
      </section>
      <section id="what-is-deleted">
        <h2>
          <span>03</span>What is deleted
        </h2>
        <p>Within 30 days of your request we permanently delete:</p>
        <ul>
          <li>
            your name, email address, mobile number, username, and profile
            photo;
          </li>
          <li>
            your sign-in sessions, including IP addresses and device
            descriptions, and any passkeys or authenticator settings;
          </li>
          <li>
            your enrolments, learning progress, quiz results, wishlist, notes,
            and settings;
          </li>
          <li>your notification history and push notification tokens;</li>
          <li>
            any lesson files downloaded to your devices, the next time the app
            runs.
          </li>
        </ul>
        <p>
          Your access to all courses ends, including courses you paid for, and
          cannot be restored. Deleting your account does not by itself trigger a
          refund; see our <Link to="/policies">Refund Policy</Link>. Deleted
          data disappears from our backups within a further 30 days.
        </p>
      </section>
      <section id="what-is-kept-and-for-how-long">
        <h2>
          <span>04</span>What is kept, and for how long
        </h2>
        <ul>
          <li>
            <strong>Order, invoice, and payment records</strong> are kept for up
            to 8 years because Indian tax and accounting laws require it. They
            are detached from your account and are not used for any other
            purpose.
          </li>
          <li>
            <strong>Posts you made in course discussions</strong> stay in the
            discussion so that other learners’ threads still make sense, but
            they are anonymised: your name, photo, and account link are removed
            and the author shows as “Deleted user”. If you want specific posts
            removed as well, say so in your email and we will remove them where
            we can.
          </li>
          <li>
            <strong>Records of fraud or abuse investigations</strong>, if any,
            are kept as long as needed to protect the Services and other
            learners.
          </li>
        </ul>
      </section>
      <section id="questions">
        <h2>
          <span>05</span>Questions
        </h2>
        <p>
          Our <Link to="/privacy">Privacy Policy</Link> describes all of our
          data practices. For anything about deletion or your data, contact our
          Grievance Officer, Anurag Singh, at{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a>.
        </p>
      </section>
    </>
  ),
};
