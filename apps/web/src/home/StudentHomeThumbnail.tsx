import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { CourseThumbnailPlaceholder } from "../courses/CourseThumbnailPlaceholder";

export function StudentHomeThumbnail({
  src,
  fallbackSrcs = [],
  alt,
  loading = "lazy",
  decoding = "async",
  fetchPriority,
}: {
  src?: string | null;
  fallbackSrcs?: readonly (string | null | undefined)[];
  alt: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  decoding?: ImgHTMLAttributes<HTMLImageElement>["decoding"];
  fetchPriority?: ImgHTMLAttributes<HTMLImageElement>["fetchPriority"];
}) {
  const imageSources = [src, ...fallbackSrcs]
    .map((candidate) => candidate?.trim() ?? "")
    .filter((candidate, index, candidates) =>
      candidate ? candidates.indexOf(candidate) === index : false,
    );
  const imageSourcesKey = imageSources.join("\u0000");
  const [imageSourceIndex, setImageSourceIndex] = useState(0);

  useEffect(() => {
    setImageSourceIndex(0);
  }, [imageSourcesKey]);

  const imageSrc = imageSources[imageSourceIndex] ?? "";

  return (
    <div className="student-home-thumbnail">
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={alt}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          onError={() =>
            setImageSourceIndex((current) =>
              Math.min(current + 1, imageSources.length),
            )
          }
        />
      ) : (
        <CourseThumbnailPlaceholder />
      )}
    </div>
  );
}
