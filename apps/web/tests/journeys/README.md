# Browser tests

Real Chrome, using the real web app against the real API, the way a learner
or an administrator does: signing in with the emailed code, opening lessons,
watching the video, paying, and checking what is saved.

| File                           | What it covers                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `01-sign-in.spec.ts`           | Sign-up and sign-in by code, wrong and replaced codes, signing out                                                        |
| `02-watching-lessons.spec.ts`  | Who can watch which lesson: preview, locked, bought, given, taken away, drafts; opening one from the home page on a phone |
| `03-buying-a-course.spec.ts`   | Paying, cancelling the payment, free courses, invitation-only courses                                                     |
| `04-learning-progress.spec.ts` | Completed lessons, course progress, resuming on another device                                                            |
| `05-staff-area.spec.ts`        | The staff pages: closed to learners and visitors, open to the administrator                                               |

## Running them

Docker's Postgres must be running, and Google Chrome installed (it is on
GitHub's runners):

```bash
docker compose up -d postgres
pnpm test:browser
```

Playwright starts everything itself and stops it afterwards:

- the test server (`apps/api/test/journeys/server.ts`): the API on port
  4100 with its own database, `veolms_e2e_test`, rebuilt from the migrations
  on every start; a stand-in CDN on 4190; test helpers on 4191;
- the web app in dev mode on port 43917, calling that API.

Your own `pnpm dev`, its database and your `.env` are not touched. A run
takes about 7 minutes on a laptop; most of it is the dev server building
pages and the videos actually playing.

Useful variations:

```bash
pnpm test:browser 02-watching-lessons            # one file
pnpm test:browser -g "buys a paid course"        # tests whose name matches
pnpm --filter @veolms/web test:browser:watch        # watch it happen in Chrome
pnpm test:browser --trace on                     # record every step, then:
pnpm --filter @veolms/web test:browser:report       # open the recording
```

A failed test keeps a screenshot in `apps/web/test-results/`.

## What is real and what is replaced

Real: the web app, the API, the database, sessions and cookies, the sign-in
codes (random, checked by the API), the access rules, the order and its
payment check, the video player and its playback token, progress saving.

Replaced, because it lives outside VeoLMS:

- **Email**: the test server catches it, and the test reads the code from
  it (`academy.emailedCode`), as the learner would from their inbox.
- **Razorpay**: its checkout script is replaced by a small payment window
  with "Pay" and "Cancel" (`support/fake-razorpay-checkout.js`). "Pay"
  makes the payment on a fake gateway that signs it with the gateway's
  secret, so the API's signature check is the real one.
- **The CDN**: a local server serves the same 12-second video for every
  lesson (`apps/api/test/journeys/video/`, the same shape as real lessons:
  HLS, `init.mp4`, `.m4s` segments). Like the real CDN it refuses a segment
  without the playback token.
- **Course setup**: courses are written straight to the database, as the
  course editor leaves them, with their videos already transcoded
  (`academy.createCourse`). Learners who are "already signed up" are made
  through the API (`academy.signedInLearner`); signing up itself is tested
  through the screens in `01-sign-in.spec.ts`.

Each test gets its own visitor address (the API limits sign-in codes to 5 a
minute per address) and its own learners and courses, so tests never depend
on each other.

## Writing a test

- Name it as a sentence about what the person sees or can do.
- Find things the way a person does: by role and name
  (`getByRole("button", { name: "Pay Now" })`), label or visible text. Never
  by CSS class.
- Test journeys, not looks: no screenshots, layout, colours or preferences.
- Use the helpers in `support/test.ts`: `academy` to set the stage,
  `openLesson`, `expectVideoToPlay`, `expectNoVideo`, `lessonInList`,
  `waitForProgressSave`.
- When you fix a bug, add the test that would have caught it, watch it fail
  without the fix, then pass with it.

## Known gaps

`04-learning-progress.spec.ts` has one test marked `test.fixme`: progress
saved when the learner leaves a lesson by reloading or typing an address
never reaches the API (see the comment above it). Remove `.fixme` once that
is fixed.
