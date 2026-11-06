import { Link } from "react-router";
import type { LegalDocument } from "../legalDocument";

export const deleteAccountDocument: LegalDocument = {
  path: "/delete-account",
  title: "Delete Your ProCodrr Account",
  description:
    "How to request deletion of your ProCodrr account and personal data by email, what is deleted, and what is kept.",
  heading: "Delete your ProCodrr account",
  intro: (
    <>
      <p>
        You can ask us to delete your ProCodrr account and the personal data
        linked to it at any time. This applies to the ProCodrr website, the
        learning platform at <a href="https://procodrr.com">procodrr.com</a>,
        and the ProCodrr mobile apps, which all use the same account. This page
        explains how to make the request, what is deleted, and what we keep.
      </p>
    </>
  ),
  sections: [
    { id: "how-to-request-deletion", title: "How to request deletion" },
    { id: "what-happens-next", title: "What happens next" },
    { id: "what-is-deleted", title: "What is deleted" },
    { id: "public-comments", title: "Your public comments" },
    {
      id: "what-is-kept-and-for-how-long",
      title: "What is kept, and for how long",
    },
    { id: "questions", title: "Questions" },
  ],
  body: (
    <>
      <section id="how-to-request-deletion">
        <h2>
          <span>01</span>How to request deletion
        </h2>
        <p>Account deletion is handled by email. To delete your account:</p>
        <ol>
          <li>
            Email{" "}
            <a href="mailto:contact@procodrr.com?subject=Delete%20my%20account">
              contact@procodrr.com
            </a>{" "}
            with the subject line <strong>“Delete my account”</strong>.
          </li>
          <li>
            Send it from the email address registered on your ProCodrr account,
            so we can confirm the request is yours. If you signed up with a
            phone number or with Google, tell us the email or phone number shown
            in your profile.
          </li>
        </ol>
        <p>
          You do not need to sign in, and you do not need the app installed, to
          make a request.
        </p>
      </section>
      <section id="what-happens-next">
        <h2>
          <span>02</span>What happens next
        </h2>
        <p>
          We reply within 48 hours to confirm your request, and may ask you to
          confirm it once more if the email did not come from the address on the
          account. We then delete your account within 30 days. Once it is
          deleted you are signed out of every device, the account can no longer
          be used, and it cannot be restored.
        </p>
      </section>
      <section id="what-is-deleted">
        <h2>
          <span>03</span>What is deleted
        </h2>
        <p>
          We permanently delete all of the private data linked to your account,
          including:
        </p>
        <ul>
          <li>
            your name, username, email address, mobile number, and profile
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
          Your access to all courses ends, including courses you paid for.
          Deleting your account does not by itself trigger a refund; see our{" "}
          <Link to="/policies">Refund Policy</Link>. Deleted data is removed
          from our backups within a further 30 days.
        </p>
      </section>
      <section id="public-comments">
        <h2>
          <span>04</span>Your public comments
        </h2>
        <p>
          Comments and replies you posted publicly, such as in course
          discussions, are not deleted, because other learners and creators have
          replied to them. Your name, username, profile photo, and link to your
          account are removed from them, and they are shown as posted by a{" "}
          <strong>“Deleted user”</strong>.
        </p>
      </section>
      <section id="what-is-kept-and-for-how-long">
        <h2>
          <span>05</span>What is kept, and for how long
        </h2>
        <ul>
          <li>
            <strong>Order, invoice, and payment records</strong> are kept for up
            to 8 years because Indian tax and accounting laws require it. They
            are detached from your account and are not used for any other
            purpose.
          </li>
          <li>
            <strong>Public comments</strong>, without your name or profile, as
            described above, for as long as the course exists.
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
          <span>06</span>Questions
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
