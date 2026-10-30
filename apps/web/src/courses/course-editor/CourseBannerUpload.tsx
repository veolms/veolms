import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { ImageIcon } from "@phosphor-icons/react/Image";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { MEDIA_MAX_SIZES } from "@veolms/contracts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { CourseOverviewHero } from "../overview/CourseOverviewHero";
import { mediaService } from "../../services/media";
import { waitForCourseThumbnailCdnUrl } from "../courseMedia";
import { getThumbnailUploadErrorMessage } from "./basicsState";

type BannerStatus = "idle" | "uploading" | "saving" | "error";

export interface CourseBannerUploadProps {
  courseId: string | null;
  disabled: boolean;
  /** The banner the editor data holds, as last read from the server. */
  serverBannerMediaId: string | null | undefined;
  serverBannerUrl: string | null | undefined;
  /** Saves pending basics first, so the banner's version is current. */
  flushBasicsPersistence: () => Promise<boolean>;
  /** Writes `bannerMediaId` through `PATCH /courses/:id/basics`; resolves with the new version. */
  saveBannerMediaId: (bannerMediaId: string | null) => Promise<number>;
  /** What the overview page's hero shows, as the form now holds it. */
  hero: {
    title: string;
    shortDescription: string;
    sections: number;
    lessons: number;
    duration: string;
    thumbnail: string | null;
  };
}

/**
 * The width the hero is drawn at before it is scaled down to the card: a
 * laptop's course page, wide enough for the hero's desktop layout.
 */
const DESKTOP_HERO_WIDTH = 1280;

/**
 * The wide picture behind the overview page's hero on desktop. The card
 * shows that hero as the course page draws it on a laptop, scaled down:
 * with the thumbnail fading in from the right until a banner is added, with
 * the banner after. The banner goes through the same public image pipeline
 * as the thumbnail (aspect kept) and is saved as soon as it is processed.
 */
