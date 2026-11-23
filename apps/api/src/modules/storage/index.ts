/**
 * Public Storage module surface: the upload modules (chat, discussions,
 * support) ask the guard whether a new file fits before recording it; the
 * background job recounts through the service.
 */
export {
  createStorageGuard,
  createStorageService,
  isStorageLimited,
  StorageErrors,
  type StorageGuard,
  type StorageService,
} from "./storage.service.ts";
