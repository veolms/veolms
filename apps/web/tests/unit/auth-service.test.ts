import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authService,
  resolveAvatarUploadContentType,
} from "../../src/services/auth/auth.service";

const apiMocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("../../src/lib/api-client", () => ({ api: apiMocks }));

describe("avatar upload service", () => {
  const createAvatarFile = (name = "photo.jpg", type = "image/jpeg"): File =>
    new File([new Uint8Array([1, 2, 3])], name, { type });

  beforeEach(() => {
    apiMocks.post.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves an empty browser MIME type from the image extension", () => {
    expect(
      resolveAvatarUploadContentType({ name: "photo.JPG", type: "" }),
    ).toBe("image/jpeg");
    expect(
      resolveAvatarUploadContentType({ name: "photo.txt", type: "" }),
    ).toBeNull();
  });

  it("presigns, uploads directly, and confirms the avatar", async () => {
    const file = createAvatarFile();
    const profile = {
      avatarDataUrl: "/cdn/public/avatars/user/160.webp",
    };
    apiMocks.post
      .mockResolvedValueOnce({ uploadUrl: "https://storage.example/avatar" })
      .mockResolvedValueOnce(profile);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(authService.uploadAvatarPhoto(file)).resolves.toBe(profile);

    const payload = { contentType: "image/jpeg", fileSize: file.size };
    expect(apiMocks.post).toHaveBeenNthCalledWith(
      1,
      "/auth/me/avatar/presign",
      payload,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.example/avatar",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: file,
        credentials: "omit",
      }),
    );
    expect(apiMocks.post).toHaveBeenNthCalledWith(
      2,
      "/auth/me/avatar/complete",
      payload,
    );
  });

  it("does not upload or complete when presigning fails", async () => {
    const file = createAvatarFile();
    const presignError = new Error("presign failed");
    apiMocks.post.mockRejectedValueOnce(presignError);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(authService.uploadAvatarPhoto(file)).rejects.toBe(
      presignError,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(apiMocks.post).not.toHaveBeenCalledWith(
      "/auth/me/avatar/complete",
      expect.anything(),
    );
  });

  it("does not complete when the storage upload fails", async () => {
    const file = createAvatarFile();
    apiMocks.post.mockResolvedValueOnce({
      uploadUrl: "https://storage.example/avatar",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    );

    await expect(authService.uploadAvatarPhoto(file)).rejects.toThrow(
      "Storage upload failed",
    );

    expect(apiMocks.post).not.toHaveBeenCalledWith(
      "/auth/me/avatar/complete",
      expect.anything(),
    );
  });

  it("rejects unsupported files before requesting a presigned URL", async () => {
    const file = createAvatarFile("photo.jpg", "text/plain");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(authService.uploadAvatarPhoto(file)).rejects.toThrow(
      "Choose a JPEG, PNG, WebP, or GIF image.",
    );

    expect(apiMocks.post).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
