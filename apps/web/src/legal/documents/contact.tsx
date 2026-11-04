import type { LegalDocument } from "../legalDocument";

export const contactDocument: LegalDocument = {
  path: "/contact",
  title: "Contact ProCodrr",
  description:
    "Contact ProCodrr for course support, purchase questions, privacy requests, or postal correspondence.",
  heading: "Contact ProCodrr",
  intro: (
    <>
      <p>
        Contact us about courses, your learner account, purchases, or privacy
        requests.
      </p>
    </>
  ),
  sections: [
    { id: "email", title: "Email" },
    { id: "postal-address", title: "Postal address" },
    { id: "grievance-officer", title: "Grievance Officer" },
  ],
  body: (
    <>
      <section id="email">
        <h2>
          <span>01</span>Email
        </h2>
        <p>
          For support or general questions, email{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a>. For
          account or privacy requests, include the email address associated with
          your ProCodrr account.
        </p>
      </section>
      <section id="postal-address">
        <h2>
          <span>02</span>Postal address
        </h2>
        <address>
          ProCodrr Labs LLP
          <br />
          No. 235, 2nd Floor, Binnamangala, 13th Cross Road,
          <br />
          Indiranagar 2nd Stage, Hoysala Nagar,
          <br />
          Bengaluru, Karnataka 560038, India
        </address>
      </section>
      <section id="grievance-officer">
        <h2>
          <span>03</span>Grievance Officer
        </h2>
        <p>
          Anurag Singh, ProCodrr Labs LLP, is our Grievance Officer under the
          Information Technology Act, 2000 and the Digital Personal Data
          Protection Act, 2023. Write to{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a> with
          “Grievance” in the subject line. We acknowledge grievances within 48
          hours and aim to resolve them within 30 days.
        </p>
      </section>
    </>
  ),
};
