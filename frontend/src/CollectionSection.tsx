import { memo, useCallback, useEffect, useRef, useState } from "react";
import { fetchCollectionReels, getReelThumbnailUrl, type Collection, type Reel } from "./api";
import ReelTile from "./ReelTile";
import ThumbnailImage from "./ThumbnailImage";

export const COLLECTION_PAGE_SIZE = 24;

type CollectionSectionProps = {
  collection: Collection;
  hiddenIds: Set<string>;
  onOpen: (reel: Reel) => void;
  onStale: (collectionId: string) => void;
};

export function collectionAnchor(collectionId: string): string {
  return `collection-${collectionId}`;
}

function mergeReels(current: Reel[], incoming: Reel[]): Reel[] {
  const known = new Set(current.map((reel) => reel.id));
  return [...current, ...incoming.filter((reel) => !known.has(reel.id))];
}

/**
 * One collection with all of its reels. It renders its preview reels at once and loads the
 * full list a page at a time once it scrolls near the viewport.
 */
function CollectionSection({ collection, hiddenIds, onOpen, onStale }: CollectionSectionProps) {
  const [reels, setReels] = useState<Reel[]>(collection.reels);
  const [loaded, setLoaded] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const requested = useRef(false);

  const loadPage = useCallback(async (offset: number) => {
    setLoading(true);
    setError("");
    try {
      const page = await fetchCollectionReels(collection.id, { limit: COLLECTION_PAGE_SIZE, offset });
      if (offset === 0 && page.length === 0 && collection.reel_count > 0) {
        // Collections are rebuilt with new ids after every save or delete; this one is gone.
        onStale(collection.id);
        return;
      }
      setReels((current) => (offset === 0 ? mergeReels(page, current) : mergeReels(current, page)));
      setLoaded(offset + page.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this collection");
    } finally {
      setLoading(false);
    }
  }, [collection.id, collection.reel_count, onStale]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || requested.current) return;
    const start = () => {
      if (requested.current) return;
      requested.current = true;
      void loadPage(0);
    };
    if (typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    }, { rootMargin: "800px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadPage]);

  const visible = reels.filter((reel) => !hiddenIds.has(reel.id));
  const placeholders = loaded === 0 && !error
    ? Math.max(0, Math.min(collection.reel_count, COLLECTION_PAGE_SIZE) - visible.length)
    : 0;
  const hasMore = loaded > 0 && loaded < collection.reel_count;
  const cover = collection.reels[0];
  const domain = collection.domain || "Other";
  const headingId = `${collectionAnchor(collection.id)}-heading`;

  return (
    <section id={collectionAnchor(collection.id)} ref={sectionRef} className="card collection" aria-labelledby={headingId}>
      <div className="collection__header">
        <span className="collection__cover" aria-hidden="true">
          {cover && <ThumbnailImage className="collection__cover-img" src={getReelThumbnailUrl(cover)} />}
        </span>
        <div className="collection__heading">
          <h2 id={headingId} className="card__title">{collection.name}</h2>
          <p className="collection__meta">
            {domain} · {collection.reel_count} {collection.reel_count === 1 ? "reel" : "reels"}
            {collection.description ? <span className="collection__desc"> · {collection.description}</span> : null}
          </p>
        </div>
      </div>

      <ul className="collection__grid">
        {visible.map((reel) => (
          <li key={reel.id}>
            <ReelTile reel={reel} onOpen={onOpen} />
          </li>
        ))}
        {Array.from({ length: placeholders }, (_, index) => (
          <li key={`placeholder-${index}`} aria-hidden="true">
            <span className="tile tile--skeleton"><span className="tile__media" /></span>
          </li>
        ))}
      </ul>

      {error && (
        <p className="collection__error" role="alert">
          {error}{" "}
          <button type="button" className="link-btn" onClick={() => void loadPage(loaded)}>Try again</button>
        </p>
      )}
      {hasMore && !error && (
        <div className="collection__more">
          <button type="button" className="btn" disabled={loading} onClick={() => void loadPage(loaded)}>
            {loading ? "Loading…" : `Show more (${collection.reel_count - loaded} left)`}
          </button>
        </div>
      )}
    </section>
  );
}

export default memo(CollectionSection);
