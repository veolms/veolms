/**
 * Object storage for the flow tests, in memory. The API signs upload links
 * as it does in production (signing needs no network), and a test "uploads"
 * by handing the link back here, as a browser would send the file to it.
 * Asking whether a file is there answers from what was uploaded; nothing
 * reaches a real bucket.
 */
import type { S3StorageService } from "@veolms/storage";

interface StoredObject {
  contentType: string;
  contentLength?: number;
}

export class FakeObjectStorage {
  /** Upload links the API signed, with the file each one is for. */
  readonly #signed = new Map<string, { key: string } & StoredObject>();
  readonly #objects = new Map<string, StoredObject>();

  /** Replaces, on the API's storage, the calls that would reach a bucket. */
  install(storage: S3StorageService): void {
    const signPut = storage.getPresignedPutUrl.bind(storage);
    Object.assign(storage, {
      getPresignedPutUrl: async (
        key: string,
        contentType: string,
        contentLength?: number,
        expiresIn?: number,
        options?: { bindContentType?: boolean },
      ) => {
        const url = await signPut(
          key,
          contentType,
          contentLength,
          expiresIn,
          options,
        );
        this.#signed.set(url, { key, contentType, contentLength });
        return url;
      },
      headObject: async (key: string) => this.#objects.get(key) ?? null,
      ensureBucketCors: async () => {},
    });
  }

  /** Sends the file to an upload link the API gave out. */
  upload(uploadUrl: string): void {
    const signed = this.#signed.get(uploadUrl);
    if (!signed) throw new Error(`The API never signed ${uploadUrl}`);
    this.#objects.set(signed.key, {
      contentType: signed.contentType,
      contentLength: signed.contentLength,
    });
  }
}
