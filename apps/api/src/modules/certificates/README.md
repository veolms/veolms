# Course certificates

A learner who finishes a course's share of lessons unlocks its certificate,
confirms the name to print, and claims it. Anyone can check a certificate at
`/certificate/<code>`; the QR code on every PDF opens that page.

## Rules

- **Unlock.** A course gives certificates when `course_settings.certificate_enabled`
  is on. A learner unlocks one at `course_certificate_settings.threshold_percent`
  (90 by default, 50–100) of the published lessons finished. A lesson counts
  at 99.5% or more; a quiz lesson counts once its quiz is passed.
  - The course needs at least 3 published lessons.
  - The learner must take the whole course: a live grant to all of it, or a
    published free course open to everyone. A link that opens only some
    sections does not count.
  - The first time a learner is seen at the threshold is kept in
    `certificate_unlocks`. Lessons added later, or a lesson reset when a
    video is attached, cannot take an unclaimed certificate away.
- **Claim.** The learner types the name to print, in English letters
  (accents allowed). The certificate's script font has no other alphabet,
  and a printed name must never show empty boxes.
  - A claim is issued once. An advisory lock, plus a partial unique index on
    `(user_id, course_id) where status = 'active'`, gives double clicks, two
    tabs and both API servers the same certificate.
  - `certificate.generated` goes out through the outbox in the same
    transaction.
- **Snapshot.** What is printed and shown is copied into the row when the
  certificate is claimed. Later course renames, a lower progress, or a new
  display name do not change it. The row stores:
  - the name, course title and academy name;
  - the site address, the template and its version;
  - the issue date in Asia/Kolkata.
- **Name corrections.** The owner may correct the name twice. The code stays
  the same (links and QR codes keep working); `revision` goes up.
- **Revoke and restore** (`certificate.revoke`).
  - The public page then says "revoked" and when, never why.
  - The owner can no longer download it.
  - Restore puts it back unless the learner holds another active
    certificate for the course.
- **Course purge and account deletion.**
  - `course_id` and `user_id` are set null; the certificate stays.
  - A certificate without its learner no longer shows the name publicly.
- **Codes.** 16 Crockford base32 characters (80 random bits). Typed or
  followed codes are read in any case, with or without dashes, with O read
  as 0 and I/L as 1. Unknown and malformed codes get the same 404.

## PDF

- `render/certificate-pdf.ts` draws the whole A4-landscape page in vector with
  pdfkit, from `templates/procodrr-classic/`. That folder holds the fonts
  (SIL OFL, licences beside them), the marble background, the signature and
  the logo.
- Nothing is stored. Each download draws the page again from the snapshot,
  in one background thread per API process (`render/certificate-render-pool.ts`):
  - about 90 ms of CPU per page;
  - at most 20 waiting before a 503;
  - a 15 s timeout;
  - the thread stops after 5 idle minutes.
- The same snapshot gives the same file (`CreationDate` is the issue time),
  and the ETag is code, revision and template version.
- Bump `CERTIFICATE_TEMPLATE.version` for any change that would alter
  certificates already issued. Keep old template folders while certificates
  use them.

## Link previews

`apps/web/cloudflare/certificate-meta.js`, in the website Worker, writes a
certificate's title and description into the app shell for
`/certificate/<code>`. LinkedIn, WhatsApp and X then show who completed which
course. It needs the Worker's `LINKS_API_URL`.

## Settings

- `CERTIFICATE_LINKEDIN_ORGANIZATION_ID` (optional): the academy's LinkedIn
  company page id. "Add to LinkedIn profile" then links the entry to the page.

## Tests

- `certificates.test.ts`: codes, names, the date, the PDF.
- `apps/api/test/flows/27-certificates.flow.test.ts`: unlock, claim, PDF,
  public check, corrections, staff, threshold.
