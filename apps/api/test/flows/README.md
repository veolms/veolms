# Flow tests

End-to-end checks of what learners do, through the real API: sign in, join or
buy a course, watch its lessons, save progress, and what only staff may do.
Each test signs people up, makes courses and calls the API exactly as the web
app does; nothing is mocked inside the API.

| File                                | What it covers                                                        |
| ----------------------------------- | --------------------------------------------------------------------- |
| `01-sign-in.flow.test.ts`           | Emailed codes, wrong/used/expired codes, sign-out, the device limit   |
| `02-course-access.flow.test.ts`     | Which lessons play for whom: previews, free, paid, grants, archived   |
| `03-buying-a-course.flow.test.ts`   | Checkout, payment confirmation, webhooks, forged or repeated payments |
| `04-learning-progress.flow.test.ts` | Completion, course progress, resume on another device                 |
| `05-staff-only.flow.test.ts`        | The admin area refuses learners and visitors                          |

## Running them

They need the local Postgres (the one in `compose.yaml`) to be running:

```bash
docker compose up -d postgres
pnpm test:flows
```

Each run drops and rebuilds its own database, `veolms_flow_test`, so it
starts from the same state every time and never touches your development
database. To use another server, set `FLOW_TEST_DATABASE_URL` (its database
name must contain "test").

One file, or one test by name:

```bash
node apps/api/test/flows/setup/prepare-database.ts
node --test apps/api/test/flows/02-course-access.flow.test.ts
node --test --test-name-pattern="archived" apps/api/test/flows/02-course-access.flow.test.ts
```

## What is replaced

Only what lies outside the API:

- **Email**: captured, so a test reads the sign-in code the learner would get.
- **Payment gateway**: a fake Razorpay (`setup/fake-payment-gateway.ts`). Its
  signatures are real HMACs, so forged ones are refused as Razorpay's would be.
- **Video storage**: lessons are written with videos already transcoded
  (`setup/flow-courses.ts`). The API builds the video's CDN link and token
  without fetching anything, and storage points at an address that answers
  nothing, so a test that reached it would fail.

The same setup (this folder's `setup/`) also runs the API for the browser
tests in `apps/web/tests/journeys/`, on a database of their own
(`veolms_e2e_test`); `setup/flow-database.ts` rebuilds either one.

## Adding a test

When you fix a bug, add the test that would have caught it to the file for
its feature: write it first, watch it fail, then fix the bug. Name it as a
sentence about what a learner sees, like the others.
