# Course certificates

A learner who finishes a course's share of lessons gets its certificate, in
their profile name: issued and emailed automatically, or claimed by them
when the academy turns that off. Staff can also issue one by hand. Anyone can check a certificate at
`/certificate/<code>`; the QR code on every PDF opens that page.

## Rules

- **Unlock.** A course gives certificates when `course_settings.certificate_enabled`
  is on. A learner unlocks one at the course's share of the published
  lessons finished: `course_certificate_settings.threshold_percent` when the
  course sets its own, else the academy's
  (`certificate_academy_settings.threshold_percent`, 95 by default, 50–100). A lesson counts
  at 99.5% or more; a quiz lesson counts once its quiz is passed.
  - The course needs at least 3 published lessons.
  - The learner must take the whole course: a live grant to all of it, or a
    published free course open to everyone. A link that opens only some
    sections does not count.
  - The first time a learner is seen at the threshold is kept in
    `certificate_unlocks`. Lessons added later, or a lesson reset when a
    video is attached, cannot take an unclaimed certificate away.
- **Issue.** The name printed is the learner's profile name, never typed
  in. It must be in English letters (accents allowed): the script font has
  no other alphabet, and a printed name must never show empty boxes.
  - **Automatically** (`certificate_academy_settings.auto_issue`, on by
    default): a lesson saved at 99.5% or more publishes
    `learning.lesson_completed`; the notification worker then issues the
    certificate if the learner reached the share. Opening the course does the
    same, as a backstop.
  - **Claimed** by the learner from the course page when automatic issue is
    off.
  - **By hand** (`POST /certificates/admin/courses/:id/issue`, staff with
    `certificate.issue`): to any enrolled learner, whatever their progress.
    `issued_by` records who.
  - A claim is issued once. An advisory lock, plus a partial unique index on
    `(user_id, course_id) where status = 'active'`, gives double clicks, two
    tabs and both API servers the same certificate.
  - `certificate.generated` goes out through the outbox in the same
    transaction. Its email carries the PDF, drawn when the email is sent.
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

- The built-in design (`render/builtin-design.ts`, template version 2, 26 Nov 2026) is ProCodrr's finalised navy certificate. Its page is the owner's
  design picture (`templates/procodrr-classic/assets/navy-sheet.jpg`, with
  its sample name, course, course note, footer and soft signature removed).
  pdfkit prints on it:
  - the name (DM Serif Display), the course (Montserrat) and the line under
    it (the course's own, else from its length);
  - Anurag Singh's signature (`signature-anurag.png`, white, 1812 px wide);
  - the footer: "ISSUED ON" and the date, a divider, the QR code (opens the
    certificate's page), "Verify Certificate", `<site>/verify` and
    "CERTIFICATE ID: …" on the signature title's line.
    Ligatures are off so the PDF's text reads correctly when searched or
    copied.
- `/verify` (web, public) is where the printed ID is typed; it opens
  `/certificate/<code>`.
- Uploaded designs are drawn by `render/certificate-pdf.ts` from their
  layout. Fonts live in `templates/procodrr-classic/fonts/` (SIL OFL,
  licences beside them).
- Nothing is stored. Each download draws the page again from the snapshot,
  in one background thread per API process (`render/certificate-render-pool.ts`):
  - about 90 ms of CPU per page;
  - at most 20 waiting before a 503;
  - a 15 s timeout;
  - the thread stops after 5 idle minutes.
- The download ETag is code, revision and the design version (for the
  built-in design, the template version), so a new design is drawn again.
- Bump `CERTIFICATE_TEMPLATE.version` for any change that alters the
  built-in design.

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
- `28-certificate-designs.flow.test.ts`: designs.
- `29-certificate-automation.flow.test.ts`: the 95% default, automatic
  issue with the emailed PDF, issue by hand, the signature.

## Academy settings (Platform > Certificates)

- `GET/PUT /certificates/settings` (`certificate.issue`): the share
  courses ask for unless they set their own, and automatic issue.
- **Signature:** a PNG or JPEG (at least 300 px wide, 2 MB at most) uploaded
  to `protected/certificate-signatures/`. It is printed where each design's
  `layout.signature` says; on the built-in design it replaces the template's
  signature. Read once per process and cached; a signature that cannot be
  read is left off rather than failing the certificate.

## Designs (Platform > Certificates)

- **Who:** staff with `certificate.issue` (administrators and instructors)
  upload blank certificate sheets: a PDF, or a PNG/JPEG at least 1600 px on
  its long side, up to 15 MB.
- **Upload:** the browser uploads straight to storage
  (`protected/certificate-designs/<id>.<ext>`). `POST /certificates/designs`
  then checks the file before saving it:
  - its own bytes match its type;
  - a PDF is readable, not password-protected and not rotated (its first
    page is used);
  - a sample certificate is drawn on it.
    A file that fails is deleted.
- **Layout:** each design has its own `layout`. It sets where the name,
  course line, date, code, verify text and QR code go, as fractions of the
  page, with font, size, colour and alignment (`certificate-design.ts` in
  contracts).
- **One finalised design.** An advisory lock and a partial unique index keep
  exactly one active. Every download is drawn on the design finalised at
  that moment; with none finalised, on the built-in design.
  `certificates.design_id` records the design active at issue.
- **Drawing:**
  - Uploaded PDFs keep their vector page. The details are drawn with
    pdfkit and laid over it with pdf-lib's page embedding (no pdf-lib text
    layout).
  - Uploaded images are drawn full-page under the details.
- **Reliability:**
  - a sheet is read once per process and cached, with one retry;
  - a design whose file cannot be read is never finalised;
  - the finalised design cannot be deleted;
  - the download ETag includes the design and its version.
- **Storage:** only the uploaded sheet is stored, never a generated PDF.
