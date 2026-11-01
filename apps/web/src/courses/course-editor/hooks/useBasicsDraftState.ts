import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import {
  type ThumbnailUploadStatus,
  type BasicsFormState,
  initialBasicsState,
  isBasicsEqual,
} from "../basicsState";

export interface UseBasicsDraftStateArgs {
  activeEditId: string | null;
}

export interface UseBasicsDraftStateResult {
  setServerBasics: Dispatch<SetStateAction<BasicsFormState>>;
  setBasicsDraft: Dispatch<SetStateAction<BasicsFormState>>;
  isBasicsDirty: boolean;
  isBasicsDirtyRef: RefObject<boolean>;
  courseTitle: string;
  shortDescription: string;
  courseDescription: string;
  categoryId: string;
  difficultyLevel: "" | "beginner" | "intermediate" | "advanced";
  language: string;
  instructorAlias: string;
  showInstructorName: boolean;
  serverBasicsRef: RefObject<BasicsFormState>;
  basicsDraftRef: RefObject<BasicsFormState>;
  setCourseTitle: (title: string) => void;
  setShortDescription: (shortDescription: string) => void;
  setCourseDescription: (description: string) => void;
  setCategoryId: (categoryId: string) => void;
  setInstructorAlias: (instructorAlias: string) => void;
  setShowInstructorName: (showInstructorName: boolean) => void;
  currentCourseId: string | null;
  setCurrentCourseId: Dispatch<SetStateAction<string | null>>;
  courseVersion: number;
  setCourseVersion: Dispatch<SetStateAction<number>>;
  courseVersionRef: RefObject<number>;
  currentCourseIdRef: RefObject<string | null>;
  thumbnail: string | null;
  setThumbnail: Dispatch<SetStateAction<string | null>>;
  thumbnailMediaId: string | null | undefined;
  setThumbnailMediaId: Dispatch<SetStateAction<string | null | undefined>>;
  setThumbnailUploadStatus: Dispatch<SetStateAction<ThumbnailUploadStatus>>;
  thumbnailUploadError: string | null;
  setThumbnailUploadError: Dispatch<SetStateAction<string | null>>;
  thumbnailInputRef: RefObject<HTMLInputElement | null>;
  thumbnailMediaIdRef: RefObject<string | null>;
  thumbnailUploadStatusRef: RefObject<ThumbnailUploadStatus>;
  thumbnailDirtyRef: RefObject<boolean>;
  thumbnailObjectUrlRef: RefObject<string | null>;
  thumbnailUploadAbortControllerRef: RefObject<AbortController | null>;
  thumbnailRequestIdRef: RefObject<number>;
  thumbnailMountedRef: RefObject<boolean>;
  isThumbnailBusy: boolean;
  videoTrailer: string | null;
  setVideoTrailer: Dispatch<SetStateAction<string | null>>;
  videoTrailerInputRef: RefObject<HTMLInputElement | null>;
}

