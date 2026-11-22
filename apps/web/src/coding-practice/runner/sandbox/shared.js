/*
 * Helpers shared by the sandboxed worker and page frame. Loaded as text and
 * run inside the sandbox (opaque origin), so it is plain JavaScript with no
 * imports. Defines `self.__veo`.
 */
(function () {
  "use strict";
  var scope = typeof self !== "undefined" ? self : globalThis;
  var nativeSetTimeout = scope.setTimeout.bind(scope);
  var MAX_TEXT = 500;

  function truncate(text) {
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + "…" : text;
  }

  /** Equality for test answers: deep, NaN equals NaN, optional tolerance. */
  function equal(actual, expected, approx, seen) {
    if (typeof actual === "number" && typeof expected === "number") {
      if (Number.isNaN(actual) && Number.isNaN(expected)) return true;
      if (approx)
        return actual === expected || Math.abs(actual - expected) <= 1e-6;
      return actual === expected;
    }
    if (actual === expected) return true;
    if (
      typeof actual !== "object" ||
      typeof expected !== "object" ||
      actual === null ||
      expected === null
    )
      return false;
    if (Array.isArray(actual) !== Array.isArray(expected)) return false;
    seen = seen || [];
    for (var s = 0; s < seen.length; s++) {
      if (seen[s][0] === actual && seen[s][1] === expected) return true;
    }
    seen.push([actual, expected]);
    if (actual instanceof Date || expected instanceof Date) {
      return (
        actual instanceof Date &&
        expected instanceof Date &&
        actual.getTime() === expected.getTime()
      );
    }
    if (Array.isArray(actual)) {
      if (actual.length !== expected.length) return false;
      for (var i = 0; i < actual.length; i++) {
        if (!equal(actual[i], expected[i], approx, seen)) return false;
      }
      return true;
    }
    var actualKeys = Object.keys(actual);
    var expectedKeys = Object.keys(expected);
    if (actualKeys.length !== expectedKeys.length) return false;
    for (var k = 0; k < actualKeys.length; k++) {
      var key = actualKeys[k];
      if (!Object.prototype.hasOwnProperty.call(expected, key)) return false;
      if (!equal(actual[key], expected[key], approx, seen)) return false;
    }
    return true;
  }

  /** A value as a learner would write it: 5, "a", [1, 2], undefined. */
  function describe(value) {
    if (typeof value === "string") return truncate(JSON.stringify(value));
    if (value === undefined) return "undefined";
    if (typeof value === "number")
      return Object.is(value, -0) ? "-0" : String(value);
    if (typeof value === "bigint") return value + "n";
    if (typeof value === "function")
      return "[Function " + (value.name || "anonymous") + "]";
    if (typeof value === "symbol") return value.toString();
    var seen = new WeakSet();
    try {
      var text = JSON.stringify(value, function (_key, item) {
        if (item === undefined) return "\u0000u";
        if (typeof item === "number" && !Number.isFinite(item))
          return "\u0000n" + String(item);
        if (typeof item === "bigint") return "\u0000n" + item + "n";
        if (typeof item === "function")
          return "\u0000f" + (item.name || "anonymous");
        if (item && typeof item === "object") {
          if (seen.has(item)) return "\u0000c";
          seen.add(item);
        }
        return item;
      });
      if (text === undefined) return String(value);
      text = text
        .replace(/"\\u0000u"/g, "undefined")
        .replace(/"\\u0000n([^"]*)"/g, "$1")
        .replace(/"\\u0000f([^"]*)"/g, "[Function $1]")
        .replace(/"\\u0000c"/g, "[Circular]");
      return truncate(text);
    } catch (error) {
      return truncate(String(value));
    }
  }

  function formatArgs(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      parts.push(typeof args[i] === "string" ? args[i] : describe(args[i]));
    }
    return parts.join(" ").slice(0, 2000);
  }

  /** `console` that reports to `post`, and to the real console too. */
  function makeConsole(post, original) {
    var levels = ["log", "info", "warn", "error", "debug"];
    var bridge = {};
    levels.forEach(function (level) {
      bridge[level] = function () {
        post({ type: "console", level: level, text: formatArgs(arguments) });
      };
    });
    bridge.table = bridge.log;
    bridge.dir = bridge.log;
    bridge.trace = bridge.log;
    bridge.assert = function (condition) {
      if (!condition)
        post({
          type: "console",
          level: "error",
          text:
            "Assertion failed" +
            (arguments.length > 1
              ? ": " + formatArgs(Array.prototype.slice.call(arguments, 1))
              : ""),
        });
    };
    bridge.group =
      bridge.groupEnd =
      bridge.time =
      bridge.timeEnd =
        function () {};
    bridge.clear = function () {};
    void original;
    return bridge;
  }

  /**
   * `fetch` that answers the exercise's mock routes and nothing else. The
   * sandbox has no network (its CSP blocks it); this keeps lessons that
   * teach fetch() working, offline included.
   */
  function makeMockFetch(mocks) {
    return function fetch(input, init) {
      var method = String(
        (init && init.method) || (input && input.method) || "GET",
      ).toUpperCase();
      var url =
        typeof input === "string"
          ? input
          : (input && input.url) || String(input);
      var path;
      try {
        path = new URL(url, "http://practice.local").pathname;
      } catch (error) {
        path = url;
      }
      var route = null;
      for (var i = 0; i < mocks.length; i++) {
        if ((mocks[i].method || "GET") === method && mocks[i].path === path) {
          route = mocks[i];
          break;
        }
      }
      if (!route) {
        return Promise.reject(
          new TypeError(
            "Network is not available in practice. " +
              method +
              " " +
              path +
              " is not one of this exercise's routes.",
          ),
        );
      }
      // No delay: answer at once (timers in this off-screen frame are slowed).
      var later = route.delayMs
        ? nativeSetTimeout
        : function (fn) {
            Promise.resolve().then(fn);
          };
      return new Promise(function (resolve) {
        later(function () {
          var status = route.status || 200;
          var empty = status === 204 || status === 205 || status === 304;
          resolve(
            new Response(
              empty || route.body === undefined
                ? null
                : JSON.stringify(route.body),
              {
                status: status,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }, route.delayMs || 0);
      });
    };
  }

  function dirname(path) {
    var index = path.lastIndexOf("/");
    return index < 0 ? "" : path.slice(0, index);
  }

  function joinPath(base, spec) {
    var parts = (base ? base.split("/") : []).concat(spec.split("/"));
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === "" || parts[i] === ".") continue;
      if (parts[i] === "..") out.pop();
      else out.push(parts[i]);
    }
    return out.join("/");
  }

  /**
   * A tiny CommonJS loader over the exercise's files. `builtins` maps names
   * like "react" to ready modules. Each call starts with an empty cache, so
   * every evaluation gets fresh top-level variables.
   */
  function makeModules(files, builtins) {
    var cache = {};
    function resolve(from, spec) {
      if (Object.prototype.hasOwnProperty.call(builtins, spec)) return spec;
      var base = spec.charAt(0) === "." ? joinPath(dirname(from), spec) : spec;
      var candidates = [
        base,
        base + ".js",
        base + ".jsx",
        base + ".ts",
        base + ".tsx",
        base + "/index.js",
        base + "/index.jsx",
      ];
      for (var i = 0; i < candidates.length; i++) {
        if (Object.prototype.hasOwnProperty.call(files, candidates[i]))
          return candidates[i];
      }
      throw new Error("Cannot find module '" + spec + "' from " + from);
    }
    function load(path, suffix) {
      if (Object.prototype.hasOwnProperty.call(builtins, path))
        return builtins[path];
      if (cache[path]) return cache[path].exports;
      var source = files[path];
      if (source === undefined)
        throw new Error("Cannot find module '" + path + "'");
      var module = { exports: {} };
      cache[path] = module;
      var run = new Function(
        "require",
        "module",
        "exports",
        source + "\n" + (suffix || "") + "\n//# sourceURL=" + path,
      );
      run(
        function (spec) {
          return load(resolve(path, spec));
        },
        module,
        module.exports,
      );
      return module.exports;
    }
    return { load: load };
  }

  /** Lines `new Function` adds before the body, to report learner lines. */
  var functionLineOffset = (function () {
    try {
      new Function("throw new Error('probe')\n//# sourceURL=__veo_probe.js")();
    } catch (error) {
      var match = /__veo_probe\.js:(\d+)/.exec(String(error && error.stack));
      if (match) return Number(match[1]) - 1;
    }
    return 0;
  })();

  /** The learner file and line an error came from, when its stack says. */
  function locate(error, paths) {
    var stack = String((error && error.stack) || "");
    for (var i = 0; i < paths.length; i++) {
      var escaped = paths[i].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      var match = new RegExp(escaped + ":(\\d+)(?::(\\d+))?").exec(stack);
      if (match) {
        return {
          file: paths[i],
          line: Math.max(1, Number(match[1]) - functionLineOffset),
          column: match[2] ? Number(match[2]) : undefined,
        };
      }
    }
    return null;
  }

  function errorText(error) {
    if (error && typeof error === "object" && "message" in error) {
      var name = error.name && error.name !== "Error" ? error.name + ": " : "";
      return truncate(name + String(error.message));
    }
    return truncate("Thrown: " + describe(error));
  }

  function slug(name) {
    return (
      String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "test"
    );
  }

  scope.__veo = {
    equal: equal,
    describe: describe,
    makeConsole: makeConsole,
    makeMockFetch: makeMockFetch,
    makeModules: makeModules,
    locate: locate,
    errorText: errorText,
    slug: slug,
    nativeSetTimeout: nativeSetTimeout,
  };
})();
