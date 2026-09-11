import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LessonResource } from "@veolms/contracts";
import {
  LessonResourceManager,
  toLessonResourceItem,
} from "../../src/courses/lesson-resources/LessonResourceManager";

const mediaMocks = vi.hoisted(() => ({
  confirmUpload: vi.fn(),
  presignMediaUpload: vi.fn(),
  uploadFileToPresignedUrl: vi.fn(),
}));

vi.mock("../../src/services/media", () => ({
  mediaService: mediaMocks,
}));

const lessonId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";
const mediaAssetId = "33333333-3333-4333-8333-333333333333";

function createResource(
  overrides: Partial<LessonResource> = {},
): LessonResource {
  return {
    id: resourceId,
    lessonId,
    mediaAssetId,
    title: "Source_Code.txt",
    description: null,
    position: 0,
    createdAt: "2026-09-08T00:00:00.000Z",
    mediaAsset: {
      originalFilename: "Source_Code.txt",
      mimeType: "text/plain",
      sizeBytes: 850,
      status: "uploaded",
    },
    ...overrides,
  };
}

describe("LessonResourceManager", () => {
  it("renders persisted resource metadata and does not show a media selector", () => {
    const resource = toLessonResourceItem(createResource());

    render(
      <LessonResourceManager
        courseId="course-id"
        lessonId={lessonId}
        resources={[resource]}
        onCreateResource={vi.fn()}
        onResourceAdded={vi.fn()}
        onDeleteResource={vi.fn()}
        onResourceRemoved={vi.fn()}
      />,
    );

    expect(screen.getByText("Source_Code.txt")).toBeInTheDocument();
    expect(screen.getByText("TXT")).toBeInTheDocument();
    expect(screen.getByText("850 B")).toBeInTheDocument();
    expect(screen.queryByText("Select from Media")).toBeNull();
  });

  it("uploads, confirms, and attaches a new resource", async () => {
    const onCreateResource = vi.fn().mockResolvedValue({
      ...createResource({
        id: "44444444-4444-4444-8444-444444444444",
        mediaAssetId,
        title: "notes.txt",
      }),
      mediaAsset: {
        originalFilename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        status: "uploaded",
      },
    });
    const onResourceAdded = vi.fn();
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });

    mediaMocks.presignMediaUpload.mockResolvedValue({
      uploadUrl: "https://storage.example/upload",
      mediaAssetId,
    });
    mediaMocks.uploadFileToPresignedUrl.mockImplementation(
      async (_url, _file, onProgress) => {
        onProgress?.({
          loadedBytes: file.size,
          totalBytes: file.size,
          percent: 100,
        });
      },
    );
    mediaMocks.confirmUpload.mockResolvedValue({ status: "uploaded" });

    render(
      <LessonResourceManager
        courseId="course-id"
        lessonId={lessonId}
        resources={[]}
        onCreateResource={onCreateResource}
        onResourceAdded={onResourceAdded}
        onDeleteResource={vi.fn()}
        onResourceRemoved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Choose a lesson resource"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mediaMocks.presignMediaUpload).toHaveBeenCalledWith({
        filename: "notes.txt",
        contentType: "text/plain",
        fileSize: file.size,
        type: "document",
      });
    });
    expect(mediaMocks.uploadFileToPresignedUrl).toHaveBeenCalled();
    expect(mediaMocks.confirmUpload).toHaveBeenCalledWith(mediaAssetId);
    expect(onCreateResource).toHaveBeenCalledWith({
      mediaAssetId,
      title: "notes.txt",
    });
    expect(onResourceAdded).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "notes.txt",
        type: "TXT",
        size: "5 B",
        mediaAssetId,
      }),
    );
  });

  it("removes a resource only after the delete request succeeds", async () => {
    const resource = toLessonResourceItem(createResource());
    const onDeleteResource = vi.fn().mockResolvedValue(undefined);
    const onResourceRemoved = vi.fn();

    render(
      <LessonResourceManager
        courseId="course-id"
        lessonId={lessonId}
        resources={[resource]}
        onCreateResource={vi.fn()}
        onResourceAdded={vi.fn()}
        onDeleteResource={onDeleteResource}
        onResourceRemoved={onResourceRemoved}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Source_Code.txt" }),
    );

    await waitFor(() => {
      expect(onDeleteResource).toHaveBeenCalledWith(resourceId);
      expect(onResourceRemoved).toHaveBeenCalledWith(resource);
    });
  });
});
