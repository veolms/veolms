/*
 * The runner frame's script. The frame is `sandbox="allow-scripts"` with
 * no allow-same-origin, so it and the workers it starts have an opaque
 * origin: learner code never runs where the site's session lives.
 *
 * It never runs learner code itself. It starts a classic worker from a
 * blob: URL per run (a module worker from blob: fails in Chrome), watches
 * each test's time and terminates the worker when a test runs too long,
 * then starts a fresh one for the tests that remain.
 */
(function () {
  "use strict";
  var nonce = window.__veoBroker.nonce;
  var parentWindow = window.parent;
  var LOAD_BUDGET_MS = 3000;
  var active = null;

  function send(message) {
    message.nonce = nonce;
    parentWindow.postMessage(message, "*");
  }

  function finish(run) {
    if (!run) return;
    clearTimeout(run.timer);
    try {
      if (run.worker) run.worker.terminate();
    } catch (error) {
      /* already gone */
    }
    URL.revokeObjectURL(run.url);
    if (active === run) active = null;
  }

  function markRest(run, from, message) {
    for (var i = from; i < run.job.cases.length; i++) {
      send({
        type: "test-result",
        runId: run.runId,
        index: i,
        id: run.job.cases[i].id,
        passed: false,
        message: message,
      });
    }
  }

  function onTimeout(run) {
    if (active !== run) return;
    var current = run.current;
    try {
      run.worker.terminate();
    } catch (error) {
      /* already gone */
    }
    var outOfTime = Date.now() >= run.deadline;
    if (!current) {
      send({
        type: "fatal",
        runId: run.runId,
        message:
          "Your code did not finish loading within 3 s. Is there a loop at the top level that never ends?",
      });
      send({ type: "done", runId: run.runId });
      finish(run);
      return;
    }
    send({
      type: "test-result",
      runId: run.runId,
      index: current.index,
      id: current.id,
      passed: false,
      timedOut: true,
      message: outOfTime
        ? "Stopped: the tests ran out of time."
        : "Timed out after " +
          current.timeoutMs / 1000 +
          " s. Is there a loop that never ends?",
      ms: current.timeoutMs,
    });
    var next = current.index + 1;
    if (!outOfTime && next < run.job.cases.length) {
      spawn(run, next);
      return;
    }
    markRest(run, next, "Not run: the tests ran out of time.");
    send({ type: "done", runId: run.runId });
    finish(run);
  }

  function spawn(run, startIndex) {
    var worker;
    try {
      worker = new Worker(run.url);
    } catch (error) {
      send({
        type: "fatal",
        runId: run.runId,
        message:
          "Your browser could not start the code runner. Reload the page and try again.",
      });
      send({ type: "done", runId: run.runId });
      finish(run);
      return;
    }
    run.worker = worker;
    run.current = null;
    clearTimeout(run.timer);
    run.timer = setTimeout(function () {
      onTimeout(run);
    }, LOAD_BUDGET_MS);
    worker.onmessage = function (event) {
      if (active !== run || run.worker !== worker) return;
      var message = event.data || {};
      if (message.type === "loaded") {
        clearTimeout(run.timer);
        return;
      }
      // A Node.js suite names its tests when it loads them: they are the
      // ones a stopped worker is restarted for.
      if (message.type === "discovered" && run.job.kind === "node") {
        run.job.cases = (message.tests || []).filter(function (test) {
          return run.job.only !== "visible" || !test.hidden;
        });
      }
      if (message.type === "test-start") {
        run.current = message;
        clearTimeout(run.timer);
        var budget = Math.max(
          50,
          Math.min(message.timeoutMs + 300, run.deadline - Date.now()),
        );
        run.timer = setTimeout(function () {
          onTimeout(run);
        }, budget);
      } else if (message.type === "test-result") {
        clearTimeout(run.timer);
        run.current = null;
      }
      message.runId = run.runId;
      send(message);
      if (message.type === "done" || message.type === "fatal") {
        if (message.type === "fatal") send({ type: "done", runId: run.runId });
        finish(run);
      }
    };
    worker.onerror = function (event) {
      if (active !== run || run.worker !== worker) return;
      if (event.preventDefault) event.preventDefault();
      send({
        type: "fatal",
        runId: run.runId,
        message:
          event.message ||
          "The code runner stopped. Your code may use too much memory.",
      });
      send({ type: "done", runId: run.runId });
      finish(run);
    };
    var job = Object.assign({}, run.job, {
      startIndex: startIndex,
      respawned: startIndex > 0,
    });
    worker.postMessage(job);
  }

  window.addEventListener("message", function (event) {
    if (event.source !== parentWindow) return;
    var data = event.data;
    if (!data || data.nonce !== nonce) return;
    if (data.type === "run") {
      finish(active);
      var run = {
        runId: data.runId,
        job: data.job,
        url: URL.createObjectURL(
          new Blob([data.workerSource], { type: "text/javascript" }),
        ),
        deadline: Date.now() + (data.job.suiteTimeoutMs || 10000),
        timer: 0,
        worker: null,
        current: null,
      };
      active = run;
      spawn(run, 0);
    } else if (
      data.type === "cancel" &&
      active &&
      active.runId === data.runId
    ) {
      finish(active);
    }
  });

  send({ type: "broker-ready" });
})();
