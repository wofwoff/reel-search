import type { MouseEvent } from "react";
import { getReelThumbnailUrl, type Collection } from "./api";
import { collectionAnchor } from "./CollectionSection";
import Icon from "./Icon";
import ThumbnailImage from "./ThumbnailImage";

type SidebarProps = {
  collections: Collection[] | null;
  regrouping: boolean;
  onJump: (anchorId: string) => void;
  onRegroup: () => void;
  onOpenDevices: () => void;
};

export default function Sidebar({ collections, regrouping, onJump, onRegroup, onOpenDevices }: SidebarProps) {
  function jump(event: MouseEvent<HTMLAnchorElement>, anchorId: string) {
    event.preventDefault();
    onJump(anchorId);
  }

  return (
    <nav className="sidebar" aria-label="Library">
      <a className="sidebar__link sidebar__link--primary" href="#recent" onClick={(event) => jump(event, "recent")}>
        <span className="sidebar__icon"><Icon name="clock" size={20} /></span>
        Recent saves
      </a>

      <p className="sidebar__heading">Collections</p>
      {collections === null && <p className="sidebar__hint">Loading…</p>}
      {collections?.length === 0 && <p className="sidebar__hint">Collections appear after your first save.</p>}
      {collections?.map((collection) => {
        const anchor = collectionAnchor(collection.id);
        return (
          <a key={collection.id} className="sidebar__link" href={`#${anchor}`} onClick={(event) => jump(event, anchor)}>
            <span className="sidebar__thumb" aria-hidden="true">
              {collection.reels[0] && <ThumbnailImage className="sidebar__thumb-img" src={getReelThumbnailUrl(collection.reels[0])} />}
            </span>
            <span className="sidebar__text">
              <span className="sidebar__name">{collection.name}</span>
              <span className="sidebar__domain">{collection.domain || "Other"}</span>
            </span>
            <span className="sidebar__count">{collection.reel_count}</span>
          </a>
        );
      })}

      <div className="sidebar__footer">
        <button type="button" className="sidebar__link" onClick={onRegroup} disabled={regrouping}>
          <span className="sidebar__icon"><Icon name="refresh" size={18} className={regrouping ? "spin" : undefined} /></span>
          {regrouping ? "Regrouping…" : "Regroup collections"}
        </button>
        <button type="button" className="sidebar__link" onClick={onOpenDevices}>
          <span className="sidebar__icon"><Icon name="devices" size={18} /></span>
          Devices &amp; Shortcut
        </button>
      </div>
    </nav>
  );
}
