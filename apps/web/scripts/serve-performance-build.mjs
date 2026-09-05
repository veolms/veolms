import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliCompress, createGzip, constants } from "node:zlib";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "../../..");

try {
  process.loadEnvFile(path.join(workspaceRoot, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const root = path.resolve(scriptDirectory, "../build/client");
const portArgumentIndex = process.argv.indexOf("--port");
const commandLinePort =
  portArgumentIndex >= 0 ? Number(process.argv[portArgumentIndex + 1]) : NaN;
const port = Number.isFinite(commandLinePort)
  ? commandLinePort
  : Number(process.env.PORT || 4173);
const hostArgumentIndex = process.argv.indexOf("--host");
const host =
  hostArgumentIndex >= 0 && process.argv[hostArgumentIndex + 1]
    ? process.argv[hostArgumentIndex + 1]
    : process.env.HOST || "127.0.0.1";
const apiTargetArgumentIndex = process.argv.indexOf("--api-target");
const apiTargetValue =
  apiTargetArgumentIndex >= 0 && process.argv[apiTargetArgumentIndex + 1]
    ? process.argv[apiTargetArgumentIndex + 1]
    : process.env.STATIC_BUILD_API_URL || "http://127.0.0.1:4000";
const apiTarget = new URL(apiTargetValue);
const apiOrigin = apiTarget.origin;
const mediaTargetArgumentIndex = process.argv.indexOf("--media-target");
const mediaTargetValue =
  mediaTargetArgumentIndex >= 0 && process.argv[mediaTargetArgumentIndex + 1]
    ? process.argv[mediaTargetArgumentIndex + 1]
    : process.env.VITE_COURSE_MEDIA_BASE_URL || "https://dev.veolms.org";
const mediaTarget = new URL(mediaTargetValue);
const mediaOrigin = mediaTarget.origin;
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const resolveRequestPath = async (pathname) => {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = decoded === "/" ? "index.html" : decoded.slice(1);
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) {
    return null;
  }
  try {
    const details = await stat(candidate);
    if (details.isFile()) return candidate;
    if (details.isDirectory()) {
      const routeIndex = path.join(candidate, "index.html");
      const routeIndexDetails = await stat(routeIndex);
      if (routeIndexDetails.isFile()) return routeIndex;
    }
  } catch {}
  return path.join(root, "index.html");
};

const proxyRequestToOrigin = (
  request,
  response,
  requestUrl,
  targetOrigin,
  unavailableError,
) => {
  const targetUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    targetOrigin,
  );
  const sendRequest =
    targetUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const proxyRequest = sendRequest(
    targetUrl,
    {
      method: request.method,
      headers: { ...request.headers, host: targetUrl.host },
    },
    (proxyResponse) => {
      response.writeHead(
        proxyResponse.statusCode || 502,
        proxyResponse.headers,
      );
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }

    response.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      JSON.stringify({
        success: false,
        statusCode: 502,
        error: unavailableError,
      }),
    );
  });

  request.on("aborted", () => proxyRequest.destroy());
  response.on("close", () => {
    if (!response.writableEnded) proxyRequest.destroy();
  });
  request.pipe(proxyRequest);
};

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  if (
    requestUrl.pathname === "/api" ||
    requestUrl.pathname.startsWith("/api/")
  ) {
    proxyRequestToOrigin(request, response, requestUrl, apiOrigin, {
      code: "API_UNAVAILABLE",
      message: "The preview server could not reach the API.",
    });
    return;
  }
  if (
    requestUrl.pathname === "/course-hls" ||
    requestUrl.pathname.startsWith("/course-hls/")
  ) {
    proxyRequestToOrigin(request, response, requestUrl, mediaOrigin, {
      code: "COURSE_MEDIA_UNAVAILABLE",
      message: "The preview server could not reach the course media origin.",
    });
    return;
  }

  const filePath = await resolveRequestPath(requestUrl.pathname);
  if (!filePath) {
    response.writeHead(400).end("Bad request");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": mimeTypes.get(extension) || "application/octet-stream",
    "Cache-Control": filePath.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    Vary: "Accept-Encoding",
  };
  const acceptedEncoding = request.headers["accept-encoding"] || "";
  const source = createReadStream(filePath);

  if (/\bbr\b/.test(acceptedEncoding)) {
    response.writeHead(200, { ...headers, "Content-Encoding": "br" });
    source
      .pipe(
        createBrotliCompress({
          params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
        }),
      )
      .pipe(response);
    return;
  }
  if (/\bgzip\b/.test(acceptedEncoding)) {
    response.writeHead(200, { ...headers, "Content-Encoding": "gzip" });
    source.pipe(createGzip({ level: 6 })).pipe(response);
    return;
  }

  response.writeHead(200, headers);
  source.pipe(response);
}).listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Production-like preview: http://${displayHost}:${port}`);
});
