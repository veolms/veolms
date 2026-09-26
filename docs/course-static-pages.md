# Public course pages on Cloudflare

The public course catalogue (`/catalogue`) and each course overview
(`/catalogue/:courseSlug/overview`) are generated as static HTML and matching
React Router `.data` files. Learner pages stay on the existing client rendered
app.

## Deployment flow

- A frontend code deployment runs the normal web build once, renders all
  published course pages, saves the full build as a GitHub Actions artifact,
  and deploys it with Wrangler.
- When an admin saves a published course, the API saves the database change
  first and queues a GitHub Actions workflow for that course. The workflow
  restores the latest successful web artifact, regenerates `/catalogue` and the
  affected overview, then deploys the updated static assets with Wrangler.
- Edits made while a course deploy is running are coalesced into a follow-up
  deploy. GitHub Actions serializes all Cloudflare static deploys so two
  workflow runs cannot publish the same asset bundle at once.
- The course editor shows queued, publishing, complete, or failed status. A
  failed publish can be retried without changing the saved course data.

## Required configuration

Create a GitHub Actions environment named `development` with:

- Variable `VEO_PUBLIC_API_BASE_URL`, for example
  `https://api.example.com/api/v1`.
- Variable `CLOUDFLARE_ACCOUNT_ID`.
- Secret `CLOUDFLARE_API_TOKEN` with permission to deploy Workers and static
  assets for the configured Cloudflare account.

Configure the API runtime with:

- `COURSE_STATIC_REFRESH_GITHUB_TOKEN`: a GitHub token that can dispatch
  workflows and read workflow runs (`Actions: write` and `Actions: read`).
- `COURSE_STATIC_REFRESH_REPOSITORY`: repository in `owner/repo` format.
- `COURSE_STATIC_REFRESH_REF`: deployment branch; defaults to `development`.
- `COURSE_STATIC_REFRESH_WORKFLOW`: defaults to
  `refresh-cloudflare-course-pages.yml`.

The initial Cloudflare deployment must complete successfully before the API
can run a targeted refresh, because that refresh starts from the saved web build
artifact. A missing token, workflow, or build artifact appears as a failed
refresh in the editor; it does not roll back the database save.
