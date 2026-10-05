import { PassThrough, Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";

export const streamTimeout = 90_000;

const MODULE_PRELOAD_LINK = '<link rel="modulepreload" ';
const LOW_PRIORITY_MODULE_PRELOAD_LINK =
  '<link rel="modulepreload" fetchpriority="low" ';

/**
 * The document preloads every startup chunk. At the browser's default (high)
 * priority those downloads compete with the render-blocking stylesheets and
 * the LCP image on a slow connection, although none of them is needed to
 * paint the prerendered markup. Marking the preloads low priority keeps them
 * discovered early but lets the bytes that paint the page go first.
 */
function createLowPriorityModulePreloadTransform() {
  // Hold back a short tail so a link split across two chunks is still found.
  let carry = "";
  // Chunks can end in the middle of a multi-byte character.
  const decoder = new StringDecoder("utf8");
  return new Transform({
    transform(chunk, _encoding, callback) {
      const text = (carry + decoder.write(chunk)).replaceAll(
        MODULE_PRELOAD_LINK,
        LOW_PRIORITY_MODULE_PRELOAD_LINK,
      );
      const keep = Math.min(MODULE_PRELOAD_LINK.length - 1, text.length);
      carry = text.slice(text.length - keep);
      callback(null, text.slice(0, text.length - keep));
    },
    flush(callback) {
      callback(null, carry + decoder.end());
    },
  });
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1_000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(
            body.pipe(createLowPriorityModulePreloadTransform()),
          );

          responseHeaders.set("Content-Type", "text/html; charset=utf-8");
          pipe(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );
  });
}
