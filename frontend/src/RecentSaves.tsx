import { useRef } from "react";
import type { Reel } from "./api";
import Icon from "./Icon";
import { isFreshUnseen } from "./library";
import ReelTile from "./ReelTile";
import type { PendingSave } from "./useIngestQueue";

type RecentSavesProps = {
  reels: Reel[] | null;
  pending: PendingSave[];
  seen: Set<string>;
  onOpen: (reel: Reel) => void;
  onRetryWithFile: (key: string) => void;
  onDismiss: (key: string) => void;
};

const STATUS_LABEL: Record<PendingSave["status"], string> = {
  sending: "Sending…",
  uploading: "Uploading…",
  queued: "Queued",
  processing: "Analyzing…",
  failed: "Couldn't save"
};

function PendingTile({ item, onRetryWithFile, onDismiss }: {
  item: PendingSave;
  onRetryWithFile: (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  const failed = item.status === "failed";
  return (
    <div className={`tile tile--pending${failed ? " tile--failed" : ""}`}>
      <span className="tile__media">
        {!failed && <span className="tile__spinner" aria-hidden="true" />}
        {failed && <span className="tile__failed-icon" aria-hidden="true"><Icon name="alert" size={26} /></span>}
        <span className="tile__status">{STATUS_LABEL[item.status]}</span>
      </span>
      <span className="tile__title">{item.label}</span>
      {failed && (
        <span className="tile__failure">
          <span className="tile__error" title={item.error}>{item.error}</span>
          <span className="tile__actions">
            <button type="button" className="btn btn--small btn--primary" onClick={() => onRetryWithFile(item.key)}>Add file</button>
            <button type="button" className="icon-btn icon-btn--filled" aria-label={`Dismiss ${item.label}`} onClick={() => onDismiss(item.key)}>
              <Icon name="close" size={16} />
            </button>
          </span>
        </span>
      )}
    </div>
  );
}

export default function RecentSaves({ reels, pending, seen, onOpen, onRetryWithFile, onDismiss }: RecentSavesProps) {
  const scroller = useRef<HTMLUListElement>(null);
  const processing = pending.filter((item) => item.status !== "failed").length;
  const now = Date.now();

  function scrollBy(direction: 1 | -1) {
    const node = scroller.current;
    if (node) node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section id="recent" className="card recent" aria-labelledby="recent-heading">
      <div className="card__header">
        <h2 id="recent-heading" className="card__title">Recent saves</h2>
        <div className="recent__meta">
          {processing > 0 && <span className="muted" aria-live="polite">{processing} processing</span>}
          <span className="recent__arrows">
            <button type="button" className="icon-btn" aria-label="Scroll recent saves left" onClick={() => scrollBy(-1)}>
              <Icon name="chevronLeft" />
            </button>
            <button type="button" className="icon-btn" aria-label="Scroll recent saves right" onClick={() => scrollBy(1)}>
              <Icon name="chevronRight" />
            </button>
          </span>
        </div>
      </div>
      <ul className="recent__row" ref={scroller}>
        {pending.map((item) => (
          <li key={item.key} className="recent__item">
            <PendingTile item={item} onRetryWithFile={onRetryWithFile} onDismiss={onDismiss} />
          </li>
        ))}
        {reels === null
          ? Array.from({ length: 6 }, (_, index) => (
            <li key={`skeleton-${index}`} className="recent__item" aria-hidden="true">
              <span className="tile tile--skeleton"><span className="tile__media" /></span>
            </li>
          ))
          : reels.map((reel) => (
            <li key={reel.id} className="recent__item">
              <ReelTile reel={reel} onOpen={onOpen} fresh={isFreshUnseen(reel, seen, now)} />
            </li>
          ))}
      </ul>
    </section>
  );
}
