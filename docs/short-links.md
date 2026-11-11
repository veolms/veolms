# Links (short links)

Staff make short addresses on the site's own domain, such as `/nodejs`, that
either send the visitor to another address (redirect) or show another page
under our address (rewrite). They are managed in Settings > Links.

## What others do, and what we keep

| Product    | How a link is opened                                                                                     | Kept here                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| bit.ly     | Server redirect, 301 by default; clicks counted on the redirect.                                         | Count clicks, but off the redirect's path.                                      |
| Dub.co     | Edge middleware; link read from a Redis cache, database behind it; 302 by default; clicks sent async.    | Resolve at the edge from a cache; 302 by default; count clicks after answering. |
| Short.io   | 301, 302 or 307 per link; "cloaking" shows the page in a full-page iframe.                               | Status chosen per link.                                                         |
| Vercel     | `redirects` and `rewrites` in config; an external rewrite proxies the page, HTML is not changed.         | A rewrite proxies; we also fix the page's own addresses.                        |
| Cloudflare | Single and Bulk Redirects (exact match lists); a rewrite to another host needs a Worker that fetches it. | Use the Worker the site already runs.                                           |

Why 302 is the default: browsers keep a 301 for good, so a 301 link that is
later edited or paused still sends returning visitors to the old address.
The form says so when 301 is picked.

## Where a link is answered

The website Worker runs only when no built file matches the address, so normal
pages that have a built file never reach it. Before its app shell fallback:

1. If the first path segment belongs to the app (the route tree, written by
   the build to `/__app-paths.json`) the link step is skipped: app pages never
   wait on it.
2. Otherwise the Worker asks the API `GET /v1/links/resolve?path=/nodejs`
   through Cloudflare's cache. The answer (and "no such link") is cached at
   the edge; the API purges that one URL from Cloudflare when a link is
   created, edited, paused or deleted, so a change shows at once. Without a
   purge token the API asks for a 60 second cache instead.
3. A redirect answers 301/302 with the destination. A rewrite is proxied (see
   below). A visit is counted after the answer is sent (`waitUntil`).
4. Unknown paths fall through to the app as before (a profile at
   `/<username>`, or the not-found page).

## Rewrite mode, and its limits

Showing another site's page under our address means its HTML and scripts run
on our origin. Proxied as is, that page could read the learner's storage and
call our API with their session. So a rewrite:

- is sent with `Content-Security-Policy: sandbox ...` (no `allow-same-origin`):
  the page runs as an opaque origin and cannot touch our cookies, storage or
  API session;
- forwards no cookies or auth headers, and drops `Set-Cookie` from the answer;
- proxies only the destination's own host, under `<link>/~/...`: root-relative
  and same-host addresses in the HTML and CSS are rewritten to that prefix,
  and a `<base>` is added so relative ones resolve there too. Other hosts
  (fonts CDNs, analytics) load directly. It is never a proxy for arbitrary
  hosts;
- caches the destination's answers at the edge for 60 seconds (pages) or
  5 minutes (files);
- gives the page an in-memory `localStorage` and `sessionStorage` for the
  visit and hides `navigator.serviceWorker`, since an opaque origin has
  neither and reading them throws (a theme toggle would stop the page's
  script).

Works well: static pages (docs, syllabus pages, Astro/Next static exports).
Does not work: pages that sign in, need their own cookies or storage that lasts,
single-page apps that route by `location.pathname`, and addresses scripts
build at run time. Use a redirect for those.

## Paths

- Lowercased, trimmed, one to three segments of `a-z 0-9 . _ -`, no trailing
  slash. `/Node.JS/` is `/node.js`.
- Refused, with a free alternative suggested: a first segment the app uses
  (route tree from `@veolms/web-core`, plus the deployed site's
  `/__app-paths.json`), reserved prefixes (`api`, `v1`, `cdn`, `assets`,
  `static`, `_s`, `.well-known`, anything starting with `_` or `.`), an
  existing username (a profile lives at `/<username>`), and another link.
  Choosing a username equal to a link is refused too.
- Left empty, a short free path is suggested.

## Destinations

`https://` only, a real host, no credentials in the URL, and not this site or
its API (that would loop).

## Who manages links

The `link.manage` permission, given to admins and instructors (checked with
the "platform" scope, so an instructor's role counts). Its migration gives it
id 87: `feat/workshops` uses 85 and 86.
