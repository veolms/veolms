/*
 * Runs only for requests that match no file in the static build.
 *
 * Cloudflare's built-in "single-page-application" handling answers every such
 * request with /index.html. Here that file is the prerendered home page, so a
 * lesson, dashboard or any other route without its own prerendered file was
 * served the home page's markup: the browser painted the guest home, React
 * failed to hydrate it as the requested route (error #418) and rebuilt the
 * page. Page navigations get the route-neutral application shell that the
 * build writes for exactly this purpose instead.
 */
const SPA_SHELL_PATH = "/__spa-fallback.html";
const HOME_DOCUMENT_PATH = "/index.html";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // A missing build asset is a real 404. Answering it with HTML only turns
    // it into a module MIME-type error in the browser.
    if (url.pathname.startsWith("/assets/")) {
      return new Response("Not found", { status: 404 });
    }

    // Well-known URIs are probed by crawlers and agents to discover optional
    // resources (for example /.well-known/ai-catalog.json). One this site
    // does not publish has to be a 404, not an HTML page with status 200
    // that the prober then tries to parse as that resource.
    if (url.pathname.startsWith("/.well-known/")) {
      return new Response("Not found", { status: 404 });
    }

    // Other file-like requests keep the previous behavior.
    const isPageNavigation = !/\.[A-Za-z0-9]{1,8}$/u.test(url.pathname);
    const documentPath = isPageNavigation ? SPA_SHELL_PATH : HOME_DOCUMENT_PATH;

    let response = await env.ASSETS.fetch(
      new Request(new URL(documentPath, url), {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: request.headers,
      }),
    );
    // The asset server may redirect an .html path to its extensionless form.
    const location = response.headers.get("Location");
    if (response.status >= 300 && response.status < 400 && location) {
      response = await env.ASSETS.fetch(
        new Request(new URL(location, url), {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: request.headers,
        }),
      );
    }
    return new Response(response.body, {
      status: response.ok ? 200 : response.status,
      headers: response.headers,
    });
  },
};
