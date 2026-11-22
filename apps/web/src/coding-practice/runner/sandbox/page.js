/*
 * The harness of a web or React exercise's page frame (sandbox
 * "allow-scripts", opaque origin). `shared.js` runs first. It bridges the
 * console and errors to the lesson page, mocks fetch, provides the loop
 * guard the page inserted into the learner's code, mounts the React app
 * inside an error boundary, and runs the exercise's tests on request.
 */
(function () {
  "use strict";
  var veo = window.__veo;
  var boot = window.__veoBoot;
  var parentWindow = window.parent;
  var renderErrors = [];
  var root = null;

  function send(message) {
    message.nonce = boot.nonce;
    message.runId = boot.runId;
    try {
      parentWindow.postMessage(message, "*");
    } catch (error) {
      /* the lesson page went away */
    }
  }

  var bridge = veo.makeConsole(send);
  Object.keys(bridge).forEach(function (level) {
    try {
      console[level] = bridge[level];
    } catch (error) {
      /* read-only in some browsers */
    }
  });

  /** Inline scripts report document lines; map them to the learner file. */
  function mapLine(line) {
    var scripts = boot.scriptLines || [];
    for (var i = 0; i < scripts.length; i++) {
      var start = scripts[i].startLine;
      if (line >= start && line < start + scripts[i].lineCount) {
        return { file: scripts[i].file, line: line - start + 1 };
      }
    }
    return null;
  }

  function where(error, line) {
    return veo.locate(error, boot.paths || []) || (line ? mapLine(line) : null);
  }

  window.addEventListener("error", function (event) {
    var place = where(event.error, event.lineno);
    send({
      type: "error",
      message: event.error ? veo.errorText(event.error) : String(event.message),
      file: place && place.file,
      line: place && place.line,
    });
  });
  window.addEventListener("unhandledrejection", function (event) {
    send({ type: "error", message: veo.errorText(event.reason) });
  });

  // No network: the CSP blocks it; these say why.
  window.fetch = veo.makeMockFetch(boot.mocks || []);
  window.XMLHttpRequest = undefined;
  window.WebSocket = undefined;
  window.EventSource = undefined;
  window.alert = function (message) {
    console.info("alert: " + String(message));
  };
  window.confirm = function (message) {
    console.info("confirm: " + String(message) + " (answered Cancel)");
    return false;
  };
  window.prompt = function (message) {
    console.info("prompt: " + String(message) + " (answered with nothing)");
    return null;
  };
  // Links and forms would navigate the frame away from the exercise.
  document.addEventListener(
    "click",
    function (event) {
      var link =
        event.target && event.target.closest && event.target.closest("a[href]");
      if (link && link.getAttribute("href").charAt(0) !== "#") {
        event.preventDefault();
        console.info(
          "Links are not followed in practice: " + link.getAttribute("href"),
        );
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    function (event) {
      event.preventDefault();
    },
    true,
  );

  /* Loop guard: the page inserted __gs (loop starts) and __g (each pass). */
  var loops = {};
  window.__gs = function (id) {
    loops[id] = { count: 0, started: performance.now() };
  };
  window.__g = function (id, line) {
    var loop =
      loops[id] || (loops[id] = { count: 0, started: performance.now() });
    loop.count += 1;
    if (
      loop.count > 10000000 ||
      ((loop.count & 1023) === 0 && performance.now() - loop.started > 1000)
    ) {
      loops[id] = { count: 0, started: performance.now() };
      throw new RangeError(
        "Line " +
          line +
          ": this loop ran for more than 1 second. Check that it can end.",
      );
    }
  };

  /* ------------------------------------------------------------ React */

  function makeBoundary(React) {
    function Boundary(props) {
      React.Component.call(this, props);
      this.state = { error: null };
    }
    Boundary.prototype = Object.create(React.Component.prototype);
    Boundary.prototype.constructor = Boundary;
    Boundary.getDerivedStateFromError = function (error) {
      return { error: error };
    };
    Boundary.prototype.componentDidCatch = function (error) {
      renderErrors.push(error);
      var place = where(error);
      send({
        type: "error",
        message: veo.errorText(error),
        file: place && place.file,
        line: place && place.line,
      });
    };
    Boundary.prototype.render = function () {
      if (this.state.error) {
        return React.createElement(
          "pre",
          {
            style: {
              color: "#b42318",
              whiteSpace: "pre-wrap",
              font: "13px/1.5 ui-monospace, Consolas, monospace",
              padding: "12px",
              margin: 0,
            },
          },
          "Your app crashed: " + veo.errorText(this.state.error),
        );
      }
      return this.props.children;
    };
    return Boundary;
  }

  function mountApp() {
    var runtime = window.__veoReact;
    if (!runtime) throw new Error("React did not load. Reload the lesson.");
    var modules = veo.makeModules(boot.modules || {}, {
      react: runtime.react,
      "react-dom": runtime.reactDom,
      "react-dom/client": runtime.reactDomClient,
      "react/jsx-runtime": runtime.jsxRuntime,
      "react/jsx-dev-runtime": runtime.jsxRuntime,
    });
    var exported = modules.load(boot.entry);
    var App = exported && (exported.default || exported.App);
    if (
      typeof App !== "function" &&
      (typeof App !== "object" || App === null)
    ) {
      throw new Error(
        boot.entry +
          " must export the App component (export default function App).",
      );
    }
    var container = document.getElementById("root");
    if (root) root.unmount();
    container.textContent = "";
    root = runtime.reactDomClient.createRoot(container);
    var Boundary = makeBoundary(runtime.react);
    runtime.reactDom.flushSync(function () {
      root.render(
        runtime.react.createElement(
          Boundary,
          null,
          runtime.react.createElement(App),
        ),
      );
    });
  }

  /* ------------------------------------------------------------ Tests */

  var registered = [];
  function register(name, fn, hidden) {
    registered.push({ name: String(name), fn: fn, hidden: Boolean(hidden) });
  }
  window.test = function (name, fn) {
    register(name, fn, false);
  };
  window.test.hidden = function (name, fn) {
    register(name, fn, true);
  };

  function fail(message) {
    var error = new Error(message);
    error.name = "AssertionError";
    throw error;
  }

  function matchers(actual, negate) {
    function check(ok, message, negatedMessage) {
      if (negate ? ok : !ok) fail(negate ? negatedMessage : message);
    }
    var api = {
      toBe: function (expected) {
        check(
          Object.is(actual, expected),
          "Expected " +
            veo.describe(expected) +
            ", got " +
            veo.describe(actual) +
            ".",
          "Expected anything but " + veo.describe(expected) + ".",
        );
      },
      toEqual: function (expected) {
        check(
          veo.equal(actual, expected, false),
          "Expected " +
            veo.describe(expected) +
            ", got " +
            veo.describe(actual) +
            ".",
          "Expected anything but " + veo.describe(expected) + ".",
        );
      },
      toContain: function (item) {
        var ok =
          typeof actual === "string"
            ? actual.indexOf(item) >= 0
            : Array.isArray(actual) &&
              actual.some(function (entry) {
                return veo.equal(entry, item, false);
              });
        check(
          ok,
          "Expected " +
            veo.describe(actual) +
            " to contain " +
            veo.describe(item) +
            ".",
          "Expected " +
            veo.describe(actual) +
            " not to contain " +
            veo.describe(item) +
            ".",
        );
      },
      toBeTruthy: function () {
        check(
          Boolean(actual),
          "Expected a value, got " + veo.describe(actual) + ".",
          "Expected no value, got " + veo.describe(actual) + ".",
        );
      },
      toThrow: function () {
        if (typeof actual !== "function") fail("toThrow() needs a function.");
        var threw = false;
        try {
          actual();
        } catch (error) {
          threw = true;
        }
        check(
          threw,
          "Expected it to throw an error.",
          "Expected it not to throw.",
        );
      },
    };
    return api;
  }
  window.expect = function (actual) {
    var api = matchers(actual, false);
    api.not = matchers(actual, true);
    return api;
  };

  window.getByTestId = function (id) {
    var element = document.querySelector(
      '[data-testid="' + CSS.escape(String(id)) + '"]',
    );
    if (!element)
      fail(
        'No element has data-testid="' +
          id +
          '". Check the testing instructions.',
      );
    return element;
  };
  window.getByText = function (text) {
    var wanted = String(text).trim();
    var all = document.body.querySelectorAll("*");
    var found = null;
    for (var i = 0; i < all.length; i++) {
      if ((all[i].textContent || "").trim() === wanted) found = all[i];
    }
    if (!found) fail('No element shows the text "' + wanted + '".');
    return found;
  };
  window.querySelector = function (selector) {
    return document.querySelector(selector);
  };

  // A macrotask that isn't slowed down. This frame is off screen and from
  // another origin, so the browser holds its timers to about one a second;
  // MessageChannel messages are delivered at once.
  var tickChannel = new MessageChannel();
  var tickQueue = [];
  tickChannel.port1.onmessage = function () {
    var resolve = tickQueue.shift();
    if (resolve) resolve();
  };
  function tick() {
    return new Promise(function (resolve) {
      tickQueue.push(resolve);
      tickChannel.port2.postMessage(0);
    });
  }

  function settle() {
    return tick().then(tick);
  }

  window.click = function (element) {
    if (!element || typeof element.click !== "function")
      fail("click() needs an element.");
    element.click();
    return settle();
  };
  window.input = function (element, value) {
    if (!element) fail("input() needs an element.");
    var proto =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set)
      descriptor.set.call(element, String(value));
    else element.value = String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return settle();
  };
  window.style = function (element) {
    return getComputedStyle(element);
  };
  window.wait = function (ms) {
    return new Promise(function (resolve) {
      veo.nativeSetTimeout(resolve, Math.min(Number(ms) || 0, 5000));
    });
  };

  function race(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = veo.nativeSetTimeout(function () {
        reject(
          new Error("The test did not finish within " + ms / 1000 + " s."),
        );
      }, ms);
      promise.then(
        function (value) {
          clearTimeout(timer);
          resolve(value);
        },
        function (error) {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async function runTests(request) {
    registered = [];
    try {
      new Function(request.source + "\n//# sourceURL=tests.js")();
    } catch (error) {
      send({
        type: "fatal",
        message: "The tests could not load: " + veo.errorText(error),
      });
      send({ type: "done" });
      return;
    }
    var seen = {};
    var list = registered.map(function (test) {
      var id = veo.slug(test.name);
      if (seen[id]) id = id + "-" + (seen[id] += 1);
      else seen[id] = 1;
      return { id: id, name: test.name, hidden: test.hidden };
    });
    if (request.discover) send({ type: "discovered", tests: list });
    var deadline = performance.now() + (request.suiteTimeoutMs || 10000);
    for (var i = 0; i < registered.length; i++) {
      var test = registered[i];
      var id = list[i].id;
      if (request.only === "visible" && test.hidden) continue;
      if (performance.now() > deadline) {
        send({
          type: "test-result",
          id: id,
          passed: false,
          message: "Not run: the tests ran out of time.",
        });
        continue;
      }
      send({ type: "test-start", id: id });
      var started = performance.now();
      var result;
      try {
        renderErrors = [];
        if (boot.kind === "react") mountApp();
        await race(Promise.resolve().then(test.fn), request.timeoutMs || 2000);
        await settle();
        if (renderErrors.length) throw renderErrors[0];
        result = { passed: true };
      } catch (error) {
        var place = where(error);
        result = {
          passed: false,
          message: veo.errorText(error),
          file: place && place.file,
          line: place && place.line,
        };
      }
      result.type = "test-result";
      result.id = id;
      result.ms = Math.round(performance.now() - started);
      send(result);
    }
    if (boot.kind === "react") {
      try {
        mountApp();
      } catch (error) {
        /* reported while the tests ran */
      }
    }
    send({ type: "done" });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== parentWindow) return;
    var data = event.data;
    if (!data || data.nonce !== boot.nonce) return;
    if (data.type === "run-tests") runTests(data);
    else if (data.type === "css") {
      var style = document.getElementById("__veo_css");
      if (style) style.textContent = String(data.css || "");
    }
  });

  /** Called by the last script of the page once the learner's code ran. */
  window.__veoStart = function () {
    if (boot.kind === "react") {
      try {
        mountApp();
      } catch (error) {
        var place = where(error);
        send({
          type: "error",
          message: veo.errorText(error),
          file: place && place.file,
          line: place && place.line,
        });
      }
    }
    send({ type: "ready" });
  };
})();
