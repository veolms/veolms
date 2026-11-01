import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * The scripts that browsers on the legacy stylesheets load as well
 * (src/shell/legacyBrowserSupport.ts), served from `/legacy/<name>`.
 */
const LEGACY_SCRIPTS = {
  "css-has-pseudo.js": {
    resolve: () => require.resolve("css-has-pseudo/browser-global"),
    // Fixes to version 8.0.2.
    patches: [
      // Only the legacy copies hold rewritten `:has()` rules, so only they
      // are read. The container query polyfill swaps a copy for its own
      // rewrite after this one may have read it, and the rules read are gone
      // with the old sheet: each new sheet it announces is read too.
      [
        "[].forEach.call(e.styleSheets,walkStyleSheet),t.mustPolyfill)",
        '[].forEach.call(e.styleSheets,function(r){r.ownerNode&&r.ownerNode.hasAttribute&&r.ownerNode.hasAttribute("data-legacy-copy")&&walkStyleSheet(r)}),e.addEventListener("legacy-sheet",function(r){r.target.sheet&&(walkStyleSheet(r.target.sheet),transformObservedItemsThrottled())},!0),t.mustPolyfill)',
      ],
      [
        '1===e.nodeType&&(e.sheet?walkStyleSheet(e.sheet):e.addEventListener("load"',
        '1===e.nodeType&&e.hasAttribute("data-legacy-copy")&&(e.sheet?walkStyleSheet(e.sheet):e.addEventListener("load"',
      ],
      // It set the selector of every rule it read, changed or not, and each
      // set is a stylesheet change: tens of thousands kept Chrome 104 busy
      // for a minute (in layers, which the inline critical CSS has there).
      [
        'n.selectorText=n.selectorText.replace(/\\.js-has-pseudo\\s/g,"");',
        '/\\.js-has-pseudo\\s/.test(n.selectorText)&&(n.selectorText=n.selectorText.replace(/\\.js-has-pseudo\\s/g,""));',
      ],
      // Its `matches()` and query wrappers lower-cased the whole selector on
      // every call to look for `:has(`; the container query polyfill calls
      // `matches()` thousands of times per update with long selectors.
      ['-1===n.toLowerCase().indexOf(":has(")', "!/:has\\(/i.test(n)"],
      // On each pass after a change it set every matched element's attribute
      // again and toggled `zoom` on the page root after each one (a repaint
      // fix for old Safari): a restyle of the whole page per element. The
      // attribute is now set when missing, and the root left alone.
      [
        'o.push(t),n.innerHTML="<x "+r.attributeName+">",t.setAttributeNode(n.children[0].attributes[0].cloneNode()),e.documentElement.style.zoom=1,e.documentElement.style.zoom=null',
        'o.push(t),t.hasAttribute(r.attributeName)||(n.innerHTML="<x "+r.attributeName+">",t.setAttributeNode(n.children[0].attributes[0].cloneNode()))',
      ],
      [
        "t.removeAttribute(r.attributeName),e.documentElement.style.zoom=1,e.documentElement.style.zoom=null",
        "t.removeAttribute(r.attributeName)",
      ],
      // `X:has(Y)` was worked out by asking every element of the page
      // whether it holds a Y, for each of some 150 selectors and again on
      // every change to the page: 450,000 queries in 30 s in Chrome 91 (a
      // current Chrome makes 17). Where Y is one compound selector (most of
      // the app's), one query finds them: the elements that hold a Y are its
      // ancestors, `:has(> Y)` its parent, `:has(+ Y)` its previous sibling
      // and `:has(~ Y)` the siblings before it.
      [
        "walkNode(o,function(e){if(e.querySelector(l))switch(s[0]){",
        '(function(){var k=/^[>+~]/.test(s)?s[0]:"",q=k?s.slice(1).trim():s;return/^[^\\s>+~]*$/.test(q.replace(/\\([^()]*\\)|\\[[^\\]]*\\]/g,""))?function(r){for(var m=r.querySelectorAll(q),i=0;i<m.length;i++){var p;if(">"===k)(p=m[i].parentNode)&&"setAttribute"in p&&p.setAttribute(t,"");else if("+"===k)(p=m[i].previousElementSibling)&&p.setAttribute(t,"");else if("~"===k)for(p=m[i].previousElementSibling;p&&!p.hasAttribute(t);p=p.previousElementSibling)p.setAttribute(t,"");else for(p=m[i].parentNode;p&&"setAttribute"in p&&!p.hasAttribute(t);p=p.parentNode)p.setAttribute(t,"")}}:walkNode}())(o,function(e){if(e.querySelector(l))switch(s[0]){',
      ],
    ],
  },
  "container-query-polyfill.js": {
    resolve: () => require.resolve("container-query-polyfill"),
    // Fixes to version 1.0.2, found in Chrome 91 on 2026-11-01.
    patches: [
      // Of the links, only the legacy copies are rewritten. The polyfill
      // points a link at its rewritten blob, and React, which finds the
      // links it rendered by their href, rebuilt the page when one of its
      // own had moved.
      [
        "n instanceof HTMLLinkElement?new Ze(",
        'n instanceof HTMLLinkElement&&n.hasAttribute("data-legacy-copy")?new Ze(',
      ],
      // No <style> is rewritten: the ones the dev server adds have copies,
      // and the inline critical CSS of a built page is the original app
      // stylesheet in part. Rewritten, its `:has()` selectors became
      // container conditions that css-has-pseudo worked out for every
      // element on every change, and Chrome 104 stopped responding.
      [
        "n instanceof HTMLStyleElement?new et(",
        'n instanceof HTMLStyleElement&&n.hasAttribute("data-legacy-copy")?new et(',
      ],
      // The queries of a linked stylesheet were attached to its sheet when an
      // image of the rewritten copy failed to load, which for a large file
      // comes while the sheet is still loading: they were dropped, and no
      // container query in the app stylesheet ever applied. Nor does the
      // link fire a second load event for its new address (Chrome 91), so
      // they are attached once its sheet is the rewritten one, which is
      // then announced for css-has-pseudo (above).
      [
        "c=new Image;c.onload=c.onerror=s.refresh,c.src=t.href=URL.createObjectURL(l)",
        'c=t.href=URL.createObjectURL(l);(function w(){t.sheet&&t.sheet.href===c?(s.refresh(),t.dispatchEvent(new Event("legacy-sheet"))):t.isConnected&&t.href===c&&setTimeout(w,30)})()',
      ],
      // Only 6 of the 60 stylesheets have anything for it (container queries,
      // containers, `cq*` units), but it parsed and rewrote every one in
      // JavaScript, the ones the app preloads for other pages included: the
      // others are left as they are, which is announced ("legacy-sheet-skip")
      // for the head script, waiting to show the page.
      [
        "o=await u.text(),s=e.styleSheet=await e.context.registerStyleSheet({source:o,url:n,signal:r})",
        'o=await u.text();if(!/@container|container-(?:type|name)|container\\s*:|\\dcq(?:[wihb]|min|max)\\b/.test(o))return void t.dispatchEvent(new Event("legacy-sheet-skip"));const s=e.styleSheet=await e.context.registerStyleSheet({source:o,url:n,signal:r})',
      ],
      // In Chrome 91 the idle home page was updated twice a second, every
      // element matched again: each update set its marker attributes anew,
      // changed or not, the restyle moved the app's floating scrollbar,
      // whose inline style change started the next update. Markers are now
      // set only when they change, and a `style` attribute change starts no
      // update (a container it resizes is caught by the resize observer).
      // Nor do the `q-has*` attributes css-has-pseudo sets and takes off
      // again within one pass, which started a full update each time.
      [
        "r.length>0?e.setAttribute(n,r):e.removeAttribute(n)",
        "r.length>0?e.getAttribute(n)!==r&&e.setAttribute(n,r):e.hasAttribute(n)&&e.removeAttribute(n)",
      ],
      [
        '"attributes"===t.type&&t.attributeName&&(t.attributeName===v||t.attributeName===d||',
        '"attributes"===t.type&&t.attributeName&&("style"===t.attributeName||0===t.attributeName.indexOf("q-has")||t.attributeName===v||t.attributeName===d||',
      ],
      // A stylesheet removed while it loads is not an error (the message is
      // what was meant to be the name).
      ['"AbortError"===e.message', '"AbortError"===e.name'],
    ],
  },
};

export const LEGACY_SCRIPT_NAMES = Object.keys(LEGACY_SCRIPTS);

/** One of those scripts, with its fixes. */
export async function readLegacyScript(name) {
  const script = LEGACY_SCRIPTS[name];
  if (!script) throw new Error(`Legacy script ${name} is not known`);
  let source = await readFile(script.resolve(), "utf8");
  for (const [from, to] of script.patches) {
    if (!source.includes(from)) {
      throw new Error(
        `Legacy script ${name}: "${from.slice(0, 40)}…" not found; the package has changed, check its fixes`,
      );
    }
    source = source.replaceAll(from, to);
  }
  return source;
}
