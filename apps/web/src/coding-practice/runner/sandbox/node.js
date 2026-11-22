/*
 * Runs a Node.js exercise in the broker's worker (opaque origin, no
 * network, no storage of the site). `shared.js` is prepended to this file.
 *
 * It is Node as far as practice needs: CommonJS modules (require,
 * module.exports, __dirname; import/export is compiled to these), and the
 * built-in modules a backend course uses without a network: events, fs
 * (in memory, from the exercise's files), path, util, assert, os, process,
 * timers, buffer, url, querystring, string_decoder and crypto's random
 * helpers. Modules that need a real machine (http, net, child_process…)
 * say so when required.
 *
 * Every test gets a fresh world: modules are evaluated again, the files
 * are the exercise's again, process.env and argv are reset, and the
 * test's timers are cleared when it ends.
 */
(function () {
  "use strict";
  var veo = self.__veo;
  var nativeSetTimeout = self.setTimeout.bind(self);
  var nativeClearTimeout = self.clearTimeout.bind(self);
  var nativeSetInterval = self.setInterval.bind(self);
  var nativeClearInterval = self.clearInterval.bind(self);

  function post(message) {
    self.postMessage(message);
  }

  var consoleMuted = false;
  var bridge = veo.makeConsole(function (message) {
    if (!consoleMuted) post(message);
  });

  self.XMLHttpRequest = undefined;
  self.WebSocket = undefined;
  self.EventSource = undefined;
  self.importScripts = function () {
    throw new Error("importScripts is not available in Node.js.");
  };

  /* ------------------------------------------------------------ helpers */

  function fail(message) {
    var error = new Error(message);
    error.name = "AssertionError";
    error.code = "ERR_ASSERTION";
    throw error;
  }

  function nodeError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function normalizePath(path) {
    var absolute = path.charAt(0) === "/";
    var parts = path.split("/");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (out.length && out[out.length - 1] !== "..") out.pop();
        else if (!absolute) out.push("..");
      } else out.push(part);
    }
    var joined = out.join("/");
    if (absolute) return "/" + joined;
    return joined || ".";
  }

  /* --------------------------------------------------------------- path */

  var pathModule = (function () {
    function resolve() {
      var resolved = "";
      for (var i = arguments.length - 1; i >= 0; i--) {
        var segment = String(arguments[i]);
        if (!segment) continue;
        resolved = segment + (resolved ? "/" + resolved : "");
        if (segment.charAt(0) === "/") break;
      }
      if (resolved.charAt(0) !== "/") resolved = "/" + resolved;
      var normal = normalizePath(resolved);
      return normal.length > 1 && normal.slice(-1) === "/"
        ? normal.slice(0, -1)
        : normal;
    }
    function basename(path, ext) {
      var base = String(path).replace(/\/+$/, "");
      base = base.slice(base.lastIndexOf("/") + 1);
      if (ext && base.slice(-ext.length) === ext && base !== ext)
        base = base.slice(0, -ext.length);
      return base;
    }
    function dirname(path) {
      var text = String(path).replace(/\/+$/, "");
      var index = text.lastIndexOf("/");
      if (index < 0) return ".";
      if (index === 0) return "/";
      return text.slice(0, index);
    }
    function extname(path) {
      var base = basename(path);
      var index = base.lastIndexOf(".");
      return index <= 0 ? "" : base.slice(index);
    }
    var api = {
      sep: "/",
      delimiter: ":",
      join: function () {
        var parts = Array.prototype.slice.call(arguments).filter(Boolean);
        return parts.length ? normalizePath(parts.join("/")) : ".";
      },
      resolve: resolve,
      normalize: function (path) {
        return normalizePath(String(path));
      },
      isAbsolute: function (path) {
        return String(path).charAt(0) === "/";
      },
      basename: basename,
      dirname: dirname,
      extname: extname,
      relative: function (from, to) {
        var a = resolve(from).split("/").filter(Boolean);
        var b = resolve(to).split("/").filter(Boolean);
        var i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        return a
          .slice(i)
          .map(function () {
            return "..";
          })
          .concat(b.slice(i))
          .join("/");
      },
      parse: function (path) {
        var base = basename(path);
        var ext = extname(path);
        var dir = dirname(path);
        return {
          root: String(path).charAt(0) === "/" ? "/" : "",
          dir: dir === "." ? "" : dir,
          base: base,
          ext: ext,
          name: ext ? base.slice(0, -ext.length) : base,
        };
      },
      format: function (parts) {
        var dir = parts.dir || parts.root || "";
        var base = parts.base || (parts.name || "") + (parts.ext || "");
        return dir
          ? dir.slice(-1) === "/"
            ? dir + base
            : dir + "/" + base
          : base;
      },
    };
    api.posix = api;
    return api;
  })();

  /* ------------------------------------------------------------- events */

  function EventEmitter() {
    this._events = Object.create(null);
    this._maxListeners = 10;
  }
  EventEmitter.defaultMaxListeners = 10;
  EventEmitter.prototype._list = function (name) {
    if (!this._events) this._events = Object.create(null);
    return this._events[name] || (this._events[name] = []);
  };
  EventEmitter.prototype.on = EventEmitter.prototype.addListener = function (
    name,
    listener,
  ) {
    if (typeof listener !== "function")
      throw new TypeError('The "listener" argument must be of type function.');
    if (this._events && this._events.newListener && name !== "newListener")
      this.emit("newListener", name, listener);
    this._list(name).push({ fn: listener, once: false });
    return this;
  };
  EventEmitter.prototype.prependListener = function (name, listener) {
    this._list(name).unshift({ fn: listener, once: false });
    return this;
  };
  EventEmitter.prototype.once = function (name, listener) {
    if (typeof listener !== "function")
      throw new TypeError('The "listener" argument must be of type function.');
    this._list(name).push({ fn: listener, once: true });
    return this;
  };
  EventEmitter.prototype.prependOnceListener = function (name, listener) {
    this._list(name).unshift({ fn: listener, once: true });
    return this;
  };
  EventEmitter.prototype.off = EventEmitter.prototype.removeListener =
    function (name, listener) {
      var list = this._events && this._events[name];
      if (!list) return this;
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].fn === listener) {
          list.splice(i, 1);
          break;
        }
      }
      if (!list.length) delete this._events[name];
      return this;
    };
  EventEmitter.prototype.removeAllListeners = function (name) {
    if (!this._events) return this;
    if (name === undefined) this._events = Object.create(null);
    else delete this._events[name];
    return this;
  };
  EventEmitter.prototype.emit = function (name) {
    var list = this._events && this._events[name];
    var args = Array.prototype.slice.call(arguments, 1);
    if (!list || !list.length) {
      if (name === "error") {
        var error = args[0];
        throw error instanceof Error
          ? error
          : new Error("Unhandled error. (" + veo.describe(error) + ")");
      }
      return false;
    }
    var copy = list.slice();
    for (var i = 0; i < copy.length; i++) {
      if (copy[i].once) this.removeListener(name, copy[i].fn);
      copy[i].fn.apply(this, args);
    }
    return true;
  };
  EventEmitter.prototype.listenerCount = function (name) {
    var list = this._events && this._events[name];
    return list ? list.length : 0;
  };
  EventEmitter.prototype.listeners = function (name) {
    var list = (this._events && this._events[name]) || [];
    return list.map(function (entry) {
      return entry.fn;
    });
  };
  EventEmitter.prototype.rawListeners = EventEmitter.prototype.listeners;
  EventEmitter.prototype.eventNames = function () {
    return this._events ? Object.keys(this._events) : [];
  };
  EventEmitter.prototype.setMaxListeners = function (count) {
    this._maxListeners = count;
    return this;
  };
  EventEmitter.prototype.getMaxListeners = function () {
    return this._maxListeners;
  };
  EventEmitter.EventEmitter = EventEmitter;
  EventEmitter.once = function (emitter, name) {
    return new Promise(function (resolve, reject) {
      function onError(error) {
        emitter.removeListener(name, onEvent);
        reject(error);
      }
      function onEvent() {
        if (name !== "error") emitter.removeListener("error", onError);
        resolve(Array.prototype.slice.call(arguments));
      }
      emitter.once(name, onEvent);
      if (name !== "error") emitter.once("error", onError);
    });
  };
  EventEmitter.listenerCount = function (emitter, name) {
    return emitter.listenerCount(name);
  };

  /* ------------------------------------------------------------- buffer */

  var encoder = new TextEncoder();
  var decoder = new TextDecoder();
  function Buffer() {
    throw new TypeError("Use Buffer.from() or Buffer.alloc().");
  }
  function makeBuffer(bytes) {
    Object.setPrototypeOf(bytes, Buffer.prototype);
    return bytes;
  }
  Buffer.prototype = Object.create(Uint8Array.prototype);
  Buffer.prototype.constructor = Buffer;
  Buffer.from = function (value, encoding) {
    if (typeof value === "string") {
      if (encoding === "base64") {
        var binary = atob(value);
        var out = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return makeBuffer(out);
      }
      if (encoding === "hex") {
        var hex = new Uint8Array(value.length >> 1);
        for (var j = 0; j < hex.length; j++)
          hex[j] = parseInt(value.substr(j * 2, 2), 16);
        return makeBuffer(hex);
      }
      return makeBuffer(encoder.encode(value));
    }
    if (value instanceof ArrayBuffer) return makeBuffer(new Uint8Array(value));
    return makeBuffer(Uint8Array.from(value || []));
  };
  Buffer.alloc = function (size, fill) {
    var bytes = new Uint8Array(size);
    if (fill !== undefined) bytes.fill(typeof fill === "number" ? fill : 0);
    return makeBuffer(bytes);
  };
  Buffer.isBuffer = function (value) {
    return value instanceof Buffer;
  };
  Buffer.byteLength = function (value) {
    return typeof value === "string"
      ? encoder.encode(value).length
      : value.byteLength;
  };
  Buffer.concat = function (list) {
    var total = list.reduce(function (sum, item) {
      return sum + item.length;
    }, 0);
    var out = new Uint8Array(total);
    var offset = 0;
    list.forEach(function (item) {
      out.set(item, offset);
      offset += item.length;
    });
    return makeBuffer(out);
  };
  Buffer.prototype.toString = function (encoding) {
    if (encoding === "base64") {
      var binary = "";
      for (var i = 0; i < this.length; i++)
        binary += String.fromCharCode(this[i]);
      return btoa(binary);
    }
    if (encoding === "hex") {
      var hex = "";
      for (var j = 0; j < this.length; j++)
        hex += (this[j] < 16 ? "0" : "") + this[j].toString(16);
      return hex;
    }
    return decoder.decode(this);
  };
  Buffer.prototype.toJSON = function () {
    return { type: "Buffer", data: Array.from(this) };
  };
  Buffer.prototype.equals = function (other) {
    if (this.length !== other.length) return false;
    for (var i = 0; i < this.length; i++)
      if (this[i] !== other[i]) return false;
    return true;
  };

  /* --------------------------------------------------------------- util */

  function format(first) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof first !== "string") return args.map(inspect).join(" ");
    var index = 1;
    var text = first.replace(/%[sdifjoO%]/g, function (token) {
      if (token === "%%") return "%";
      if (index >= args.length) return token;
      var value = args[index++];
      switch (token) {
        case "%s":
          return typeof value === "string" ? value : inspect(value);
        case "%d":
        case "%i":
          return String(parseInt(value, 10));
        case "%f":
          return String(parseFloat(value));
        case "%j":
          return JSON.stringify(value);
        default:
          return inspect(value);
      }
    });
    for (; index < args.length; index++)
      text +=
        " " +
        (typeof args[index] === "string" ? args[index] : inspect(args[index]));
    return text;
  }
  function inspect(value) {
    return typeof value === "string" ? "'" + value + "'" : veo.describe(value);
  }
  var utilModule = {
    format: format,
    inspect: inspect,
    isDeepStrictEqual: function (a, b) {
      return veo.equal(a, b, false);
    },
    promisify: function (fn) {
      return function () {
        var self_ = this;
        var args = Array.prototype.slice.call(arguments);
        return new Promise(function (resolve, reject) {
          fn.apply(
            self_,
            args.concat(function (error, value) {
              if (error) reject(error);
              else resolve(value);
            }),
          );
        });
      };
    },
    callbackify: function (fn) {
      return function () {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        fn.apply(this, args).then(
          function (value) {
            callback(null, value);
          },
          function (error) {
            callback(error);
          },
        );
      };
    },
    inherits: function (child, parent) {
      Object.setPrototypeOf(child.prototype, parent.prototype);
      Object.setPrototypeOf(child, parent);
    },
    deprecate: function (fn) {
      return fn;
    },
    types: {
      isPromise: function (value) {
        return value instanceof Promise;
      },
      isDate: function (value) {
        return value instanceof Date;
      },
      isRegExp: function (value) {
        return value instanceof RegExp;
      },
    },
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
  };

  /* ------------------------------------------------------------- assert */

  function assertModule(value, message) {
    if (!value) fail(message || "The expression evaluated to a falsy value.");
  }
  assertModule.ok = assertModule;
  assertModule.equal = function (actual, expected, message) {
    if (actual != expected)
      fail(
        message ||
          "Expected " + inspect(expected) + ", got " + inspect(actual) + ".",
      );
  };
  assertModule.notEqual = function (actual, expected, message) {
    if (actual == expected)
      fail(message || "Expected anything but " + inspect(expected) + ".");
  };
  assertModule.strictEqual = function (actual, expected, message) {
    if (!Object.is(actual, expected))
      fail(
        message ||
          "Expected " + inspect(expected) + ", got " + inspect(actual) + ".",
      );
  };
  assertModule.notStrictEqual = function (actual, expected, message) {
    if (Object.is(actual, expected))
      fail(message || "Expected anything but " + inspect(expected) + ".");
  };
  assertModule.deepEqual = assertModule.deepStrictEqual = function (
    actual,
    expected,
    message,
  ) {
    if (!veo.equal(actual, expected, false))
      fail(
        message ||
          "Expected " + inspect(expected) + ", got " + inspect(actual) + ".",
      );
  };
  assertModule.notDeepEqual = assertModule.notDeepStrictEqual = function (
    actual,
    expected,
    message,
  ) {
    if (veo.equal(actual, expected, false))
      fail(message || "Expected anything but " + inspect(expected) + ".");
  };
  function matchesError(error, expected) {
    if (!expected) return true;
    if (typeof expected === "function")
      return expected.prototype !== undefined && error instanceof expected;
    if (expected instanceof RegExp)
      return expected.test(String(error && error.message));
    if (typeof expected === "object")
      return Object.keys(expected).every(function (key) {
        return veo.equal(error && error[key], expected[key], false);
      });
    return true;
  }
  assertModule.throws = function (fn, expected, message) {
    try {
      fn();
    } catch (error) {
      if (!matchesError(error, expected))
        fail(
          message ||
            "It threw, but not the expected error: " + veo.errorText(error),
        );
      return;
    }
    fail(
      typeof expected === "string"
        ? expected
        : message || "Expected it to throw.",
    );
  };
  assertModule.doesNotThrow = function (fn, message) {
    try {
      fn();
    } catch (error) {
      fail(message || "Expected it not to throw: " + veo.errorText(error));
    }
  };
  assertModule.rejects = function (promiseOrFn, expected, message) {
    var promise =
      typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
    return Promise.resolve(promise).then(
      function () {
        fail(message || "Expected the promise to reject.");
      },
      function (error) {
        if (!matchesError(error, expected))
          fail(
            message ||
              "It rejected, but not with the expected error: " +
                veo.errorText(error),
          );
      },
    );
  };
  assertModule.doesNotReject = function (promiseOrFn, message) {
    var promise =
      typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
    return Promise.resolve(promise).then(undefined, function (error) {
      fail(message || "Expected it not to reject: " + veo.errorText(error));
    });
  };
  assertModule.match = function (text, pattern, message) {
    if (!pattern.test(String(text)))
      fail(
        message || "Expected " + inspect(text) + " to match " + pattern + ".",
      );
  };
  assertModule.fail = function (message) {
    fail(message || "Failed.");
  };
  assertModule.strict = assertModule;
  assertModule.AssertionError = Error;

  /* ------------------------------------------------- a fresh Node world */

  var unavailable = [
    "http",
    "https",
    "http2",
    "net",
    "tls",
    "dgram",
    "dns",
    "child_process",
    "cluster",
    "worker_threads",
    "inspector",
    "vm",
    "v8",
    "repl",
  ];

  /**
   * One world: files, modules, process and the timers made in it. `raw`
   * are the files as written (what fs reads); `code` the same files
   * compiled to CommonJS (what require runs).
   */
  function createWorld(job, argv) {
    var world = {
      errors: [],
      timers: new Map(),
      stdout: [],
      stderr: [],
      exitCode: undefined,
      capture: false,
    };

    // ---------------------------------------------------------- fs
    var files = new Map();
    var dirs = new Set(["/"]);
    function addDirs(path) {
      var dir = pathModule.dirname(path);
      while (dir && !dirs.has(dir)) {
        dirs.add(dir);
        dir = pathModule.dirname(dir);
      }
    }
    Object.keys(job.raw).forEach(function (path) {
      var full = "/" + path;
      files.set(full, String(job.raw[path]));
      addDirs(full);
    });
    function full(path) {
      if (path instanceof URL) path = path.pathname;
      return pathModule.resolve("/", String(path));
    }
    function encodeOut(text, options) {
      var encoding =
        typeof options === "string" ? options : options && options.encoding;
      return encoding ? text : Buffer.from(text);
    }
    function asText(data) {
      if (typeof data === "string") return data;
      if (data instanceof Uint8Array) return decoder.decode(data);
      return String(data);
    }
    function notFound(op, path) {
      return nodeError(
        "ENOENT",
        "ENOENT: no such file or directory, " + op + " '" + path + "'",
      );
    }
    function stat(path) {
      var at = full(path);
      if (files.has(at)) {
        var size = encoder.encode(files.get(at)).length;
        return {
          size: size,
          isFile: function () {
            return true;
          },
          isDirectory: function () {
            return false;
          },
          mtime: new Date(0),
        };
      }
      if (dirs.has(at))
        return {
          size: 0,
          isFile: function () {
            return false;
          },
          isDirectory: function () {
            return true;
          },
          mtime: new Date(0),
        };
      throw notFound("stat", path);
    }
    var fsSync = {
      existsSync: function (path) {
        var at = full(path);
        return files.has(at) || dirs.has(at);
      },
      readFileSync: function (path, options) {
        var at = full(path);
        if (dirs.has(at))
          throw nodeError(
            "EISDIR",
            "EISDIR: illegal operation on a directory, read",
          );
        if (!files.has(at)) throw notFound("open", path);
        return encodeOut(files.get(at), options);
      },
      writeFileSync: function (path, data) {
        var at = full(path);
        if (!dirs.has(pathModule.dirname(at))) throw notFound("open", path);
        files.set(at, asText(data));
      },
      appendFileSync: function (path, data) {
        var at = full(path);
        if (!dirs.has(pathModule.dirname(at))) throw notFound("open", path);
        files.set(at, (files.get(at) || "") + asText(data));
      },
      unlinkSync: function (path) {
        var at = full(path);
        if (!files.has(at)) throw notFound("unlink", path);
        files.delete(at);
      },
      renameSync: function (from, to) {
        var a = full(from);
        if (!files.has(a)) throw notFound("rename", from);
        var text = files.get(a);
        files.delete(a);
        files.set(full(to), text);
      },
      copyFileSync: function (from, to) {
        var a = full(from);
        if (!files.has(a)) throw notFound("copyfile", from);
        files.set(full(to), files.get(a));
      },
      mkdirSync: function (path, options) {
        var at = full(path);
        if (dirs.has(at)) {
          if (options && options.recursive) return undefined;
          throw nodeError(
            "EEXIST",
            "EEXIST: file already exists, mkdir '" + path + "'",
          );
        }
        if (!dirs.has(pathModule.dirname(at))) {
          if (!(options && options.recursive)) throw notFound("mkdir", path);
          addDirs(at + "/x");
        }
        dirs.add(at);
        return options && options.recursive ? at : undefined;
      },
      readdirSync: function (path) {
        var at = full(path);
        if (!dirs.has(at)) throw notFound("scandir", path);
        var prefix = at === "/" ? "/" : at + "/";
        var names = new Set();
        files.forEach(function (_text, file) {
          if (file.indexOf(prefix) === 0)
            names.add(file.slice(prefix.length).split("/")[0]);
        });
        dirs.forEach(function (dir) {
          if (dir !== at && dir.indexOf(prefix) === 0)
            names.add(dir.slice(prefix.length).split("/")[0]);
        });
        return Array.from(names).sort();
      },
      rmSync: function (path, options) {
        var at = full(path);
        if (files.has(at)) return (files.delete(at), undefined);
        if (dirs.has(at)) {
          if (!(options && options.recursive))
            throw nodeError(
              "ERR_FS_EISDIR",
              "Path is a directory: rm '" + path + "'",
            );
          var prefix = at + "/";
          files.forEach(function (_text, file) {
            if (file.indexOf(prefix) === 0) files.delete(file);
          });
          dirs.forEach(function (dir) {
            if (dir === at || dir.indexOf(prefix) === 0) dirs.delete(dir);
          });
          return undefined;
        }
        if (!(options && options.force)) throw notFound("rm", path);
        return undefined;
      },
      statSync: stat,
      lstatSync: stat,
      accessSync: function (path) {
        if (!fsSync.existsSync(path)) throw notFound("access", path);
      },
    };
    fsSync.rmdirSync = fsSync.rmSync;
    var fsPromises = {};
    var fsModule = {
      promises: fsPromises,
      constants: { F_OK: 0, R_OK: 4, W_OK: 2 },
    };
    Object.keys(fsSync).forEach(function (name) {
      fsModule[name] = fsSync[name];
      if (name === "existsSync") return;
      var base = name.replace(/Sync$/, "");
      fsPromises[base] = function () {
        var args = arguments;
        return new Promise(function (resolve, reject) {
          try {
            resolve(fsSync[name].apply(null, args));
          } catch (error) {
            reject(error);
          }
        });
      };
      fsModule[base] = function () {
        var args = Array.prototype.slice.call(arguments);
        var callback =
          typeof args[args.length - 1] === "function" ? args.pop() : null;
        var result;
        var failure = null;
        try {
          result = fsSync[name].apply(null, args);
        } catch (error) {
          failure = error;
        }
        if (callback)
          world.setTimeout(function () {
            callback(failure, result);
          }, 0);
      };
    });
    fsModule.exists = function (path, callback) {
      var found = fsSync.existsSync(path);
      world.setTimeout(function () {
        callback(found);
      }, 0);
    };

    // ------------------------------------------------------ timers
    function track(native, clear, repeat) {
      return function (callback, delay) {
        var args = Array.prototype.slice.call(arguments, 2);
        var timer = { clear: clear, unref: false };
        var id = native(function () {
          if (!repeat) world.timers.delete(id);
          try {
            if (typeof callback === "function") callback.apply(undefined, args);
          } catch (error) {
            if (error && error.__veoExit) return;
            world.errors.push(error);
          }
        }, delay);
        world.timers.set(id, timer);
        return {
          id: id,
          ref: function () {
            timer.unref = false;
            return this;
          },
          unref: function () {
            timer.unref = true;
            return this;
          },
          hasRef: function () {
            return !timer.unref;
          },
          refresh: function () {
            return this;
          },
          [Symbol.toPrimitive]: function () {
            return id;
          },
        };
      };
    }
    function untrack(clear) {
      return function (handle) {
        var id = handle && typeof handle === "object" ? handle.id : handle;
        world.timers.delete(id);
        clear(id);
      };
    }
    world.setTimeout = track(nativeSetTimeout, nativeClearTimeout, false);
    world.setInterval = track(nativeSetInterval, nativeClearInterval, true);
    world.clearTimeout = untrack(nativeClearTimeout);
    world.clearInterval = untrack(nativeClearInterval);
    world.setImmediate = function (callback) {
      var args = Array.prototype.slice.call(arguments, 1);
      return world.setTimeout.apply(null, [callback, 0].concat(args));
    };
    world.clearImmediate = world.clearTimeout;
    world.pendingTimers = function () {
      var count = 0;
      world.timers.forEach(function (timer) {
        if (!timer.unref) count++;
      });
      return count;
    };
    world.stop = function () {
      world.timers.forEach(function (timer, id) {
        timer.clear(id);
      });
      world.timers.clear();
    };
    var timersModule = {
      setTimeout: world.setTimeout,
      setInterval: world.setInterval,
      setImmediate: world.setImmediate,
      clearTimeout: world.clearTimeout,
      clearInterval: world.clearInterval,
      clearImmediate: world.clearImmediate,
    };
    var timersPromises = {
      setTimeout: function (ms, value) {
        return new Promise(function (resolve) {
          world.setTimeout(resolve, ms, value);
        });
      },
      setImmediate: function (value) {
        return new Promise(function (resolve) {
          world.setTimeout(resolve, 0, value);
        });
      },
    };

    // ----------------------------------------------------- process
    var started = performance.now();
    var processObject = new EventEmitter();
    function writer(stream, level) {
      return {
        write: function (chunk) {
          var text = asText(chunk);
          if (world.capture) world[stream].push(text);
          else bridge[level](text.replace(/\n$/, ""));
          return true;
        },
        isTTY: false,
        columns: 80,
      };
    }
    Object.assign(processObject, {
      title: "node",
      version: "v20.11.0",
      versions: { node: "20.11.0" },
      platform: "linux",
      arch: "x64",
      pid: 4242,
      env: Object.assign({}, job.env || {}),
      argv: ["/usr/local/bin/node", "/" + job.entry.file].concat(argv || []),
      execArgv: [],
      exitCode: undefined,
      cwd: function () {
        return "/";
      },
      chdir: function () {
        throw new Error("process.chdir() is not available in practice.");
      },
      nextTick: function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        queueMicrotask(function () {
          try {
            fn.apply(undefined, args);
          } catch (error) {
            world.errors.push(error);
          }
        });
      },
      exit: function (code) {
        world.exitCode =
          code === undefined ? processObject.exitCode || 0 : code;
        var signal = new Error("process.exit(" + world.exitCode + ")");
        signal.__veoExit = true;
        throw signal;
      },
      hrtime: Object.assign(
        function (previous) {
          var now = performance.now();
          var seconds = Math.floor(now / 1000);
          var nanos = Math.floor((now % 1000) * 1e6);
          if (previous) {
            seconds -= previous[0];
            nanos -= previous[1];
            if (nanos < 0) {
              seconds -= 1;
              nanos += 1e9;
            }
          }
          return [seconds, nanos];
        },
        {
          bigint: function () {
            return BigInt(Math.floor(performance.now() * 1e6));
          },
        },
      ),
      uptime: function () {
        return (performance.now() - started) / 1000;
      },
      memoryUsage: function () {
        return { rss: 3e7, heapTotal: 2e7, heapUsed: 1e7, external: 0 };
      },
      stdout: writer("stdout", "log"),
      stderr: writer("stderr", "error"),
      stdin: {
        on: function () {},
        setEncoding: function () {},
        resume: function () {},
        pause: function () {},
      },
    });
    world.process = processObject;

    // ----------------------------------------------------- console
    // console.log in this world goes to stdout (run() captures it).
    var levels = ["log", "info", "debug", "warn", "error"];
    var worldConsole = {};
    levels.forEach(function (level) {
      worldConsole[level] = function () {
        var text = format.apply(null, arguments);
        if (world.capture)
          world[
            level === "warn" || level === "error" ? "stderr" : "stdout"
          ].push(text + "\n");
        else bridge[level](text);
      };
    });
    worldConsole.table =
      worldConsole.dir =
      worldConsole.trace =
        worldConsole.log;
    worldConsole.assert = function (condition) {
      if (!condition)
        worldConsole.error(
          "Assertion failed" +
            (arguments.length > 1
              ? ": " +
                format.apply(null, Array.prototype.slice.call(arguments, 1))
              : ""),
        );
    };
    var timersByLabel = {};
    worldConsole.time = function (label) {
      timersByLabel[label || "default"] = performance.now();
    };
    worldConsole.timeEnd = function (label) {
      var key = label || "default";
      if (timersByLabel[key] === undefined) return;
      worldConsole.log(
        key + ": " + (performance.now() - timersByLabel[key]).toFixed(3) + "ms",
      );
      delete timersByLabel[key];
    };
    worldConsole.group =
      worldConsole.groupEnd =
      worldConsole.clear =
        function () {};
    world.console = worldConsole;

    // ------------------------------------------------------ modules
    var builtins = {
      events: EventEmitter,
      path: pathModule,
      util: utilModule,
      assert: assertModule,
      "assert/strict": assertModule,
      fs: fsModule,
      "fs/promises": fsPromises,
      os: {
        EOL: "\n",
        platform: function () {
          return "linux";
        },
        type: function () {
          return "Linux";
        },
        arch: function () {
          return "x64";
        },
        release: function () {
          return "6.0.0";
        },
        hostname: function () {
          return "practice";
        },
        homedir: function () {
          return "/home/learner";
        },
        tmpdir: function () {
          return "/tmp";
        },
        cpus: function () {
          var count = navigator.hardwareConcurrency || 4;
          var list = [];
          for (var i = 0; i < count; i++)
            list.push({ model: "Practice CPU", speed: 2400 });
          return list;
        },
        totalmem: function () {
          return 8 * 1024 * 1024 * 1024;
        },
        freemem: function () {
          return 4 * 1024 * 1024 * 1024;
        },
        uptime: function () {
          return Math.floor(performance.now() / 1000);
        },
      },
      process: processObject,
      timers: timersModule,
      "timers/promises": timersPromises,
      buffer: { Buffer: Buffer },
      string_decoder: {
        StringDecoder: function () {
          this.write = function (bytes) {
            return decoder.decode(bytes);
          };
          this.end = function () {
            return "";
          };
        },
      },
      url: {
        URL: URL,
        URLSearchParams: URLSearchParams,
        fileURLToPath: function (url) {
          return new URL(url).pathname;
        },
        pathToFileURL: function (path) {
          return new URL("file://" + pathModule.resolve("/", path));
        },
      },
      querystring: {
        parse: function (text) {
          var out = {};
          new URLSearchParams(text).forEach(function (value, key) {
            if (key in out) out[key] = [].concat(out[key], value);
            else out[key] = value;
          });
          return out;
        },
        stringify: function (object) {
          return new URLSearchParams(object).toString();
        },
      },
      crypto: {
        randomUUID: function () {
          return crypto.randomUUID();
        },
        randomInt: function (min, max) {
          if (max === undefined) {
            max = min;
            min = 0;
          }
          return min + Math.floor(Math.random() * (max - min));
        },
        getRandomValues: function (array) {
          return crypto.getRandomValues(array);
        },
        randomBytes: function (size) {
          return makeBuffer(crypto.getRandomValues(new Uint8Array(size)));
        },
        createHash: function () {
          throw new Error(
            "crypto.createHash() is not available in practice (it runs in your browser).",
          );
        },
      },
    };

    var cache = {};
    function resolveFrom(from, spec) {
      var name = spec.indexOf("node:") === 0 ? spec.slice(5) : spec;
      if (Object.prototype.hasOwnProperty.call(builtins, name))
        return { builtin: name };
      if (
        unavailable.indexOf(name) >= 0 ||
        unavailable.indexOf(name.split("/")[0]) >= 0
      )
        throw nodeError(
          "ERR_NOT_AVAILABLE",
          "The module '" +
            name +
            "' needs a real machine (network or processes) and is not available in practice.",
        );
      if (spec.charAt(0) !== "." && spec.charAt(0) !== "/")
        throw nodeError(
          "MODULE_NOT_FOUND",
          "Cannot find module '" +
            spec +
            "'. Packages from npm are not available in practice; use Node's built-in modules or your own files.",
        );
      var base =
        spec.charAt(0) === "/"
          ? normalizePath(spec)
          : normalizePath(pathModule.dirname("/" + from) + "/" + spec);
      var candidates = [
        base,
        base + ".js",
        base + ".ts",
        base + ".cjs",
        base + ".mjs",
        base + ".json",
        base + "/index.js",
        base + "/index.ts",
      ];
      for (var i = 0; i < candidates.length; i++) {
        var key = candidates[i].replace(/^\//, "");
        if (Object.prototype.hasOwnProperty.call(job.code, key))
          return { file: key };
      }
      throw nodeError(
        "MODULE_NOT_FOUND",
        "Cannot find module '" + spec + "' from " + from,
      );
    }
    function load(path) {
      if (cache[path]) return cache[path].exports;
      var module = {
        exports: {},
        id: "/" + path,
        filename: "/" + path,
        loaded: false,
        children: [],
        paths: [],
      };
      cache[path] = module;
      var source = job.code[path];
      if (/\.json$/.test(path)) {
        module.exports = JSON.parse(source);
        module.loaded = true;
        return module.exports;
      }
      var run = new Function(
        "require",
        "module",
        "exports",
        "__filename",
        "__dirname",
        "process",
        "console",
        "Buffer",
        "setTimeout",
        "setInterval",
        "setImmediate",
        "clearTimeout",
        "clearInterval",
        "clearImmediate",
        "global",
        source + "\n//# sourceURL=" + path,
      );
      var localRequire = makeRequire(path);
      run.call(
        module.exports,
        localRequire,
        module,
        module.exports,
        "/" + path,
        pathModule.dirname("/" + path),
        processObject,
        worldConsole,
        Buffer,
        world.setTimeout,
        world.setInterval,
        world.setImmediate,
        world.clearTimeout,
        world.clearInterval,
        world.clearImmediate,
        world.global,
      );
      module.loaded = true;
      return module.exports;
    }
    function makeRequire(from) {
      var require = function (spec) {
        var target = resolveFrom(from, String(spec));
        return target.builtin ? builtins[target.builtin] : load(target.file);
      };
      require.resolve = function (spec) {
        var target = resolveFrom(from, String(spec));
        return target.builtin || "/" + target.file;
      };
      require.cache = cache;
      require.main = { filename: "/" + job.entry.file };
      return require;
    }
    world.global = {
      process: processObject,
      console: worldConsole,
      Buffer: Buffer,
      setTimeout: world.setTimeout,
      setInterval: world.setInterval,
      clearTimeout: world.clearTimeout,
      clearInterval: world.clearInterval,
    };
    world.require = makeRequire("__tests__.js");
    world.runEntry = function () {
      return load(job.entry.file);
    };
    world.fs = fsModule;
    return world;
  }

  /* -------------------------------------------------------------- tests */

  var current = null;
  var registered = [];

  function register(name, fn, hidden) {
    registered.push({ name: String(name), fn: fn, hidden: Boolean(hidden) });
  }

  function matchers(actual, negate, label) {
    function check(ok, message, negatedMessage) {
      if (negate ? ok : !ok) fail(negate ? negatedMessage : message);
    }
    var d = inspect;
    function compare(name, ok, word, expected) {
      check(
        ok,
        "Expected " + d(actual) + " to be " + word + " " + d(expected) + ".",
        "Expected " +
          d(actual) +
          " not to be " +
          word +
          " " +
          d(expected) +
          ".",
      );
    }
    var api = {
      toBe: function (expected) {
        check(
          Object.is(actual, expected),
          "Expected " + d(expected) + ", got " + d(actual) + ".",
          "Expected anything but " + d(expected) + ".",
        );
      },
      toEqual: function (expected) {
        check(
          veo.equal(actual, expected, false),
          "Expected " + d(expected) + ", got " + d(actual) + ".",
          "Expected anything but " + d(expected) + ".",
        );
      },
      toStrictEqual: function (expected) {
        api.toEqual(expected);
      },
      toBeTruthy: function () {
        check(
          Boolean(actual),
          "Expected a truthy value, got " + d(actual) + ".",
          "Expected a falsy value, got " + d(actual) + ".",
        );
      },
      toBeFalsy: function () {
        check(
          !actual,
          "Expected a falsy value, got " + d(actual) + ".",
          "Expected a truthy value, got " + d(actual) + ".",
        );
      },
      toBeNull: function () {
        check(
          actual === null,
          "Expected null, got " + d(actual) + ".",
          "Expected anything but null.",
        );
      },
      toBeUndefined: function () {
        check(
          actual === undefined,
          "Expected undefined, got " + d(actual) + ".",
          "Expected a value, got undefined.",
        );
      },
      toBeDefined: function () {
        check(
          actual !== undefined,
          "Expected a value, got undefined.",
          "Expected undefined, got " + d(actual) + ".",
        );
      },
      toBeNaN: function () {
        check(
          Number.isNaN(actual),
          "Expected NaN, got " + d(actual) + ".",
          "Expected a number, got NaN.",
        );
      },
      toBeGreaterThan: function (expected) {
        compare("toBeGreaterThan", actual > expected, "greater than", expected);
      },
      toBeGreaterThanOrEqual: function (expected) {
        compare(
          "toBeGreaterThanOrEqual",
          actual >= expected,
          "at least",
          expected,
        );
      },
      toBeLessThan: function (expected) {
        compare("toBeLessThan", actual < expected, "less than", expected);
      },
      toBeLessThanOrEqual: function (expected) {
        compare("toBeLessThanOrEqual", actual <= expected, "at most", expected);
      },
      toBeCloseTo: function (expected, digits) {
        var precision = digits === undefined ? 2 : digits;
        compare(
          "toBeCloseTo",
          Math.abs(expected - actual) < Math.pow(10, -precision) / 2,
          "close to",
          expected,
        );
      },
      toContain: function (item) {
        var ok =
          typeof actual === "string"
            ? actual.indexOf(item) >= 0
            : actual != null &&
              typeof actual[Symbol.iterator] === "function" &&
              Array.from(actual).some(function (entry) {
                return veo.equal(entry, item, false);
              });
        check(
          ok,
          "Expected " + d(actual) + " to contain " + d(item) + ".",
          "Expected " + d(actual) + " not to contain " + d(item) + ".",
        );
      },
      toHaveLength: function (length) {
        var size = actual == null ? undefined : actual.length;
        check(
          size === length,
          "Expected length " + length + ", got " + d(size) + ".",
          "Expected a length other than " + length + ".",
        );
      },
      toHaveProperty: function (path, value) {
        var keys = Array.isArray(path) ? path : String(path).split(".");
        var target = actual;
        var found = true;
        for (var i = 0; i < keys.length; i++) {
          if (target == null || !(keys[i] in Object(target))) {
            found = false;
            break;
          }
          target = target[keys[i]];
        }
        var ok =
          found && (arguments.length < 2 || veo.equal(target, value, false));
        check(
          ok,
          "Expected " +
            d(actual) +
            " to have property " +
            keys.join(".") +
            (arguments.length > 1 ? " = " + d(value) : "") +
            ".",
          "Expected " +
            d(actual) +
            " not to have property " +
            keys.join(".") +
            ".",
        );
      },
      toMatch: function (pattern) {
        var ok =
          pattern instanceof RegExp
            ? pattern.test(String(actual))
            : String(actual).indexOf(pattern) >= 0;
        check(
          ok,
          "Expected " + d(actual) + " to match " + d(pattern) + ".",
          "Expected " + d(actual) + " not to match " + d(pattern) + ".",
        );
      },
      toMatchObject: function (expected) {
        var ok =
          actual != null &&
          Object.keys(expected).every(function (key) {
            return veo.equal(actual[key], expected[key], false);
          });
        check(
          ok,
          "Expected " + d(actual) + " to match " + d(expected) + ".",
          "Expected " + d(actual) + " not to match " + d(expected) + ".",
        );
      },
      toBeInstanceOf: function (type) {
        check(
          actual instanceof type,
          "Expected an instance of " +
            (type && type.name) +
            ", got " +
            d(actual) +
            ".",
          "Expected it not to be an instance of " + (type && type.name) + ".",
        );
      },
      toThrow: function (expected) {
        if (typeof actual !== "function") fail("toThrow() needs a function.");
        var thrown = null;
        var threw = false;
        try {
          actual();
        } catch (error) {
          threw = true;
          thrown = error;
        }
        var ok =
          threw &&
          (expected === undefined ||
            (typeof expected === "string"
              ? String(thrown && thrown.message).indexOf(expected) >= 0
              : matchesError(thrown, expected)));
        check(
          ok,
          threw
            ? "It threw " + veo.errorText(thrown) + ", not the expected error."
            : "Expected it to throw an error.",
          "Expected it not to throw, but it threw " +
            veo.errorText(thrown) +
            ".",
        );
      },
      toHaveBeenCalled: function () {
        var calls = actual && actual.mock && actual.mock.calls;
        if (!calls) fail("toHaveBeenCalled() needs a function made with fn().");
        check(
          calls.length > 0,
          "Expected it to be called.",
          "Expected it not to be called.",
        );
      },
      toHaveBeenCalledTimes: function (times) {
        var calls = actual && actual.mock && actual.mock.calls;
        if (!calls)
          fail("toHaveBeenCalledTimes() needs a function made with fn().");
        check(
          calls.length === times,
          "Expected " + times + " calls, got " + calls.length + ".",
          "Expected other than " + times + " calls.",
        );
      },
      toHaveBeenCalledWith: function () {
        var args = Array.prototype.slice.call(arguments);
        var calls = actual && actual.mock && actual.mock.calls;
        if (!calls)
          fail("toHaveBeenCalledWith() needs a function made with fn().");
        var ok = calls.some(function (call) {
          return veo.equal(call, args, false);
        });
        check(
          ok,
          "Expected a call with " + d(args) + ", got " + d(calls) + ".",
          "Expected no call with " + d(args) + ".",
        );
      },
    };
    void label;
    return api;
  }

  function expect(actual) {
    var api = matchers(actual, false);
    api.not = matchers(actual, true);
    api.resolves = {};
    api.rejects = {};
    Object.keys(api).forEach(function (name) {
      if (typeof api[name] !== "function") return;
      api.resolves[name] = function () {
        var args = arguments;
        return Promise.resolve(actual).then(function (value) {
          return matchers(value, false)[name].apply(null, args);
        });
      };
      api.rejects[name] = function () {
        var args = arguments;
        return Promise.resolve(actual).then(
          function () {
            fail("Expected the promise to reject.");
          },
          function (error) {
            return matchers(error, false)[name].apply(null, args);
          },
        );
      };
    });
    return api;
  }

  /** A function that remembers how it was called (like jest.fn). */
  function fn(implementation) {
    var mock = function () {
      var args = Array.prototype.slice.call(arguments);
      mock.mock.calls.push(args);
      return implementation ? implementation.apply(this, args) : undefined;
    };
    mock.mock = { calls: [] };
    return mock;
  }

  function macrotask() {
    return new Promise(function (resolve) {
      nativeSetTimeout(resolve, 0);
    });
  }

  /** Waits until the world has no timers left (or `ms` pass). */
  async function idle(world, ms) {
    var until = performance.now() + ms;
    await macrotask();
    while (world.pendingTimers() > 0 && performance.now() < until) {
      await new Promise(function (resolve) {
        nativeSetTimeout(resolve, 10);
      });
    }
  }

  /**
   * Runs the entry file as a program in the test's world and returns what
   * it printed: run(["--name", "Asha"]) → { stdout, stderr, exitCode }.
   */
  async function runProgram(argv, options) {
    var world = current;
    if (!world) fail("run() works inside a test.");
    world.process.argv = ["/usr/local/bin/node", "/" + world.entryFile].concat(
      Array.isArray(argv) ? argv.map(String) : [],
    );
    if (options && options.env) Object.assign(world.process.env, options.env);
    world.capture = true;
    world.stdout = [];
    world.stderr = [];
    try {
      world.runEntry();
    } catch (error) {
      if (!(error && error.__veoExit)) throw error;
    }
    await idle(world, (options && options.waitMs) || 1000);
    world.capture = false;
    if (world.errors.length) throw world.errors[0];
    return {
      stdout: world.stdout.join(""),
      stderr: world.stderr.join(""),
      exitCode:
        world.exitCode !== undefined
          ? world.exitCode
          : world.process.exitCode || 0,
    };
  }

  function race(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = nativeSetTimeout(function () {
        reject(
          new Error("The test did not finish within " + ms / 1000 + " s."),
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

  self.addEventListener("unhandledrejection", function (event) {
    if (current) current.errors.push(event.reason);
    event.preventDefault();
  });

  // The world the test file is loaded in: what it requires at the top is
  // loaded once, as in Jest; a require inside a test gets a fresh copy.
  var setupWorld = null;

  function registerTests(job) {
    registered = [];
    if (!job.testSource) return true;
    setupWorld = createWorld(job, []);
    setupWorld.entryFile = job.entry.file;
    try {
      var load = new Function(
        "require",
        "test",
        "it",
        "expect",
        "run",
        "fn",
        "describe",
        job.testSource + "\n//# sourceURL=tests.js",
      );
      var prefix = [];
      var describe = function (name, body) {
        prefix.push(String(name));
        try {
          body();
        } finally {
          prefix.pop();
        }
      };
      var testFn = function (name, body) {
        register(prefix.concat(String(name)).join(" › "), body, false);
      };
      testFn.hidden = function (name, body) {
        register(prefix.concat(String(name)).join(" › "), body, true);
      };
      load(
        function (spec) {
          return (current || setupWorld).require(spec);
        },
        testFn,
        testFn,
        expect,
        runProgram,
        fn,
        describe,
      );
      return true;
    } catch (error) {
      post({
        type: "fatal",
        message: "The tests could not load: " + veo.errorText(error),
      });
      return false;
    }
  }

  self.onmessage = async function (event) {
    var job = event.data;
    if (!job || job.kind !== "node") return;
    // The program once, as `node index.js`: its output and any error show
    // once, not once per test.
    if (!job.respawned) {
      var world = createWorld(job, []);
      current = world;
      try {
        world.runEntry();
      } catch (error) {
        if (!(error && error.__veoExit)) {
          world.stop();
          current = null;
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
      }
      // Timers and promises it started print a little later. "loaded" is
      // sent after them, so the broker stops a program that never ends.
      await idle(world, job.programWaitMs || 1500);
      post({ type: "loaded" });
      world.stop();
      current = null;
      if (world.errors.length) {
        var problem = world.errors[0];
        var place = veo.locate(problem, job.paths);
        post({
          type: "fatal",
          message: veo.errorText(problem),
          file: place && place.file,
          line: place && place.line,
        });
        return;
      }
    } else post({ type: "loaded" });

    if (!registerTests(job)) return;
    var list = [];
    var seen = {};
    registered.forEach(function (test) {
      var id = veo.slug(test.name);
      if (seen[id]) id = id + "-" + (seen[id] += 1);
      else seen[id] = 1;
      list.push({ id: id, name: test.name, hidden: test.hidden, fn: test.fn });
    });
    if (job.discover && !job.respawned)
      post({
        type: "discovered",
        tests: list.map(function (test) {
          return { id: test.id, name: test.name, hidden: test.hidden };
        }),
      });
    var torun = list.filter(function (test) {
      return job.only !== "visible" || !test.hidden;
    });
    consoleMuted = true;
    for (var i = job.startIndex || 0; i < torun.length; i++) {
      var test = torun[i];
      post({
        type: "test-start",
        index: i,
        id: test.id,
        timeoutMs: job.defaultTimeoutMs,
      });
      var testWorld = createWorld(job, []);
      testWorld.entryFile = job.entry.file;
      current = testWorld;
      var started = performance.now();
      var result;
      try {
        await race(
          Promise.resolve().then(function () {
            return test.fn();
          }),
          job.defaultTimeoutMs,
        );
        await macrotask();
        if (testWorld.errors.length) throw testWorld.errors[0];
        result = { passed: true };
      } catch (error) {
        var at = veo.locate(error, job.paths.concat("tests.js"));
        result = {
          passed: false,
          message:
            error && error.__veoExit
              ? "The program called " + error.message + " during the test."
              : veo.errorText(error),
          file: at && at.file !== "tests.js" ? at.file : undefined,
          line: at && at.file !== "tests.js" ? at.line : undefined,
        };
      }
      testWorld.stop();
      current = null;
      result.type = "test-result";
      result.index = i;
      result.id = test.id;
      result.ms = Math.round(performance.now() - started);
      post(result);
    }
    consoleMuted = false;
    if (setupWorld) setupWorld.stop();
    post({ type: "done" });
  };
})();
