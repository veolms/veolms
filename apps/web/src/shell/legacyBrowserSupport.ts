/**
 * Lets the app run in browsers from before 2022 instead of breaking in them.
 *
 * Measured on 2026-11-01 in Chrome 91 (the engine of a student's phone
 * browser): the page was all but unstyled and the app stopped with
 * "i.at is not a function". Two gaps, both filled here, in the first script
 * of the head so they are in place before any stylesheet or module:
 *
 * - Built-ins the bundle calls that older engines lack, each added only
 *   where it is missing: `Array/String/TypedArray#at` (Chrome 92),
 *   `crypto.randomUUID` (92), `Object.hasOwn` (93), `structuredClone` (98),
 *   `Element#checkVisibility` (105), `Promise.withResolvers` (119, the video
 *   player) and `URL.canParse` (120).
 * - CSS from after 2022: cascade layers (Chrome 99, Firefox 97, Safari
 *   15.4) above all, since a browser that does not know `@layer` drops every
 *   rule inside one, but also `:has()`, container queries, `color-mix()` and
 *   more (scripts/legacy-css.mjs lists them). The build writes a rewritten
 *   copy beside each stylesheet (`x.css` → `x.legacy.css`); the dev server
 *   rewrites on request (`?legacy-css`). Here, in a browser without layers
 *   (or a Chromium without color-mix(), below 111), every stylesheet is
 *   swapped for its copy as it is added, by the
 *   parser or later by the app, and the scripts for `:has()` and container
 *   queries are loaded. Everyone else loads the stylesheets as before.
 *
 * Kept as source text, like `outdatedBrowser.ts`: the build would rewrite a
 * function into syntax these browsers cannot parse.
 */
