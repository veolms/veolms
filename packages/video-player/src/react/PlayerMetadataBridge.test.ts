import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  VideoNetworkRequest,
  VideoNetworkResponse,
  VideoSource,
} from "../core/types";
import { defaultStoryboardLoader } from "./PlayerMetadataBridge";

afterEach(() => vi.unstubAllGlobals());

describe("defaultStoryboardLoader", () => {
  it("uses the source networking hooks for authenticated thumbnail requests", async () => {
    const requestFilter = vi.fn((request: VideoNetworkRequest) => {
      request.uris = ["https://cdn.example/signed/storyboard.vtt"];
      request.headers.Authorization = "Bearer refreshed";
      request.allowCrossSiteCredentials = true;
    });
    const responseFilter = vi.fn((response: VideoNetworkResponse) => {
      response.data = new TextEncoder().encode("WEBVTT\n\nfiltered").buffer;
    });
    const source: VideoSource = {
      src: "https://cdn.example/lesson.mpd",
      networking: { requestFilter, responseFilter },
    };
    const fetchMock = vi.fn(async () =>
      new Response("WEBVTT\n\noriginal", {
        status: 200,
        headers: { "content-type": "text/vtt" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await defaultStoryboardLoader(
      "https://cdn.example/storyboard.vtt",
      { signal: new AbortController().signal, source },
    );

    expect(requestFilter).toHaveBeenCalledWith(
      expect.objectContaining({ type: "thumbnail", method: "GET" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example/signed/storyboard.vtt",
      expect.objectContaining({
        credentials: "include",
        headers: { Authorization: "Bearer refreshed" },
      }),
    );
    expect(responseFilter).toHaveBeenCalledWith(
      expect.objectContaining({ type: "thumbnail", status: 200 }),
    );
    expect(result).toBe("WEBVTT\n\nfiltered");
  });
});
