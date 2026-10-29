import { useState } from "react";
import Icon from "./Icon";

type ThumbnailImageProps = {
  src: string;
  alt?: string;
  className?: string;
};

export default function ThumbnailImage({ src, alt = "", className }: ThumbnailImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Instagram CDN thumbnails expire; show a neutral placeholder instead of a broken image.
    return (
      <span className="thumb-fallback" aria-hidden="true">
        <Icon name="film" size={28} />
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
