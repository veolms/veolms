# Public course static pages

The public catalogue (`/courses`), each course page
(`/courses/:courseSlug/overview`) and every lesson page
(`/learn/:courseSlug/lecture-N`) are prerendered as static HTML and matching
React Router `.data` files, as is the home page. Authenticated authoring and
learner screens remain inside the academy application.

A full build renders every page of every course (over a thousand), and every
page names the build's hashed scripts and styles: a change to the web app's
code needs a full build. A change to a course's content needs only that
course's pages rendered again.

## Content update flow

1. A successful course-related API mutation commits to the database
   (`detectSiteContentChange` in `packages/api-core`).
2. The API queues a refresh for the course
   (`packages/services/src/course-static-pages`). A course is refreshed once
   it has been left unchanged for 20 seconds (at most 2 minutes while it keeps
   being edited), and every course waiting by then goes in one GitHub Actions
   run. One run at a time; a run GitHub cancels is started again.
3. The workflow restores the build the site was last deployed from and runs
   `apps/web/scripts/refresh-course-static-pages.mjs` with
   `COURSE_STATIC_COURSE_IDS`. It renders the courses' pages, `/learn/<course>`
   and every lesson page, the catalogue and the home page with that build's own
   server bundle, removes lesson pages past the last lesson and the pages of
   courses no longer in the catalogue, adds the critical CSS and the
   curriculum files, and reports `changed=true|false`.
4. Changed pages are deployed and the build kept for the next refresh.
5. The course editor shows the refresh status and offers a retry when it
   fails. The database save is already complete and is not rolled back.

An administrator can rebuild every page from Platform > General > Public
pages (`POST /platform/static-pages/rebuild`): a run with no course ids is a
full build. Use it after changes that reach every page (the academy's look,
the home page, categories), which are not rebuilt on their own.

## Configuration

Configure the API runtime with:

- `COURSE_STATIC_REFRESH_GITHUB_TOKEN`: a GitHub token with Actions read and
  write permission on the repository that deploys the site.
- `COURSE_STATIC_REFRESH_REPOSITORY`: that repository, `owner/repo`.
- `COURSE_STATIC_REFRESH_REF`: the branch the workflow runs on; defaults to
  `development`.
- `COURSE_STATIC_REFRESH_WORKFLOW`: the workflow file; defaults to
  `refresh-cloudflare-course-pages.yml`. It takes the inputs `course_ids`
  (comma-separated; empty for a full build) and `request_id`, and its run name
  must be `Public pages refresh <request_id>`.

The refresh queue and status are in API-process memory: they are lost on API
restart, and with several API processes each tracks the changes it received.

## This repository's workflows

`Deploy Cloudflare static web` builds and deploys the site and saves the build
as an artifact; `Refresh Cloudflare course pages` refreshes courses in it.
Configure the `development` GitHub Actions environment with the variable
`CLOUDFLARE_ACCOUNT_ID`, the variable `VEO_PUBLIC_API_BASE_URL` (the public
API, with `/v1`) and the secret `CLOUDFLARE_API_TOKEN`. The first
`Deploy Cloudflare static web` run must succeed before a refresh can run.
