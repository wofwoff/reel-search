import { memo } from "react";
import { getReelThumbnailUrl, type Reel } from "./api";
import { reelTitle } from "./library";
import ThumbnailImage from "./ThumbnailImage";

type ReelTileProps = {
  reel: Reel;
  onOpen: (reel: Reel) => void;
  score?: number;
  fresh?: boolean;
};

function ReelTile({ reel, onOpen, score, fresh = false }: ReelTileProps) {
  const title = reelTitle(reel);
  const label = [title, reel.creator, score !== undefined ? `${Math.round(score * 100)}% match` : null, fresh ? "new" : null]
    .filter(Boolean)
    .join(", ");

  return (
    <button type="button" className="tile" aria-label={label} onClick={() => onOpen(reel)}>
      <span className="tile__media">
        <ThumbnailImage className="tile__img" src={getReelThumbnailUrl(reel)} />
        {fresh && <span className="tile__ring" aria-hidden="true" />}
        {score !== undefined && <span className="tile__score" aria-hidden="true">{Math.round(score * 100)}%</span>}
      </span>
      <span className="tile__title" aria-hidden="true">{title}</span>
    </button>
  );
}

export default memo(ReelTile);
