import { useState } from "react";

type ThumbnailImageProps = {
  src: string;
  alt?: string;
  className?: string;
};

export default function ThumbnailImage({ src, alt = "", className }: ThumbnailImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="material-symbols-outlined text-[36px] text-outline fallback-icon"
        aria-hidden="true"
      >
        video_library
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
