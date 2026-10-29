import { useMemo, useState } from "react";
import { deleteReel, getReelThumbnailUrl, type Reel } from "./api";
import Icon from "./Icon";
import { canOpenOriginal, formatSavedDate, parseResources, parseTakeaways, platformName, reelTitle } from "./library";
import Sheet from "./Sheet";
import ThumbnailImage from "./ThumbnailImage";

type ReelDetailProps = {
  reel: Reel;
  onClose: () => void;
  onDeleted: (reelId: string) => void;
};

export default function ReelDetail({ reel, onClose, onDeleted }: ReelDetailProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const title = reelTitle(reel);
  const takeaways = useMemo(() => parseTakeaways(reel.actionable_items), [reel.actionable_items]);
  const resources = useMemo(() => parseResources(reel.resources), [reel.resources]);
  const showCaption = Boolean(reel.caption && reel.caption.trim() !== title);

  async function handleDelete() {
    if (!window.confirm("Delete this reel from your library? This can't be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      await deleteReel(reel.id);
      onDeleted(reel.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this reel");
      setDeleting(false);
    }
  }

  return (
    <Sheet title={title} titleHidden size="wide" onClose={onClose}>
      <article className="detail">
        <div className="detail__media">
          <ThumbnailImage className="detail__img" src={getReelThumbnailUrl(reel)} />
        </div>

        <div className="detail__body">
          <div className="detail__head">
            <p className="detail__source">
              {[reel.creator, platformName(reel.source_url)].filter(Boolean).join(" · ")}
            </p>
            <h2 className="detail__title">{title}</h2>
            <p className="muted">
              {reel.collection_name && <span className="chip">{reel.collection_name}</span>}
              Saved {formatSavedDate(reel.created_at)}
            </p>
          </div>

          <div className="detail__actions">
            {canOpenOriginal(reel) && (
              <a className="btn btn--primary" href={reel.source_url} target="_blank" rel="noreferrer">
                <Icon name="external" size={18} />
                Watch original
              </a>
            )}
            <button type="button" className="btn btn--danger" onClick={handleDelete} disabled={deleting}>
              <Icon name="trash" size={18} />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}

          <section className="detail__section" aria-labelledby="detail-summary">
            <h3 id="detail-summary" className="detail__label">Summary</h3>
            {reel.summary
              ? <p className="detail__summary">{reel.summary}</p>
              : <p className="muted">No summary was generated for this reel.</p>}
          </section>

          {takeaways.length > 0 && (
            <section className="detail__section" aria-labelledby="detail-takeaways">
              <h3 id="detail-takeaways" className="detail__label">Takeaways</h3>
              <ul className="takeaways">
                {takeaways.map((item, index) => (
                  <li key={index}>
                    <Icon name="check" size={18} className="takeaways__icon" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {resources.length > 0 && (
            <section className="detail__section" aria-labelledby="detail-resources">
              <h3 id="detail-resources" className="detail__label">Mentioned</h3>
              <ul className="resources">
                {resources.map((resource, index) => (
                  <li key={index}>
                    <a href={resource.url} target="_blank" rel="noreferrer" className="resource">
                      <Icon name="link" size={18} />
                      <span>{resource.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {showCaption && (
            <details className="detail__caption">
              <summary>Original caption</summary>
              <p>{reel.caption}</p>
            </details>
          )}
        </div>
      </article>
    </Sheet>
  );
}