export function CourseBannerUpload({
  courseId,
  disabled,
  serverBannerMediaId,
  serverBannerUrl,
  flushBasicsPersistence,
  saveBannerMediaId,
  hero,
}: CourseBannerUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [banner, setBanner] = useState<string | null>(serverBannerUrl ?? null);
  const [status, setStatus] = useState<BannerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const busy = status === "uploading" || status === "saving";

  // The server's banner wins whenever nothing of ours is in flight.
  useEffect(() => {
    if (busy) return;
    if (!objectUrlRef.current) setBanner(serverBannerUrl ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBannerMediaId, serverBannerUrl]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const fail = (message: string) => {
    setError(message);
    setStatus("error");
  };

  const releaseObjectUrl = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadFile(file);
  }

  async function uploadFile(file: File) {
    if (busy) return;

    if (!file.type.toLowerCase().startsWith("image/")) {
      return fail("Please choose an image file for the banner.");
    }
    if (file.size <= 0) return fail("The selected banner is empty.");
    if (file.size > MEDIA_MAX_SIZES.image) {
      return fail("Banner images must be 10 MB or smaller.");
    }
    if (!courseId) {
      return fail("Save the course title before uploading a banner.");
    }

    const requestId = ++requestIdRef.current;
    const isActive = () => requestIdRef.current === requestId;
    const previous = banner;
    const preview = URL.createObjectURL(file);
    releaseObjectUrl();
    objectUrlRef.current = preview;
    setBanner(preview);
    setError(null);
    setStatus("uploading");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      if (!(await flushBasicsPersistence())) {
        throw new Error("Save the course details before uploading a banner.");
      }
      const presigned = await mediaService.presignMediaUpload({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
        type: "image",
        visibility: "public",
      });
      await mediaService.uploadFileToPresignedUrl(
        presigned.uploadUrl,
        file,
        undefined,
        abort.signal,
      );
      await mediaService.confirmUpload(presigned.mediaAssetId);
      const processedUrl = await waitForCourseThumbnailCdnUrl(
        presigned.mediaAssetId,
        { signal: abort.signal },
      );
      if (!isActive()) return;

      setStatus("saving");
      await saveBannerMediaId(presigned.mediaAssetId);
      if (!isActive()) return;

      releaseObjectUrl();
      setBanner(processedUrl);
      setStatus("idle");
    } catch (caught: unknown) {
      if (
        !isActive() ||
        (caught instanceof Error && caught.name === "AbortError")
      ) {
        return;
      }
      releaseObjectUrl();
      setBanner(previous);
      fail(
        getThumbnailUploadErrorMessage(caught).replace(/thumbnail/gi, "banner"),
      );
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
    }
  }

  async function remove() {
    if (busy) return;
    const previous = banner;
    const requestId = ++requestIdRef.current;
    releaseObjectUrl();
    setBanner(null);
    setError(null);

    if (!courseId || !serverBannerMediaId) {
      setStatus("idle");
      return;
    }

    setStatus("saving");
    try {
      if (!(await flushBasicsPersistence())) {
        throw new Error("Save the course details before removing the banner.");
      }
      await saveBannerMediaId(null);
      if (requestIdRef.current === requestId) setStatus("idle");
    } catch (caught: unknown) {
      if (requestIdRef.current !== requestId) return;
      setBanner(previous);
      fail(
        caught instanceof Error
          ? caught.message
          : "Banner removal failed. Please try again.",
      );
    }
  }

  const locked = disabled || busy;
  const acceptsDrop = (event: DragEvent) =>
    !locked && event.dataTransfer.types.includes("Files");

  return (
    <div className="flex min-w-0 flex-col sm:col-span-2">
      <input
        type="file"
        ref={inputRef}
        disabled={locked}
        onChange={selectFile}
        accept="image/*"
        hidden
      />
      <h3 className="m-0 mb-1 text-[0.86rem] font-semibold text-(--text-secondary)">
        Banner (Optional)
      </h3>
      <p className="m-0 mb-3 min-h-[1.15rem] text-[0.78rem] text-(--muted)">
        The top of the course page on desktop, as students will see it.
        {banner
          ? " The banner fills it behind the title."
          : " Without a banner it shows the thumbnail; add one to fill it."}
      </p>

      <div
        className={`relative rounded-[18px] outline-2 outline-offset-2 transition-[outline-color] duration-150 ${
          dragging ? "outline-(--accent)" : "outline-transparent"
        }`}
        onDragEnter={(event) => {
          if (!acceptsDrop(event)) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (!acceptsDrop(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            return;
          }
          setDragging(false);
        }}
        onDrop={(event) => {
          if (!acceptsDrop(event)) return;
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void uploadFile(file);
        }}
      >
        <ScaledDesktopPreview width={DESKTOP_HERO_WIDTH}>
          <CourseOverviewHero
            placement="card"
            title={hero.title.trim() || "Course Title"}
            shortDescription={hero.shortDescription}
            sections={hero.sections}
            lessons={hero.lessons}
            duration={hero.duration}
            thumbnail={hero.thumbnail ?? ""}
            banner={banner ?? undefined}
          />
        </ScaledDesktopPreview>

        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-black/55 px-4 text-center text-[0.82rem] font-semibold text-white">
            Drop an image for the banner
          </div>
        ) : null}
        {busy ? (
          <span className="absolute bottom-2 left-2 z-20 rounded-md bg-black/60 px-2 py-1 text-[0.72rem] text-white">
            {status === "uploading" ? "Uploading…" : "Saving…"}
          </span>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            className="absolute top-2 right-2 z-20 inline-flex size-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Banner"
            title="Banner"
            disabled={locked}
          >
            <DotsThreeVertical size={18} weight="bold" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label="Banner" className="w-max min-w-0">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => inputRef.current?.click()}>
                <ImageIcon size={16} aria-hidden="true" />
                {banner ? "Change banner" : "Add banner"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {banner ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      void remove();
                    }}
                  >
                    <Trash size={16} aria-hidden="true" />
                    Remove banner
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="m-0 mt-2 text-[0.74rem] text-(--muted)">
        Drop an image here or use the menu. Recommended: 1920x640px (3:1); keep
        the left side calm, the title sits there.
      </p>
      {error ? (
        <p className="m-0 mt-2 text-[0.75rem] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Draws its child at a fixed desktop width and scales it down to the width
 * it is given, so container-query layouts show their wide form. It is a
 * picture only: nothing in it can be focused or pressed.
 */
function ScaledDesktopPreview({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ scale: 0, height: 0 });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const measure = () => {
      const scale = frame.clientWidth / width;
      setBox({ scale, height: content.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden rounded-2xl"
      style={box.height ? { height: box.height } : { aspectRatio: "3 / 1" }}
      aria-hidden="true"
      inert
    >
      <div
        ref={contentRef}
        className="pointer-events-none absolute top-0 left-0 origin-top-left"
        style={{
          width,
          transform: `scale(${box.scale})`,
          visibility: box.scale ? undefined : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
