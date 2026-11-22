/*
 * Runs a JavaScript function exercise's test cases. Started by the broker
 * frame from a blob: URL, so it has the frame's opaque origin: no cookies,
 * no storage of the site. `shared.js` is prepended to this file.
 *
 * Every test evaluates the learner's code again (fresh top-level
 * variables), clones its arguments, and has its timers cleared before the
 * next test starts, so one test cannot leak into another. An infinite loop
 * is stopped by the broker, which terminates this worker.
 */
(function () {
  "use strict";
  var veo = self.__veo;
  var nativeSetTimeout = self.setTimeout.bind(self);
  var nativeClearTimeout = self.clearTimeout.bind(self);
  var nativeSetInterval = self.setInterval.bind(self);
  var nativeClearInterval = self.clearInterval.bind(self);

  var current = null;
  var timers = new Map();
  var errorsByTest = {};
  var consoleMuted = false;

  function post(message) {
    self.postMessage(message);
  }

  function record(owner, error) {
    if (owner && errorsByTest[owner]) errorsByTest[owner].push(error);
  }

  function track(native, clear) {
    return function (callback, delay) {
      var owner = current;
      var args = Array.prototype.slice.call(arguments, 2);
      var id = native(function () {
        if (native === nativeSetTimeout) timers.delete(id);
        var previous = current;
        current = owner;
        try {
          if (typeof callback === "function") callback.apply(undefined, args);
        } catch (error) {
          record(owner, error);
        } finally {
          current = previous;
        }
      }, delay);
      timers.set(id, { owner: owner, clear: clear });
      return id;
    };
  }

  self.setTimeout = track(nativeSetTimeout, nativeClearTimeout);
  self.setInterval = track(nativeSetInterval, nativeClearInterval);
  self.clearTimeout = function (id) {
    timers.delete(id);
    nativeClearTimeout(id);
  };
  self.clearInterval = function (id) {
    timers.delete(id);
    nativeClearInterval(id);
  };

  function clearTimersOf(owner) {
    timers.forEach(function (timer, id) {
      if (timer.owner === owner) {
        timer.clear(id);
        timers.delete(id);
      }
    });
  }

  self.addEventListener("unhandledrejection", function (event) {
    record(current, event.reason);
    event.preventDefault();
  });

  var bridge = veo.makeConsole(function (message) {
    if (!consoleMuted) post(message);
  });
  self.console = Object.assign({}, self.console, bridge);

  // The frame's CSP already blocks the network; these make the reason clear.
  self.XMLHttpRequest = undefined;
  self.WebSocket = undefined;
  self.EventSource = undefined;
  self.importScripts = function () {
    throw new Error("importScripts is not available in practice.");
  };

  function clone(value) {
    try {
      return structuredClone(value);
    } catch (error) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  // needFunction false: free practice (no tests) only runs the code.
  function loadEntry(job, needFunction) {
    var name = job.entry.name;
    var suffix = name
      ? ";try{module.exports.__veoEntry=typeof " +
        name +
        "!=='undefined'?" +
        name +
        ":undefined}catch(__e){}"
      : "";
    var modules = veo.makeModules(job.files, {});
    var exported = modules.load(job.entry.file, suffix);
    var fn =
      exported &&
      (exported.__veoEntry ||
        (name && exported[name]) ||
        (typeof exported === "function" ? exported : exported.default));
    if (needFunction === false) return null;
    if (typeof fn !== "function") {
      throw new Error(
        "Could not find the function " +
          (name || "to test") +
          ". Keep its name as in the starter code.",
      );
    }
    return fn;
  }

  function race(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = nativeSetTimeout(function () {
        reject(
          new Error(
            "The returned promise did not settle within " + ms / 1000 + " s.",
          ),
        );
      }, ms);
      promise.then(
        function (value) {
          nativeClearTimeout(timer);
          resolve(value);
        },
        function (error) {
          nativeClearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  function macrotask() {
    return new Promise(function (resolve) {
      nativeSetTimeout(resolve, 0);
    });
  }

  async function runCase(job, test, index) {
    var timeoutMs = test.timeoutMs || job.defaultTimeoutMs;
    post({
      type: "test-start",
      index: index,
      id: test.id,
      timeoutMs: timeoutMs,
    });
    current = test.id;
    errorsByTest[test.id] = [];
    var started = performance.now();
    var result;
    try {
      consoleMuted = true;
      var fn = loadEntry(job);
      consoleMuted = false;
      var value = fn.apply(undefined, clone(test.args || []));
      if (value && typeof value.then === "function")
        value = await race(value, timeoutMs);
      await macrotask();
      if (errorsByTest[test.id].length) throw errorsByTest[test.id][0];
      var collected;
      if (job.collect) {
        try {
          collected = JSON.parse(
            JSON.stringify(value === undefined ? null : value),
          );
        } catch (error) {
          collected = null;
        }
      }
      if (job.collect) {
        result = { passed: true, value: collected };
      } else if (veo.equal(value, test.expected, test.compare === "approx")) {
        result = { passed: true };
      } else {
        result = {
          passed: false,
          message:
            "Expected " +
            veo.describe(test.expected) +
            ", got " +
            veo.describe(value) +
            ".",
          actual: veo.describe(value),
        };
      }
    } catch (error) {
      consoleMuted = false;
      var where = veo.locate(error, job.paths);
      result = {
        passed: false,
        message: veo.errorText(error),
        file: where && where.file,
        line: where && where.line,
      };
    }
    clearTimersOf(test.id);
    current = null;
    result.type = "test-result";
    result.index = index;
    result.id = test.id;
    result.ms = Math.round(performance.now() - started);
    post(result);
  }

  self.onmessage = async function (event) {
    var job = event.data;
    if (!job || !Array.isArray(job.cases)) return;
    self.fetch = veo.makeMockFetch(job.mocks || []);
    // One plain load first: top-level console output and syntax errors show
    // once, not once per test.
    try {
      consoleMuted = Boolean(job.respawned);
      loadEntry(job, job.cases.length > 0);
      consoleMuted = false;
    } catch (error) {
      consoleMuted = false;
      var where = veo.locate(error, job.paths);
      post({
        type: "fatal",
        message: veo.errorText(error),
        syntax: error instanceof SyntaxError,
        file: where && where.file,
        line: where && where.line,
      });
      return;
    }
    post({ type: "loaded" });
    for (var i = job.startIndex || 0; i < job.cases.length; i++) {
      await runCase(job, job.cases[i], i);
    }
    post({ type: "done" });
  };
})();