export function useBasicsDraftState({
  activeEditId,
}: UseBasicsDraftStateArgs): UseBasicsDraftStateResult {
  // Basics server-confirmed baseline and local draft states
  const [serverBasics, setServerBasics] =
    useState<BasicsFormState>(initialBasicsState);
  const [basicsDraft, setBasicsDraft] =
    useState<BasicsFormState>(initialBasicsState);

  // Derived isDirty for Basics
  const isBasicsDirty = useMemo(
    () => !isBasicsEqual(basicsDraft, serverBasics),
    [basicsDraft, serverBasics],
  );
  const isBasicsDirtyRef = useRef(isBasicsDirty);
  isBasicsDirtyRef.current = isBasicsDirty;

  const courseTitle = basicsDraft.title;
  const shortDescription = basicsDraft.shortDescription;
  const courseDescription = basicsDraft.description;
  const categoryId = basicsDraft.categoryId;
  const difficultyLevel = basicsDraft.difficulty;
  const language = basicsDraft.language;
  const instructorAlias = basicsDraft.instructorAlias;
  const showInstructorName = basicsDraft.showInstructorName;

  const serverBasicsRef = useRef<BasicsFormState>(serverBasics);
  serverBasicsRef.current = serverBasics;
  const basicsDraftRef = useRef<BasicsFormState>(basicsDraft);
  basicsDraftRef.current = basicsDraft;

  const setCourseTitle = (title: string) => {
    setBasicsDraft((prev) => ({ ...prev, title }));
    basicsDraftRef.current = { ...basicsDraftRef.current, title };
  };
  const setShortDescription = (shortDescription: string) => {
    setBasicsDraft((prev) => ({ ...prev, shortDescription }));
    basicsDraftRef.current = { ...basicsDraftRef.current, shortDescription };
  };
  const setCourseDescription = (description: string) => {
    setBasicsDraft((prev) => ({ ...prev, description }));
    basicsDraftRef.current = { ...basicsDraftRef.current, description };
  };
  const setCategoryId = (categoryId: string) => {
    setBasicsDraft((prev) => ({ ...prev, categoryId }));
    basicsDraftRef.current = { ...basicsDraftRef.current, categoryId };
  };
  const setInstructorAlias = (instructorAlias: string) => {
    setBasicsDraft((prev) => ({ ...prev, instructorAlias }));
    basicsDraftRef.current = { ...basicsDraftRef.current, instructorAlias };
  };
  const setShowInstructorName = (showInstructorName: boolean) => {
    setBasicsDraft((prev) => ({ ...prev, showInstructorName }));
    basicsDraftRef.current = { ...basicsDraftRef.current, showInstructorName };
  };

  const [currentCourseId, setCurrentCourseId] = useState<string | null>(
    activeEditId,
  );
  const [courseVersion, setCourseVersion] = useState<number>(1);
  const courseVersionRef = useRef<number>(courseVersion);
  courseVersionRef.current = courseVersion;
  const currentCourseIdRef = useRef<string | null>(currentCourseId);

  useEffect(() => {
    setCurrentCourseId(activeEditId);
    currentCourseIdRef.current = activeEditId;
    setCourseVersion(1);
    courseVersionRef.current = 1;
  }, [activeEditId]);

  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailMediaId, setThumbnailMediaId] = useState<
    string | null | undefined
  >(undefined);
  // The upload state is kept for concurrency, rollback, and server-refresh
  // protection. The selected file is shown immediately, so upload progress is
  // intentionally not rendered in the course editor.
  const [thumbnailUploadStatus, setThumbnailUploadStatus] =
    useState<ThumbnailUploadStatus>("idle");
  const [thumbnailUploadError, setThumbnailUploadError] = useState<
    string | null
  >(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const thumbnailMediaIdRef = useRef<string | null>(null);
  const thumbnailUploadStatusRef = useRef<ThumbnailUploadStatus>("idle");
  thumbnailUploadStatusRef.current = thumbnailUploadStatus;
  const thumbnailDirtyRef = useRef(false);
  const thumbnailObjectUrlRef = useRef<string | null>(null);
  const thumbnailUploadAbortControllerRef = useRef<AbortController | null>(
    null,
  );
  const thumbnailRequestIdRef = useRef(0);
  const thumbnailMountedRef = useRef(true);
  const isThumbnailBusy =
    thumbnailUploadStatus === "uploading" ||
    thumbnailUploadStatus === "confirming" ||
    thumbnailUploadStatus === "processing" ||
    thumbnailUploadStatus === "saving";

  useEffect(() => {
    thumbnailMountedRef.current = true;
    return () => {
      thumbnailMountedRef.current = false;
      thumbnailUploadAbortControllerRef.current?.abort();
      if (thumbnailObjectUrlRef.current) {
        URL.revokeObjectURL(thumbnailObjectUrlRef.current);
      }
    };
  }, []);

  const [videoTrailer, setVideoTrailer] = useState<string | null>(null);
  const videoTrailerInputRef = useRef<HTMLInputElement | null>(null);
  return {
    setServerBasics,
    setBasicsDraft,
    isBasicsDirty,
    isBasicsDirtyRef,
    courseTitle,
    shortDescription,
    courseDescription,
    categoryId,
    difficultyLevel,
    language,
    instructorAlias,
    showInstructorName,
    serverBasicsRef,
    basicsDraftRef,
    setCourseTitle,
    setShortDescription,
    setCourseDescription,
    setCategoryId,
    setInstructorAlias,
    setShowInstructorName,
    currentCourseId,
    setCurrentCourseId,
    courseVersion,
    setCourseVersion,
    courseVersionRef,
    currentCourseIdRef,
    thumbnail,
    setThumbnail,
    thumbnailMediaId,
    setThumbnailMediaId,
    setThumbnailUploadStatus,
    thumbnailUploadError,
    setThumbnailUploadError,
    thumbnailInputRef,
    thumbnailMediaIdRef,
    thumbnailUploadStatusRef,
    thumbnailDirtyRef,
    thumbnailObjectUrlRef,
    thumbnailUploadAbortControllerRef,
    thumbnailRequestIdRef,
    thumbnailMountedRef,
    isThumbnailBusy,
    videoTrailer,
    setVideoTrailer,
    videoTrailerInputRef,
  };
}
