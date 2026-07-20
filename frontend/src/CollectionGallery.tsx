import type { Collection } from "./api";


type CollectionGalleryProps = {
  collections: Collection[];
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (collection: Collection) => void;
};


const DOMAIN_PRESENTATION: Record<string, { icon: string; badge: string }> = {
  "Arts & Creativity": { icon: "palette", badge: "bg-primary-fixed text-on-primary-fixed-variant" },
  "Food & Cooking": { icon: "skillet", badge: "bg-[#ffe1d4] text-[#78331a]" },
  Technology: { icon: "code", badge: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  "Career & Education": { icon: "work", badge: "bg-secondary-fixed text-on-secondary-fixed-variant" },
  "Health & Fitness": { icon: "exercise", badge: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  Entertainment: { icon: "movie", badge: "bg-primary-fixed text-on-primary-fixed-variant" },
  "Travel & Places": { icon: "travel_explore", badge: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  "Business & Finance": { icon: "finance_mode", badge: "bg-secondary-fixed text-on-secondary-fixed-variant" },
  Lifestyle: { icon: "self_improvement", badge: "bg-primary-fixed text-on-primary-fixed-variant" },
  Other: { icon: "category", badge: "bg-secondary-fixed text-on-secondary-fixed-variant" }
};


function CollectionCard({ collection, onSelect }: { collection: Collection; onSelect: (collection: Collection) => void }) {
  const domain = collection.domain || "Other";
  const presentation = DOMAIN_PRESENTATION[domain] ?? DOMAIN_PRESENTATION.Other;
  const previews = collection.reels.slice(0, 3);
  const visiblePreviews = previews.length > 0 ? previews : [null];

  return (
    <button
      type="button"
      aria-label={`Open ${collection.name} collection`}
      onClick={() => onSelect(collection)}
      className="collection-card group flex min-h-full flex-col overflow-hidden rounded-[16px] border border-outline-variant/55 bg-surface-container-lowest text-left transition-[border-color,transform,background-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <div
        className="grid h-44 w-full gap-1.5 bg-surface-container p-3 sm:h-48"
        style={{ gridTemplateColumns: `repeat(${visiblePreviews.length}, minmax(0, 1fr))` }}
      >
        {visiblePreviews.map((reel, index) => (
          <img
            key={reel?.id ?? `fallback-${index}`}
            src={reel?.thumbnail_url || "/logo.png"}
            alt={reel?.title ? `${reel.title} preview` : ""}
            loading="lazy"
            decoding="async"
            className="h-full min-w-0 w-full rounded-[10px] object-cover"
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <div className="mb-3 flex items-start gap-3">
          <span className={`material-symbols-outlined flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[20px] ${presentation.badge}`} aria-hidden="true">
            {presentation.icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-balance font-headline-sm text-[22px] font-bold leading-tight text-on-surface">
              {collection.name}
            </h3>
            <p className="mt-1 text-sm font-semibold text-primary">{domain}</p>
          </div>
        </div>

        <p className="line-clamp-2 text-pretty font-body-md text-sm leading-relaxed text-on-surface-variant">
          {collection.description || `Saved reels about ${collection.name.toLowerCase()}.`}
        </p>

        <div className="mt-auto flex items-center justify-between border-t border-outline-variant/40 pt-4 text-sm">
          <span className="font-semibold text-on-surface-variant">
            {collection.reel_count} {collection.reel_count === 1 ? "reel" : "reels"}
          </span>
          <span className="flex items-center gap-1 font-semibold text-primary group-hover:underline">
            View collection
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
          </span>
        </div>
      </div>
    </button>
  );
}


export default function CollectionGallery({ collections, refreshing, onRefresh, onSelect }: CollectionGalleryProps) {
  if (collections.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center">
        <span className="material-symbols-outlined text-[42px] text-primary" aria-hidden="true">collections_bookmark</span>
        <h3 className="mt-4 text-xl font-bold text-on-surface">Your first collection will appear here</h3>
        <p className="mx-auto mt-2 max-w-md text-pretty text-on-surface-variant">
          Save a reel above and ReelMind will group it by the subject or craft it actually discusses.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex justify-end">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[18px] ${refreshing ? "animate-spin" : ""}`} aria-hidden="true">sync</span>
          {refreshing ? "Refreshing topics" : "Refresh topics"}
        </button>
      </div>
      <div className="collection-grid">
        {collections.map((collection) => (
          <CollectionCard key={collection.id} collection={collection} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
