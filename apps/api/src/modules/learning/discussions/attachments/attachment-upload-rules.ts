/**
 * Whether taking `incomingBytes` more would put an account past its upload
 * allowance. An account that has used the allowance up is refused whatever
 * the size, which is what stops a file of no declared size. A quota of 0
 * means no limit.
 */
export function exceedsUploadQuota(
  usedBytes: number,
  incomingBytes: number,
  quotaBytes: number,
): boolean {
  if (quotaBytes <= 0) return false;
  return usedBytes >= quotaBytes || usedBytes + incomingBytes > quotaBytes;
}

/**
 * The file an upload slot leaves behind when its file was stored under a
 * different name from the one the slot was opened with, or null when it
 * left none.
 *
 * A slot is opened for one file name (`<id>.png`) and hands out an address
 * to put the bytes at. The same slot also accepts the file through the API,
 * which names the stored file after what was actually sent (`<id>.pdf`). A
 * caller that does both leaves the first file in storage with no record
 * pointing at it, where the clean-up job, which starts from the records,
 * never finds it.
 *
 * Only a file in the same place as the stored one is named: this is used to
 * remove a file, and a key that points anywhere else is left alone.
 */
export function supersededUploadFileName(
  previousStorageKey: string,
  storedStorageKey: string,
): string | null {
  if (previousStorageKey === storedStorageKey) return null;
  const directory = storedStorageKey.slice(
    0,
    storedStorageKey.lastIndexOf("/") + 1,
  );
  if (!previousStorageKey.startsWith(directory)) return null;
  const fileName = previousStorageKey.slice(directory.length);
  return fileName && !fileName.includes("/") ? fileName : null;
}

/**
 * Whether a file stored for an upload slot is one no record points at, given
 * what the slot's record points at now (nothing, when the record is gone).
 *
 * Asked by a request that stored its file and then found the slot already
 * filled by another request. Its file has to go, or it stays in storage
 * where the clean-up job, which starts from the records, never finds it.
 * The one exception is two requests that stored under the same name: the
 * record then points at that very file, and removing it would take the file
 * from under the upload that was accepted.
 */
export function isUnrecordedUpload(
  storedStorageKey: string,
  recordedStorageKey: string | null | undefined,
): boolean {
  return recordedStorageKey !== storedStorageKey;
}