const SCRIPT = `(function () {
  var define = function (target, name, value) {
    if (target && !(name in target)) {
      Object.defineProperty(target, name, { value: value, writable: true, configurable: true });
    }
  };
  var at = function (index) {
    var length = this.length;
    var i = Math.trunc(index) || 0;
    if (i < 0) i += length;
    return i < 0 || i >= length ? undefined : this[i];
  };
  define(Array.prototype, "at", at);
  define(String.prototype, "at", at);
  if (typeof Int8Array !== "undefined") define(Object.getPrototypeOf(Int8Array.prototype), "at", at);
  define(Object, "hasOwn", function (object, key) {
    if (object == null) throw new TypeError("Cannot convert undefined or null to object");
    return Object.prototype.hasOwnProperty.call(Object(object), key);
  });
  define(Promise, "withResolvers", function () {
    var result = {};
    result.promise = new this(function (resolve, reject) {
      result.resolve = resolve;
      result.reject = reject;
    });
    return result;
  });
  if (typeof URL !== "undefined") {
    define(URL, "canParse", function (url, base) {
      try {
        new URL(url, base);
        return true;
      } catch (error) {
        return false;
      }
    });
  }
  if (window.crypto && window.crypto.getRandomValues) {
    define(window.crypto, "randomUUID", function () {
      var bytes = window.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      var hex = "";
      for (var i = 0; i < 16; i++) {
        hex += (bytes[i] + 256).toString(16).slice(1);
        if (i === 3 || i === 5 || i === 7 || i === 9) hex += "-";
      }
      return hex;
    });
  }
  define(window, "structuredClone", function (value) {
    var seen = new Map();
    var copy = function (item) {
      if (item === null || typeof item !== "object") return item;
      if (seen.has(item)) return seen.get(item);
      var out;
      if (item instanceof Date) return new Date(item.getTime());
      if (item instanceof RegExp) return new RegExp(item.source, item.flags);
      if (ArrayBuffer.isView(item)) return item.slice ? item.slice() : item;
      if (item instanceof ArrayBuffer) return item.slice(0);
      if (typeof Blob !== "undefined" && item instanceof Blob) return item;
      if (item instanceof Map) {
        out = new Map();
        seen.set(item, out);
        item.forEach(function (v, k) { out.set(copy(k), copy(v)); });
        return out;
      }
      if (item instanceof Set) {
        out = new Set();
        seen.set(item, out);
        item.forEach(function (v) { out.add(copy(v)); });
        return out;
      }
      out = Array.isArray(item) ? [] : {};
      seen.set(item, out);
      Object.keys(item).forEach(function (key) { out[key] = copy(item[key]); });
      return out;
    };
    return copy(value);
  });
  if (typeof Element !== "undefined") {
    define(Element.prototype, "checkVisibility", function (options) {
      if (!this.getClientRects().length) return false;
      var style = getComputedStyle(this);
      if (options && (options.checkVisibilityCSS || options.visibilityProperty) && style.visibility !== "visible") return false;
      if (options && (options.checkOpacity || options.opacityProperty) && style.opacity === "0") return false;
      return true;
    });
  }

  // Chromium had layers from 99 but no :has() or container queries until
  // 105 and no color-mix() until 111, and Chrome 104 was as broken as 91:
  // it takes the copies too. Other engines with layers are left as they are.
  var mixes = false;
  try {
    mixes = CSS.supports("color", "color-mix(in srgb, red, red)");
  } catch (error) {}
  var chromium = /Chrome\\/\\d/.test(navigator.userAgent);
  if (typeof window.CSSLayerBlockRule !== "undefined" && (mixes || !chromium)) return;
  var root = document.documentElement;
  root.setAttribute("data-legacy-stylesheets", "");

  // The page stays hidden until the copies are in and container queries and
  // :has() are worked out: Chrome 91 drew it unstyled first (stylesheets
  // added by script do not hold the first paint), then for seconds without
  // its layout. At most 12 s: over HTTP/1.1 the scripts below can wait
  // seconds behind some 200 module preloads. A constructed stylesheet hides:
  // the head scripts after this one rewrite the root's inline style, and an
  // element added to the head would be taken by React for one of its own.
  var hide = null;
  try {
    hide = new CSSStyleSheet();
    // Not visibility: elements that set their own (the sidebar) still showed.
    hide.replaceSync("html { opacity: 0 !important; }");
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat([hide]);
  } catch (error) {
    hide = null;
  }
  var nativeContainers = "container" in root.style;
  var waiting = 0;
  var parsed = false;
  var revealed = false;
  var hasAttributes = function () {
    var found = {};
    var walk = function (rules) {
      for (var i = 0; rules && i < rules.length; i++) {
        var list = rules[i].style && rules[i].style.getPropertyValue("--legacy-has-attributes");
        if (list) list.replace(/["']/g, "").split(/\\s+/).forEach(function (name) { if (name) found[name] = true; });
        if (rules[i].cssRules) walk(rules[i].cssRules);
      }
    };
    for (var i = 0; i < document.styleSheets.length; i++) {
      try { walk(document.styleSheets[i].cssRules); } catch (error) {}
    }
    return Object.keys(found);
  };
  var reveal = function () {
    if (revealed) return;
    revealed = true;
    // Forced: the copies have no :has() left, even where it is native.
    if (window.cssHasPseudo) window.cssHasPseudo(document, { observedAttributes: hasAttributes(), forcePolyfill: true });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!hide) return;
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(function (sheet) { return sheet !== hide; });
      });
    });
  };
  var settle = function () {
    if (parsed && waiting === 0) reveal();
  };
  setTimeout(reveal, 12000);
  document.addEventListener("DOMContentLoaded", function () {
    parsed = true;
    settle();
  });
  // A copy is ready once loaded, and where container queries are done by
  // script, once the polyfill has rewritten it ("legacy-sheet", its sheet
  // then in too) or found nothing in it ("legacy-sheet-skip").
  var track = function (copy) {
    if (revealed) return;
    waiting++;
    var loaded = false;
    var checked = nativeContainers;
    var done = false;
    var finish = function () {
      if (done || !loaded || !checked) return;
      done = true;
      waiting--;
      settle();
    };
    var onLoad = function () { loaded = true; finish(); };
    copy.addEventListener("load", onLoad);
    copy.addEventListener("error", onLoad);
    copy.addEventListener("legacy-sheet", function () { loaded = true; checked = true; finish(); });
    copy.addEventListener("legacy-sheet-skip", function () { checked = true; finish(); });
  };

  var legacyHref = function (href) {
    href = href || "";
    var built = /^(.*\\/assets\\/[^\\/?#]+?)\\.css([?#].*)?$/.exec(href);
    if (built) return /\\.legacy$/.test(built[1]) ? null : built[1] + ".legacy.css" + (built[2] || "");
    // The dev server's own stylesheets, rewritten on request.
    var dev = /^(\\/[^?#]*\\.css)(\\?[^#]*)?(#.*)?$/.exec(href);
    // Virtual stylesheets (React Router's critical CSS) are left as they are.
    if (!dev || /legacy-css/.test(dev[2] || "") || /^\\/@(?!fs\\/)/.test(dev[1])) return null;
    return dev[1] + (dev[2] ? dev[2] + "&" : "?") + "legacy-css" + (dev[3] || "");
  };
  // React finds the links it rendered by their href when it hydrates, and
  // rebuilds the whole page when one is missing. So each stylesheet keeps
  // its own and is switched off, with its rewritten copy loaded beside it
  // (and taken out with it).
  var replace = function (node, href) {
    node.setAttribute("data-legacy-replaced", "");
    var copy = document.createElement("link");
    copy.setAttribute("data-legacy-copy", "");
    copy.rel = node.tagName === "LINK" ? node.getAttribute("rel") : "stylesheet";
    if (node.hasAttribute("as")) copy.setAttribute("as", node.getAttribute("as"));
    if (node.hasAttribute("crossorigin")) copy.setAttribute("crossorigin", node.getAttribute("crossorigin"));
    // A stylesheet held back as "print" until it loads, behind the inline
    // critical CSS (scripts/inline-critical-css.mjs), is not held back: that
    // CSS is in layers, which these browsers drop. Its onload would switch
    // the original back on.
    var deferred = node.hasAttribute("data-deferred-style");
    if (deferred) node.removeAttribute("onload");
    else if (node.media) copy.media = node.media;
    copy.href = href;
    if (copy.rel.toLowerCase() === "stylesheet") {
      node.media = "not all";
      track(copy);
    }
    node.parentNode.insertBefore(copy, node.nextSibling);
    node.legacyCopy = copy;
  };
  var point = function (node) {
    if (!node || node.nodeType !== 1) return;
    var links = node.tagName === "LINK" ? [node] : node.getElementsByTagName("link");
    for (var i = 0; i < links.length; i++) {
      var rel = (links[i].getAttribute("rel") || "").toLowerCase();
      if (rel !== "stylesheet" && !(rel === "preload" && links[i].getAttribute("as") === "style")) continue;
      if (links[i].hasAttribute("data-legacy-replaced")) continue;
      var next = legacyHref(links[i].getAttribute("href"));
      if (next) replace(links[i], next);
    }
    // The dev server puts imported stylesheets in <style> elements.
    var styles = node.tagName === "STYLE" ? [node] : node.getElementsByTagName("style");
    for (var s = 0; s < styles.length; s++) {
      var id = styles[s].getAttribute("data-vite-dev-id");
      if (!id || styles[s].hasAttribute("data-legacy-replaced")) continue;
      replace(styles[s], "/@fs/" + id.replace(/^\\//, "") + "?direct&legacy-css");
    }
  };
  point(root);
  new MutationObserver(function (records) {
    for (var r = 0; r < records.length; r++) {
      for (var n = 0; n < records[r].addedNodes.length; n++) point(records[r].addedNodes[n]);
      for (var m = 0; m < records[r].removedNodes.length; m++) {
        var copy = records[r].removedNodes[m].legacyCopy;
        if (copy && copy.parentNode) copy.parentNode.removeChild(copy);
      }
    }
  }).observe(root, { childList: true, subtree: true });

  // :has() and container queries, done by script (see scripts/legacy-css.mjs),
  // loaded here and now, before the rest of the head: added as async scripts
  // they waited behind some 200 module preloads (8 s in Chrome 91 over a
  // slow link). The script elements are taken out once run, since React
  // would take any of them for one of its own when it hydrates.
  document.write(
    '<script src="/legacy/container-query-polyfill.js"><\\/script>' +
      '<script src="/legacy/css-has-pseudo.js"><\\/script>' +
      "<script>(function (self) { for (var i = 0; i < 2; i++) self.parentNode.removeChild(self.previousElementSibling); self.parentNode.removeChild(self); })(document.currentScript)<\\/script>",
  );
})();`;

/** Fallbacks for older browsers, for a script early in the document head. */
export function getLegacyBrowserSupportScript(): string {
  return SCRIPT;
}
