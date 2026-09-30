# Public course static pages

The public course catalogue (`/explore-courses`) and each course overview
(`/explore-courses/:courseSlug`) are generated as static HTML and matching
React Router `.data` files. Authenticated authoring and learner routes remain
inside the academy application.

## Content update flow

1. A successful course-related API mutation commits to the database.
2. The API queues a GitHub Actions refresh for the course. Repeated saves for
   one course are coalesced while a refresh is running, and the API serializes
   Cloudflare deployments.
3. The workflow downloads the latest successful frontend build artifact. It
   runs `refresh:course-pages`, which renders `/explore-courses` and the affected course
   overview, then writes each HTML/`.data` pair into the artifact.
4. Wrangler deploys that artifact to Cloudflare. Content-only refreshes do not
   run Vite or the frontend build.
5. The course editor polls refresh status and offers a retry when a deployment
   fails. The database save is already complete and is not rolled back.

## GitHub configuration

Create or use the `development` GitHub Actions environment and configure:

- Variable `CLOUDFLARE_ACCOUNT_ID`.
- Variable `VEO_PUBLIC_API_BASE_URL` or `VITE_API_BASE_URL`, pointing to the
  public API base and including `/v1`.
- Secret `CLOUDFLARE_API_TOKEN` with permission to deploy the configured
  Cloudflare Worker and static assets.

The first `Deploy Cloudflare static web` workflow run must succeed. It creates
the artifact used by content-only refreshes.

The existing `Deploy development UI` workflow still deploys to AWS S3. The new
Cloudflare workflows are separate; configure the Cloudflare Worker/domain to
serve the host where these public routes should appear.

Configure the API runtime with:

- `COURSE_STATIC_REFRESH_GITHUB_TOKEN`: a GitHub token with Actions read/write
  permission for the repository.
- `COURSE_STATIC_REFRESH_REPOSITORY`: repository in `owner/repo` format.
- `COURSE_STATIC_REFRESH_REF`: workflow branch; defaults to `development`.
- `COURSE_STATIC_REFRESH_WORKFLOW`: workflow filename; defaults to
  `refresh-cloudflare-course-pages.yml`.

The refresh queue and status are in API-process memory. They survive ordinary
request failures but are lost on API restart and are not shared between API
replicas. GitHub workflow concurrency still prevents overlapping Cloudflare
deployments.
