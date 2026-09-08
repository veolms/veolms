import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonVideoUpload } from "../../src/courses/lesson-video-upload/LessonVideoUpload";

const mediaMocks = vi.hoisted(() => ({
  confirmUpload: vi.fn(),
  createVideoJobProgressEventSource: vi.fn(),
  presignVideoUpload: vi.fn(),
  uploadFileToPresignedUrl: vi.fn(),
}));

vi.mock("../../src/services/media", () => ({
  mediaService: mediaMocks,
}));

describe("LessonVideoUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("EventSource", class EventSource {});
    mediaMocks.createVideoJobProgressEventSource.mockImplementation(() => ({
      addEventListener: vi.fn(),
      close: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: 1,
    }));
    mediaMocks.presignVideoUpload.mockResolvedValue({
      uploadUrl: "https://storage.example/upload",
      mediaAssetId: "11111111-1111-4111-8111-111111111111",
    });
    mediaMocks.uploadFileToPresignedUrl.mockResolvedValue(undefined);
    mediaMocks.confirmUpload.mockResolvedValue({ status: "uploaded" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a persistent modal and only closes from the explicit close button", () => {
    render(<LessonVideoUpload onMediaAttached={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const dialog = screen.getByRole("dialog", {
      name: "Upload Lesson Video",
    });
    expect(
      screen.getByText("Drag and drop your video here"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose Video File" }),
    ).toBeInTheDocument();
    fireEvent.click(dialog);

    expect(
      screen.getByRole("dialog", { name: "Upload Lesson Video" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close video upload dialog" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Upload Lesson Video" }),
    ).toBeNull();
  });

  it("rejects non-video files before creating a media asset", () => {
    render(<LessonVideoUpload onMediaAttached={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const input = screen.getByLabelText("Choose a video file");
    const invalidFile = new File(["not a video"], "notes.txt", {
      type: "text/plain",
    });

    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(screen.getByText("Please choose a video file.")).toBeInTheDocument();
    expect(mediaMocks.presignVideoUpload).not.toHaveBeenCalled();
  });

  it("uploads a valid dropped video and attaches the returned media asset", async () => {
    const onMediaAttached = vi.fn();
    render(<LessonVideoUpload onMediaAttached={onMediaAttached} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const dropzone = screen.getByRole("region", {
      name: "Video upload dropzone",
    });
    const videoFile = new File(["video"], "lesson.mp4", {
      type: "video/mp4",
    });

    fireEvent.drop(dropzone, { dataTransfer: { files: [videoFile] } });

    expect(mediaMocks.presignVideoUpload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Upload Video" }));

    await waitFor(() => {
      expect(mediaMocks.presignVideoUpload).toHaveBeenCalledWith({
        filename: "lesson.mp4",
        contentType: "video/mp4",
        fileSize: videoFile.size,
      });
    });
    expect(mediaMocks.uploadFileToPresignedUrl).toHaveBeenCalled();
    expect(mediaMocks.confirmUpload).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );

    await waitFor(() => {
      expect(mediaMocks.createVideoJobProgressEventSource).toHaveBeenCalled();
    });
    expect(screen.getByText("Preparing…")).toBeInTheDocument();
    expect(screen.queryByText("0%")).toBeNull();
    const progressBar = screen.getByRole("progressbar", {
      name: "Video transcoding progress",
    });
    expect(progressBar).toHaveAttribute("aria-busy", "true");
    expect(progressBar.firstElementChild).toHaveClass(
      "lesson-video-progress-indeterminate",
    );
    const source = mediaMocks.createVideoJobProgressEventSource.mock.results.at(
      -1,
    )?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;
    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "completed",
          progressPercent: 100,
        }),
      }),
    );

    await waitFor(() => {
      expect(onMediaAttached).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      );
    });
  });

  it("updates transcoding progress from an SSE progress event", async () => {
    render(
      <LessonVideoUpload
        mediaAssetId="11111111-1111-4111-8111-111111111111"
        onMediaAttached={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results[0]
      ?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;

    expect(progressHandler).toBeDefined();
    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "processing",
          progressPercent: 42,
        }),
      }),
    );

    await waitFor(() => expect(screen.getByText("42%")).toBeInTheDocument());

    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "queued",
          progressPercent: 0,
        }),
      }),
    );

    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("does not show ready before the SSE job reaches completed status", async () => {
    const onProcessingComplete = vi.fn();
    render(
      <LessonVideoUpload
        mediaAssetId="11111111-1111-4111-8111-111111111111"
        onMediaAttached={vi.fn()}
        onProcessingComplete={onProcessingComplete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results[0]
      ?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;

    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "processing",
          progressPercent: 100,
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("Video is being processed")).toBeInTheDocument();
    });
    expect(screen.queryByText("Video processing complete")).toBeNull();
    expect(screen.getAllByText("Transcoding video").length).toBeGreaterThan(0);

    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "completed",
          progressPercent: 100,
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByText("Video ready").length).toBeGreaterThan(0);
      expect(screen.getByText("Video processing complete")).toBeInTheDocument();
      expect(onProcessingComplete).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      );
    });
  });

  it("renders an already completed video as ready after the initial SSE snapshot", async () => {
    render(
      <LessonVideoUpload
        mediaAssetId="11111111-1111-4111-8111-111111111111"
        onMediaAttached={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results[0]
      ?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;

    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "completed",
          progressPercent: 100,
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByText("Video ready").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Video is being processed")).toBeNull();
    expect(screen.queryByText("Video processing failed")).toBeNull();
  });

  it("shows a replacement picker without detaching the current video", () => {
    render(
      <LessonVideoUpload
        mediaAssetId="11111111-1111-4111-8111-111111111111"
        onMediaAttached={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    expect(
      screen.getByRole("button", { name: "Choose Replacement Video" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Your current lesson binding is unchanged while this replacement is uploaded and processed.",
      ),
    ).not.toBeInTheDocument();
  });

  it("does not invent zero progress before the first valid SSE snapshot", () => {
    render(
      <LessonVideoUpload
        mediaAssetId="11111111-1111-4111-8111-111111111111"
        onMediaAttached={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("preserves the last known progress when the SSE connection reconnects", async () => {
    render(
      <LessonVideoUpload
        mediaAssetId="11111111-1111-4111-8111-111111111111"
        onMediaAttached={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results[0]
      ?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
      readyState: number;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;
    const errorHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "error",
    )?.[1] as ((event: Event) => void) | undefined;

    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "processing",
          progressPercent: 42,
        }),
      }),
    );
    await waitFor(() => expect(screen.getByText("42%")).toBeInTheDocument());

    errorHandler?.(new Event("error"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Live status updates are temporarily unavailable. Reconnecting…",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.queryByText("Video processing failed")).toBeNull();
  });

  it("lets EventSource recover without creating a duplicate stream", async () => {
    render(
      <LessonVideoUpload
        mediaAssetId="11111111-1111-4111-8111-111111111111"
        onMediaAttached={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results[0]
      ?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
      readyState: number;
    };
    const errorHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "error",
    )?.[1] as ((event: Event) => void) | undefined;

    errorHandler?.(
      new MessageEvent("error", {
        data: JSON.stringify({ message: "Video transcoding job not found." }),
      }),
    );

    // A job can be created just after upload confirmation. This expected
    // transient response must not become a fatal Retry Status alert.
    expect(screen.queryByText("Video transcoding job not found.")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(mediaMocks.createVideoJobProgressEventSource).toHaveBeenCalledTimes(
      1,
    );

    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;
    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "provisioning",
          progressPercent: 0,
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Video transcoding job not found.")).toBeNull();
      expect(screen.getByText("Waiting for transcoder")).toBeInTheDocument();
    });
  });

  it("keeps the last known progress when the SSE stream closes", async () => {
    render(
      <LessonVideoUpload
        mediaAssetId="11111111-1111-4111-8111-111111111111"
        onMediaAttached={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results[0]
      ?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
      readyState: number;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;
    const errorHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "error",
    )?.[1] as ((event: Event) => void) | undefined;

    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "processing",
          progressPercent: 42,
        }),
      }),
    );
    await waitFor(() => expect(screen.getByText("42%")).toBeInTheDocument());

    source.readyState = 2;
    errorHandler?.(new Event("error"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Live status updates are temporarily unavailable. Reconnecting automatically…",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.queryByText("Video processing failed")).toBeNull();

    await waitFor(
      () => {
        expect(
          mediaMocks.createVideoJobProgressEventSource,
        ).toHaveBeenCalledTimes(2);
      },
      { timeout: 2_500 },
    );
  });

  it("keeps the current video while a replacement is processing", async () => {
    const onMediaAttached = vi.fn();
    render(
      <LessonVideoUpload
        mediaAssetId="22222222-2222-4222-8222-222222222222"
        onMediaAttached={onMediaAttached}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));
    const input = screen.getByLabelText("Choose a video file");
    const replacementFile = new File(["replacement"], "replacement.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(input, { target: { files: [replacementFile] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload Video" }));

    await waitFor(() => {
      expect(mediaMocks.confirmUpload).toHaveBeenCalled();
      expect(
        mediaMocks.createVideoJobProgressEventSource,
      ).toHaveBeenCalledTimes(2);
    });
    expect(
      mediaMocks.createVideoJobProgressEventSource,
    ).toHaveBeenLastCalledWith("11111111-1111-4111-8111-111111111111");

    expect(onMediaAttached).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Your current lesson binding is unchanged while this replacement is uploaded and processed.",
      ),
    ).toBeInTheDocument();

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results.at(
      -1,
    )?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;
    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "completed",
          progressPercent: 100,
        }),
      }),
    );

    await waitFor(() => {
      expect(onMediaAttached).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      );
    });
  });

  it("preserves the current video when a replacement fails", async () => {
    const onMediaAttached = vi.fn();
    render(
      <LessonVideoUpload
        mediaAssetId="22222222-2222-4222-8222-222222222222"
        onMediaAttached={onMediaAttached}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));
    const input = screen.getByLabelText("Choose a video file");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["replacement"], "replacement.mp4", {
            type: "video/mp4",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload Video" }));

    await waitFor(() => {
      expect(
        mediaMocks.createVideoJobProgressEventSource,
      ).toHaveBeenCalledTimes(2);
    });

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results.at(
      -1,
    )?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;
    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "failed",
          progressPercent: 61,
          error: "The source video is corrupted.",
        }),
      }),
    );

    await waitFor(() => {
      expect(
        screen.getAllByText("The source video is corrupted."),
      ).not.toHaveLength(0);
    });
    expect(onMediaAttached).not.toHaveBeenCalled();
    expect(screen.getAllByText("Current video kept").length).toBeGreaterThan(0);
  });

  it("allows retrying the lesson attachment after the replacement is ready", async () => {
    const onMediaAttached = vi
      .fn()
      .mockRejectedValueOnce(new Error("Lesson save failed."))
      .mockResolvedValue(undefined);
    render(
      <LessonVideoUpload
        mediaAssetId="22222222-2222-4222-8222-222222222222"
        onMediaAttached={onMediaAttached}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New" }));
    fireEvent.change(screen.getByLabelText("Choose a video file"), {
      target: {
        files: [
          new File(["replacement"], "replacement.mp4", {
            type: "video/mp4",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload Video" }));

    await waitFor(() => {
      expect(
        mediaMocks.createVideoJobProgressEventSource,
      ).toHaveBeenCalledTimes(2);
    });

    const source = mediaMocks.createVideoJobProgressEventSource.mock.results.at(
      -1,
    )?.value as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const progressHandler = source.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "progress",
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;
    progressHandler?.(
      new MessageEvent("progress", {
        data: JSON.stringify({
          status: "completed",
          progressPercent: 100,
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Lesson save failed.")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Retry Attachment" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Choose another video" }),
      ).toBeInTheDocument();
    });
    expect(onMediaAttached).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Video ready").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Retry Attachment" }));

    await waitFor(() => expect(onMediaAttached).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Lesson save failed.")).toBeNull();
  });
});
