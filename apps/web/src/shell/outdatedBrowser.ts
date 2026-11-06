/**
 * A browser the app cannot run in gets a short "please update" page instead
 * of the app.
 *
 * Older browsers are otherwise given fallbacks (legacyBrowserSupport.ts) and
 * use the app. Two kinds cannot be helped that way:
 * - Chrome 117 to 121 freeze for good once the app's stylesheets apply, a
 *   fault of those versions (measured 2026-11-01, after a student's phone
 *   Chrome 119 hung: 116 and 122 and later are fine). The triggers are the
 *   relative colours (`oklch(from …)`) and `@starting-style`; with both
 *   taken out the page answers again, with either left in it hangs. A page
 *   that freezes cannot show any message itself, so this check runs first in
 *   the head and stops the page loading (`window.stop()`) before any
 *   stylesheet is applied. `FREEZING_CHROMIUM` is the range found to freeze.
 * - A browser without JavaScript modules (Chrome 60, Firefox 59, Safari 10.1
 *   and older), where the app's code never runs.
 *
 * "Continue anyway" lets a visitor who is told wrongly use the app for the
 * rest of the tab's life.
 *
 * Kept as source text rather than a function's `toString()`: the build
 * rewrites functions into newer syntax (`??`, arrow functions) that the very
 * browsers this is for cannot parse.
 */
export const FREEZING_CHROMIUM = { from: 117, to: 121 };

const CONTINUE_KEY = "veolms-outdated-browser-continue";
const CHROME_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.android.chrome";

const SCRIPT = `(function (config) {
  try {
    if (window.sessionStorage.getItem(config.continueKey) === "1") return;
  } catch (error) {}
  var ua = navigator.userAgent || "";
  if (/bot|crawl|spider|slurp/i.test(ua)) return;

  var brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  var chromium = 0;
  var googleChrome = false;
  for (var i = 0; i < brands.length; i++) {
    if (brands[i].brand === "Chromium") chromium = parseInt(brands[i].version, 10) || 0;
    if (brands[i].brand === "Google Chrome") googleChrome = true;
  }
  var match = /Chrom(?:e|ium)\\/(\\d+)/.exec(ua);
  if (!chromium && match) chromium = parseInt(match[1], 10) || 0;
  if (!brands.length && match) {
    googleChrome = !/HeyTap|SamsungBrowser|UCBrowser|OPR|EdgA|Edg\\/|MiuiBrowser|VivoBrowser|YaBrowser|; wv\\)/.test(ua);
  }

  var hasModules = "noModule" in document.createElement("script");
  var freezes = chromium >= config.freezingChromium.from && chromium <= config.freezingChromium.to;
  if (hasModules && !freezes) return;

  if (window.stop) window.stop();
  else if (document.execCommand) document.execCommand("Stop");

  var android = /Android/i.test(ua);
  var here = location.host + location.pathname + location.search;
  var openInChrome =
    "intent://" + here + "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" +
    encodeURIComponent(config.playStoreUrl) + ";end";
  var which = chromium ? "This browser (Chrome " + chromium + ")" : "This browser";

  var html =
    '<main class="ob"><h1>Please update your browser</h1>' +
    "<p>" + which + " cannot open this site: the page would stop responding, and you would not be able to sign in.</p>" +
    (android
      ? "<p>Update Google Chrome from the Play Store, then open this page in Chrome.</p>" +
        '<p class="ob-actions"><a class="ob-button" href="' + config.playStoreUrl + '">Update Google Chrome</a>' +
        (googleChrome ? "" : '<a class="ob-button ob-secondary" href="' + openInChrome + '">Open this page in Chrome</a>') +
        "</p>"
      : "<p>Update your browser, or open this page in the latest Chrome, Edge, Firefox or Safari.</p>") +
    '<p class="ob-continue"><a href="#" id="ob-continue">Continue anyway</a></p></main>';

  var css =
    "html,body{margin:0;background:#f5f7fb;color:#1c2333;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}" +
    ".ob{box-sizing:border-box;max-width:480px;margin:0 auto;padding:48px 24px}" +
    ".ob h1{margin:0 0 16px;font-size:24px;line-height:1.25}" +
    ".ob p{margin:0 0 16px}" +
    ".ob-actions{margin-top:24px}" +
    ".ob-button{display:block;margin:0 0 12px;padding:14px 16px;border-radius:12px;background:#3d5afe;color:#fff;text-align:center;font-weight:600;text-decoration:none}" +
    ".ob-secondary{background:transparent;color:#3d5afe;border:1px solid #3d5afe}" +
    ".ob-continue{margin-top:32px;font-size:14px}" +
    ".ob-continue a{color:#5b6475}" +
    "@media (prefers-color-scheme:dark){html,body{background:#12151a;color:#eef2fa}" +
    ".ob-button{background:#7193ff;color:#07102a}.ob-secondary{background:transparent;color:#a9bcff;border-color:#7193ff}.ob-continue a{color:#a6b0c3}}";

  function render() {
    var root = document.documentElement;
    var head = document.head || root.insertBefore(document.createElement("head"), root.firstChild);
    var style = document.createElement("style");
    style.appendChild(document.createTextNode(css));
    head.appendChild(style);
    var title = document.createElement("title");
    title.appendChild(document.createTextNode("Please update your browser"));
    head.appendChild(title);
    var body = document.body || root.appendChild(document.createElement("body"));
    body.innerHTML = html;
    var cont = document.getElementById("ob-continue");
    if (cont) {
      cont.onclick = function () {
        try {
          window.sessionStorage.setItem(config.continueKey, "1");
        } catch (error) {}
        location.reload();
        return false;
      };
    }
  }
  render();
})(__CONFIG__);`;

/** The check, for the first script in the document head. */
export function getOutdatedBrowserScript(): string {
  return SCRIPT.replace(
    "__CONFIG__",
    JSON.stringify({
      continueKey: CONTINUE_KEY,
      freezingChromium: FREEZING_CHROMIUM,
      playStoreUrl: CHROME_PLAY_STORE_URL,
    }),
  );
}
