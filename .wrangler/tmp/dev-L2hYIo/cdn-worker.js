var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// scripts/cdn-worker.js
var TOKEN_QUERY_PARAMETER = "veo_token";
var MANIFEST_PATTERN = /\.m3u8$/iu;
var DEFAULT_CDN_URL = "/cdn";
var DEFAULT_PUBLIC_FOLDERS = [
  "public",
  "thumbnails",
  "course-hls",
  "course-videos"
];
var DEFAULT_PRIVATE_FOLDERS = ["protected", "media", "transcoded"];
var DEFAULT_AVATAR_IMAGE_WIDTHS = [45, 96, 160];
var DEFAULT_THUMBNAIL_IMAGE_WIDTHS = [160, 240, 320, 480, 640, 960, 1280];
var IMAGE_TRANSFORM_VARIANT_PATTERN = /^(?:public|protected)\/(?:thumbnails|avatars)\/[A-Za-z0-9_-]{1,200}\/(?:full|[1-9]\d*)\.webp$/u;
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
var cdn_worker_default = {
  async fetch(request, env, context) {
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return createOptionsResponse(request, env);
    }
    if (method !== "GET" && method !== "HEAD") {
      return createErrorResponse(
        request,
        env,
        405,
        "METHOD_NOT_ALLOWED",
        "Only GET, HEAD, and OPTIONS are supported.",
        { Allow: "GET, HEAD, OPTIONS" }
      );
    }
    const objectKey = getObjectKey(request, env);
    if (!objectKey) {
      return createErrorResponse(
        request,
        env,
        400,
        "INVALID_MEDIA_PATH",
        "The media path is invalid."
      );
    }
    const visibility = classifyObjectKey(objectKey, env);
    if (visibility === "unknown") {
      return createErrorResponse(request, env, 404, "NOT_FOUND", "Not found.");
    }
    if (visibility === "protected") {
      const token = new URL(request.url).searchParams.get(
        TOKEN_QUERY_PARAMETER
      );
      if (!env.CDN_SIGNING_SECRET || !token || !await verifyAccessToken(token, objectKey, env.CDN_SIGNING_SECRET)) {
        return createErrorResponse(
          request,
          env,
          401,
          "MEDIA_TOKEN_REQUIRED",
          "A valid media token is required."
        );
      }
    }
    const imageVariantError = validateImageVariant(objectKey, env);
    if (imageVariantError) {
      return createErrorResponse(
        request,
        env,
        imageVariantError.status,
        imageVariantError.code,
        imageVariantError.message
      );
    }
    const rangeHeader = request.headers.get("Range");
    const hasConditionalHeaders = Boolean(
      request.headers.get("If-None-Match") || request.headers.get("If-Modified-Since")
    );
    const canUseSharedCache = method === "GET" && !rangeHeader && !hasConditionalHeaders && !isAvatarImageVariantKey(objectKey) && isWildcardCors(env);
    const cacheKey = canUseSharedCache ? createCacheKey(request) : void 0;
    if (cacheKey) {
      const cached = await caches.default.match(cacheKey);
      if (cached) return cached;
    }
    let object;
    let range;
    let metadata;
    if (rangeHeader || method === "HEAD" || hasConditionalHeaders) {
      metadata = await env.MEDIA_BUCKET.head(objectKey);
      if (!metadata) {
        const transformed = await fetchMissingImageVariant(
          request,
          env,
          context,
          objectKey,
          cacheKey
        );
        if (transformed) return transformed;
        return createErrorResponse(
          request,
          env,
          404,
          "NOT_FOUND",
          "Not found."
        );
      }
      const notModified = isNotModified(request, metadata);
      if (notModified) {
        return createNotModifiedResponse(request, env, objectKey, metadata);
      }
      if (method === "HEAD") {
        return createObjectResponse(
          request,
          env,
          objectKey,
          metadata,
          null,
          null,
          "HEAD"
        );
      }
      if (rangeHeader) {
        range = parseRange(rangeHeader, metadata.size);
        if (!range) {
          return createErrorResponse(
            request,
            env,
            416,
            "RANGE_NOT_SATISFIABLE",
            "The requested byte range is invalid.",
            { "Content-Range": `bytes */${metadata.size}` }
          );
        }
        object = await env.MEDIA_BUCKET.get(objectKey, {
          range: { offset: range.start, length: range.length }
        });
      } else {
        object = await env.MEDIA_BUCKET.get(objectKey);
      }
    } else {
      object = await env.MEDIA_BUCKET.get(objectKey);
    }
    if (!object) {
      const transformed = await fetchMissingImageVariant(
        request,
        env,
        context,
        objectKey,
        cacheKey
      );
      if (transformed) return transformed;
      return createErrorResponse(request, env, 404, "NOT_FOUND", "Not found.");
    }
    const response = createObjectResponse(
      request,
      env,
      objectKey,
      object,
      range,
      metadata,
      method
    );
    if (cacheKey && response.ok) {
      context.waitUntil(caches.default.put(cacheKey, response.clone()));
    }
    return response;
  }
};
function getObjectKey(request, env) {
  const url = new URL(request.url);
  const configuredPrefix = getCdnPathPrefix(env.CDN_URL);
  let pathname = url.pathname;
  if (configuredPrefix && (pathname === configuredPrefix || pathname.startsWith(`${configuredPrefix}/`))) {
    pathname = pathname.slice(configuredPrefix.length);
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decodedPath.startsWith("/") || decodedPath.includes("\0")) {
    return null;
  }
  const parts = decodedPath.split("/").slice(1);
  if (parts.length === 0 || parts.some(
    (part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0")
  )) {
    return null;
  }
  return parts.join("/");
}
__name(getObjectKey, "getObjectKey");
function getCdnPathPrefix(value) {
  const configuredUrl = String(value || DEFAULT_CDN_URL).trim();
  if (/^\/(?!\/)/u.test(configuredUrl)) {
    return normalizePathPrefix(configuredUrl);
  }
  try {
    return normalizePathPrefix(new URL(configuredUrl).pathname);
  } catch {
    return normalizePathPrefix(DEFAULT_CDN_URL);
  }
}
__name(getCdnPathPrefix, "getCdnPathPrefix");
function validateImageVariant(objectKey, env) {
  const match = /^(?:public|protected)\/(thumbnails|avatars)\/[A-Za-z0-9_-]{1,200}\/(full|[1-9]\d*)\.webp$/u.exec(
    objectKey
  );
  if (!match) return null;
  const collection = match[1];
  const filename = match[2];
  if (collection === "avatars" && filename === "full") {
    return {
      status: 400,
      code: "INVALID_PATH",
      message: "Avatar full-size variants are not supported."
    };
  }
  if (filename === "full") return null;
  let widths;
  try {
    widths = resolveConfiguredImageWidths(env);
  } catch {
    return {
      status: 500,
      code: "INVALID_CONFIGURATION",
      message: "The image transform configuration is invalid."
    };
  }
  const width = Number(filename);
  const allowedWidths = collection === "thumbnails" ? widths.thumbnail : widths.avatar;
  if (!allowedWidths.includes(width)) {
    return {
      status: 400,
      code: "UNAVAILABLE_VARIANT",
      message: "The requested image width is not enabled."
    };
  }
  return null;
}
__name(validateImageVariant, "validateImageVariant");
function resolveConfiguredImageWidths(env) {
  return {
    avatar: parseConfiguredImageWidths(
      env.AVATAR_IMAGE_WIDTHS,
      DEFAULT_AVATAR_IMAGE_WIDTHS,
      "AVATAR_IMAGE_WIDTHS"
    ),
    thumbnail: parseConfiguredImageWidths(
      env.THUMBNAIL_IMAGE_WIDTHS,
      DEFAULT_THUMBNAIL_IMAGE_WIDTHS,
      "THUMBNAIL_IMAGE_WIDTHS"
    )
  };
}
__name(resolveConfiguredImageWidths, "resolveConfiguredImageWidths");
function parseConfiguredImageWidths(value, fallback, environmentName) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return [...fallback];
  const values = rawValue.split(",").map((item) => item.trim());
  if (values.some(
    (item) => !/^[1-9]\d*$/.test(item) || !Number.isSafeInteger(Number(item))
  )) {
    throw new Error(
      `${environmentName} must be a comma-separated list of positive integers`
    );
  }
  return [...new Set(values.map(Number))].sort((left, right) => left - right);
}
__name(parseConfiguredImageWidths, "parseConfiguredImageWidths");
async function fetchMissingImageVariant(request, env, context, objectKey, cacheKey) {
  if (!IMAGE_TRANSFORM_VARIANT_PATTERN.test(objectKey)) return null;
  const configuredUrl = String(env.IMAGE_TRANSFORM_WORKER_URL || "").trim();
  const transformToken = String(env.IMAGE_TRANSFORM_TOKEN || "");
  if (!configuredUrl || !transformToken) {
    return createErrorResponse(
      request,
      env,
      503,
      "IMAGE_TRANSFORM_NOT_CONFIGURED",
      "The image transform service is not configured."
    );
  }
  let transformUrl;
  try {
    transformUrl = new URL(configuredUrl);
  } catch {
    return createErrorResponse(
      request,
      env,
      503,
      "IMAGE_TRANSFORM_NOT_CONFIGURED",
      "The image transform service URL is invalid."
    );
  }
  if (transformUrl.protocol !== "https:" && transformUrl.protocol !== "http:") {
    return createErrorResponse(
      request,
      env,
      503,
      "IMAGE_TRANSFORM_NOT_CONFIGURED",
      "The image transform service URL is invalid."
    );
  }
  if (transformUrl.origin === new URL(request.url).origin) {
    return createErrorResponse(
      request,
      env,
      503,
      "IMAGE_TRANSFORM_NOT_CONFIGURED",
      "The image transform service must use a different Worker endpoint."
    );
  }
  transformUrl.pathname = `/${objectKey}`;
  transformUrl.search = "";
  transformUrl.searchParams.set("token", transformToken);
  const transformHeaders = new Headers(request.headers);
  transformHeaders.delete("Cookie");
  transformHeaders.delete("Range");
  transformHeaders.delete("If-None-Match");
  transformHeaders.delete("If-Modified-Since");
  let response;
  try {
    response = await fetch(
      new Request(transformUrl, {
        method: request.method,
        headers: transformHeaders
      })
    );
  } catch (error) {
    console.error("Image transform proxy failed", {
      objectKey,
      error: error instanceof Error ? error.message : String(error)
    });
    return createErrorResponse(
      request,
      env,
      502,
      "IMAGE_TRANSFORM_UNAVAILABLE",
      "The image transform service is unavailable."
    );
  }
  const responseHeaders = new Headers(response.headers);
  if (response.ok) {
    responseHeaders.set("Cache-Control", cacheControlForKey(objectKey));
  }
  addCorsHeaders(responseHeaders, request, env);
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  const proxiedResponse = new Response(
    request.method === "HEAD" ? null : response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    }
  );
  if (cacheKey && proxiedResponse.ok) {
    context.waitUntil(caches.default.put(cacheKey, proxiedResponse.clone()));
  }
  return proxiedResponse;
}
__name(fetchMissingImageVariant, "fetchMissingImageVariant");
function classifyObjectKey(objectKey, env) {
  if (MANIFEST_PATTERN.test(objectKey)) return "public";
  const privateFolders = parseFolderList(
    env.CDN_PRIVATE_FOLDERS,
    DEFAULT_PRIVATE_FOLDERS
  );
  if (matchesFolder(objectKey, privateFolders)) return "protected";
  const publicFolders = parseFolderList(
    env.CDN_PUBLIC_FOLDERS,
    DEFAULT_PUBLIC_FOLDERS
  );
  if (matchesFolder(objectKey, publicFolders)) return "public";
  return "unknown";
}
__name(classifyObjectKey, "classifyObjectKey");
function parseFolderList(value, fallback) {
  const folders = String(value || "").split(",").map((folder) => folder.trim().replace(/^\/+|\/+$/gu, "")).filter(Boolean);
  return folders.length > 0 ? folders : fallback;
}
__name(parseFolderList, "parseFolderList");
function matchesFolder(objectKey, folders) {
  return folders.some(
    (folder) => objectKey === folder || objectKey.startsWith(`${folder}/`)
  );
}
__name(matchesFolder, "matchesFolder");
function isAvatarImageVariantKey(objectKey) {
  return /^(?:public|protected)\/avatars\//u.test(objectKey);
}
__name(isAvatarImageVariantKey, "isAvatarImageVariantKey");
function normalizePathPrefix(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/u, "");
}
__name(normalizePathPrefix, "normalizePathPrefix");
async function verifyAccessToken(token, objectKey, secret) {
  if (typeof token !== "string" || token.length > 4096) return false;
  const separator = token.indexOf(".");
  if (separator <= 0 || separator !== token.lastIndexOf(".")) return false;
  const payloadPart = token.slice(0, separator);
  const signaturePart = token.slice(separator + 1);
  let payloadBytes;
  let signatureBytes;
  try {
    payloadBytes = decodeBase64Url(payloadPart);
    signatureBytes = decodeBase64Url(signaturePart);
  } catch {
    return false;
  }
  let payload;
  try {
    payload = JSON.parse(textDecoder.decode(payloadBytes));
  } catch {
    return false;
  }
  const tokenKey = normalizeTokenKey(payload?.k);
  if (payload?.v !== 1 || !tokenKey || !Number.isInteger(payload?.e) || payload.e <= Math.floor(Date.now() / 1e3) || !(objectKey === tokenKey || objectKey.startsWith(`${tokenKey}/`))) {
    return false;
  }
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(String(secret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signatureBytes,
      textEncoder.encode(payloadPart)
    );
  } catch {
    return false;
  }
}
__name(verifyAccessToken, "verifyAccessToken");
function normalizeTokenKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/^\/+|\/+$/gu, "");
  if (!normalized || normalized.includes("\\") || normalized.includes("\0") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return normalized;
}
__name(normalizeTokenKey, "normalizeTokenKey");
function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url value");
  }
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = `${base64}${"=".repeat((4 - base64.length % 4) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(decodeBase64Url, "decodeBase64Url");
function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match || size <= 0 || !match[1] && !match[2]) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if (start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  const length = end - start + 1;
  return length > 0 ? { start, end, length } : null;
}
__name(parseRange, "parseRange");
function isNotModified(request, metadata) {
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch) {
    if (ifNoneMatch.trim() === "*") return true;
    const etag = metadata.httpEtag;
    if (etag && ifNoneMatch.split(",").some((candidate) => etagMatches(candidate, etag))) {
      return true;
    }
    return false;
  }
  const ifModifiedSince = request.headers.get("If-Modified-Since");
  if (!ifModifiedSince || !metadata.uploaded) return false;
  const timestamp = Date.parse(ifModifiedSince);
  return Number.isFinite(timestamp) && metadata.uploaded.getTime() <= timestamp;
}
__name(isNotModified, "isNotModified");
function etagMatches(candidate, etag) {
  return candidate.trim().replace(/^W\//u, "") === etag.replace(/^W\//u, "");
}
__name(etagMatches, "etagMatches");
function createObjectResponse(request, env, objectKey, object, range, metadata, method) {
  const headers = createObjectHeaders(
    request,
    env,
    objectKey,
    object,
    range,
    metadata
  );
  const status = range ? 206 : 200;
  const body = method === "HEAD" ? null : object.body;
  return new Response(body, { status, headers });
}
__name(createObjectResponse, "createObjectResponse");
function createObjectHeaders(request, env, objectKey, object, range, metadata) {
  const headers = new Headers();
  if (typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  }
  if (!headers.get("Content-Type")) {
    headers.set("Content-Type", inferContentType(objectKey));
  }
  if (object.httpEtag || metadata?.httpEtag) {
    headers.set("ETag", object.httpEtag || metadata.httpEtag);
  }
  if (object.uploaded || metadata?.uploaded) {
    headers.set(
      "Last-Modified",
      (object.uploaded || metadata.uploaded).toUTCString()
    );
  }
  const totalSize = metadata?.size ?? object.size ?? 0;
  const contentLength = range ? range.length : totalSize;
  headers.set("Content-Length", String(contentLength));
  headers.set("Accept-Ranges", "bytes");
  if (range) {
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${totalSize}`
    );
  }
  headers.set("Cache-Control", cacheControlForKey(objectKey));
  headers.set("X-Content-Type-Options", "nosniff");
  addCorsHeaders(headers, request, env);
  return headers;
}
__name(createObjectHeaders, "createObjectHeaders");
function cacheControlForKey(objectKey) {
  if (IMAGE_TRANSFORM_VARIANT_PATTERN.test(objectKey)) {
    if (/^(?:public|protected)\/thumbnails\//u.test(objectKey)) {
      return "public, max-age=31536000, immutable";
    }
    if (isAvatarImageVariantKey(objectKey)) return "no-store";
    return "public, max-age=300";
  }
  if (MANIFEST_PATTERN.test(objectKey)) {
    return "public, max-age=60, s-maxage=60, stale-while-revalidate=300";
  }
  if (/\.(?:m4s|ts|aac|mp4|webm|m4a)$/iu.test(objectKey)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600, s-maxage=3600";
}
__name(cacheControlForKey, "cacheControlForKey");
function inferContentType(objectKey) {
  const extension = objectKey.slice(objectKey.lastIndexOf(".")).toLowerCase();
  return {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".m4s": "video/iso.segment",
    ".ts": "video/mp2t",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".vtt": "text/vtt; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif"
  }[extension] || "application/octet-stream";
}
__name(inferContentType, "inferContentType");
function createNotModifiedResponse(request, env, objectKey, metadata) {
  const headers = createObjectHeaders(
    request,
    env,
    objectKey,
    metadata,
    null,
    metadata
  );
  headers.delete("Content-Length");
  headers.delete("Content-Range");
  return new Response(null, { status: 304, headers });
}
__name(createNotModifiedResponse, "createNotModifiedResponse");
function createOptionsResponse(request, env) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type, If-Modified-Since, If-None-Match, Range",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "public, max-age=86400"
  });
  addCorsHeaders(headers, request, env);
  return new Response(null, { status: 204, headers });
}
__name(createOptionsResponse, "createOptionsResponse");
function createErrorResponse(request, env, status, code, message, extraHeaders) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  addCorsHeaders(headers, request, env);
  return new Response(JSON.stringify({ success: false, code, message }), {
    status,
    headers
  });
}
__name(createErrorResponse, "createErrorResponse");
function addCorsHeaders(headers, request, env) {
  headers.set(
    "Access-Control-Expose-Headers",
    "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified"
  );
  const origin = request.headers.get("Origin");
  const allowedOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  if (allowedOrigins.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
    return;
  }
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    const vary = headers.get("Vary");
    headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  }
}
__name(addCorsHeaders, "addCorsHeaders");
function parseCorsOrigins(value) {
  const origins = String(value || "*").split(",").map((origin) => origin.trim()).filter(Boolean);
  return origins.length > 0 ? origins : ["*"];
}
__name(parseCorsOrigins, "parseCorsOrigins");
function isWildcardCors(env) {
  return parseCorsOrigins(env.CORS_ORIGINS).includes("*");
}
__name(isWildcardCors, "isWildcardCors");
function createCacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.toString(), { method: "GET" });
}
__name(createCacheKey, "createCacheKey");

// node_modules/.pnpm/wrangler@4.131.2_@types+node@24.13.3/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// .wrangler/tmp/bundle-xxpvMW/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default
];
var middleware_insertion_facade_default = cdn_worker_default;

// node_modules/.pnpm/wrangler@4.131.2_@types+node@24.13.3/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-xxpvMW/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=cdn-worker.js.map
