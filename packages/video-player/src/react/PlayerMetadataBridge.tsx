import { useEffect, type RefObject } from "react";
import type { ChapterInput } from "../chapters/chapterTypes";
import { resolveChapters } from "../chapters/resolveChapters";
import { parseStoryboard } from "../storyboard/parseStoryboard";
import type {
  StoryboardFrame,
  StoryboardTrack,
} from "../storyboard/storyboardTypes";
import type {
  VideoNetworkRequest,
  VideoNetworkResponse,
  VideoSource,
} from "../core/types";
import { usePlayerController } from "./context";
import { useDuration, usePlayerState } from "./usePlayerState";

export type StoryboardSource =
  | string
  | readonly StoryboardFrame[]
  | StoryboardTrack;

export interface StoryboardLoaderContext {
  signal: AbortSignal;
  source: VideoSource | null;
}

export type StoryboardLoader = (
  url: string,
  context: StoryboardLoaderContext,
) => Promise<string>;

export interface PlayerMetadataBridgeProps {
  chapters?: readonly ChapterInput[];
  manualChapters?: readonly ChapterInput[];
  description?: string;
  storyboard?: StoryboardSource;
  storyboardLoader?: StoryboardLoader;
  onStoryboardError?: (error: unknown) => void;
}

function resolveStoryboardImageUrls(
  frames: readonly StoryboardFrame[],
  documentUrl: string,
): StoryboardFrame[] {
  return frames.map((frame) => {
    try {
      return {
        ...frame,
        imageUrl: new URL(frame.imageUrl, documentUrl).href,
      };
    } catch {
      return frame;
    }
  });
}

function resolveDocumentUrl(url: string): string {
  if (typeof document === "undefined") return url;
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

function responseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

export const defaultStoryboardLoader: StoryboardLoader = async (
  url,
  { signal, source },
) => {
  const request: VideoNetworkRequest = {
    type: "thumbnail",
    uris: [url],
    method: "GET",
    headers: {},
    body: null,
    allowCrossSiteCredentials: false,
  };
  await source?.networking?.requestFilter?.(request);

  const requestUrl = request.uris[0] ?? url;
  const response = await fetch(requestUrl, {
    signal,
    method: request.method,
    headers: request.headers,
    body: request.body as BodyInit | null,
    credentials: request.allowCrossSiteCredentials ? "include" : "same-origin",
  });
  const normalizedResponse: VideoNetworkResponse = {
    type: "thumbnail",
    uri: response.url || requestUrl,
    originalUri: url,
    headers: responseHeaders(response),
    data: await response.arrayBuffer(),
    status: response.status,
  };
  await source?.networking?.responseFilter?.(normalizedResponse);

  const status = normalizedResponse.status ?? response.status;
  if (status < 200 || status >= 300) {
    throw new Error(`Storyboard request failed with ${status}.`);
  }
  return new TextDecoder().decode(normalizedResponse.data);
};

export function PlayerMetadataBridge({
  chapters,
  description,
  manualChapters,
  onStoryboardError,
  storyboard,
  storyboardLoader = defaultStoryboardLoader,
}: PlayerMetadataBridgeProps) {
  const controller = usePlayerController();
  const duration = useDuration();
  const source = usePlayerState(({ media }) => media.source);

  useEffect(() => {
    const resolved = resolveChapters({
      manualChapters,
      metadataChapters: chapters,
      description,
      duration: duration > 0 ? duration : undefined,
    });
    controller.setChapters(resolved.chapters);
  }, [chapters, controller, description, duration, manualChapters]);

  useEffect(() => {
    if (!storyboard) {
      controller.setStoryboard([]);
      return undefined;
    }
    if (typeof storyboard !== "string") {
      controller.setStoryboard(
        Array.isArray(storyboard)
          ? storyboard
          : (storyboard as StoryboardTrack).frames,
      );
      return undefined;
    }

    const abortController = new AbortController();
    const storyboardUrl = resolveDocumentUrl(storyboard);
    controller.setStoryboard([]);
    void storyboardLoader(storyboardUrl, {
      signal: abortController.signal,
      source,
    })
      .then((vtt) => {
        if (abortController.signal.aborted) return;
        controller.setStoryboard(
          resolveStoryboardImageUrls(parseStoryboard(vtt), storyboardUrl),
        );
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        controller.setStoryboard([]);
        onStoryboardError?.(error);
      });
    return () => abortController.abort();
  }, [controller, onStoryboardError, source, storyboard, storyboardLoader]);

  return null;
}
