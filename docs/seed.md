# Local academy seed

The seed creates synthetic data for local development. It includes the playlist paths for the Git and GitHub lectures; no database dump is required.

From the repository root, after configuring `.env` and starting PostgreSQL:

```bash
pnpm db:migrate
pnpm db:seed
```

The seed only runs with `NODE_ENV=development` and a local PostgreSQL connection. Use a fresh local database: it refuses to initialize an existing academy. It does not reset your database. Re-running the seed adds missing records without overwriting existing demo content; increasing the counts below adds more data. Decreasing counts does not remove existing records.

By default, it creates:

- An academy with `admin@veolms.org` as its administrator and 50 synthetic students (`student1@demo.veolms.test` through `student50@demo.veolms.test`).
- Ten courses (free and paid tiers) with demo thumbnail images. The first has 20 sections, the second has 5, the tenth has 500, and the others have between 8 and 14.
- Two video lessons per section, each with a synthetic comment and question and an administrator reply. Video playlists are assigned across the lessons from the Git and GitHub course.
- Sample student orders, payments, invoices, enrollments, access grants, and generated profile pictures for the demo students.

Thumbnails load from the configured CDN and student profile pictures load from DiceBear, so those images require network access. The demo thumbnail paths must be available on the configured CDN. On repeat runs, the seed fills missing images on its own demo records and leaves existing choices unchanged.

VeoLMS uses email sign-in codes. In the default local configuration, find the code in the API console. The seed does not create passwords.

## Configure the amount of data

Pass options to the seed command. Counts are total target counts, not increments; for example, run with `--students 75` to add students up to 75.

```bash
pnpm db:seed -- --courses 12 --students 75 --lessons 3 --comments 2 --questions 2 --orders 20
pnpm db:seed -- --help
```

`--lessons` sets lessons per section; `--comments` and `--questions` set the number per lesson; `--orders` sets the number of student orders. The special section counts remain attached to courses 1, 2, and 10. More courses receive additional synthetic sections. Values for courses, students, and lessons must be positive; comment, question, and order counts may be zero.

## Video playback

The seed includes storage paths, not the video files or access credentials. Point `CDN_URL` and `VITE_CDN_URL` at the CDN serving those paths. The Git and GitHub master and variant playlists are public, but their media segments require a valid token. Playback requires the CDN's matching signing secret in `CDN_SIGNING_SECRET` and a configuration that treats the relevant `transcoded` prefix as protected. Do not commit the secret or paste it into an issue. If the CDN, signing key, or access to its media is unavailable, seeded video playback will not work.
