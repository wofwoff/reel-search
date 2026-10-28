import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  fetchHealth,
  fetchLibraryCount,
  fetchLibraryOverview,
  fetchRecentReels,
  reclusterCollections,
  searchReels,
  type Collection,
  type Health,
  type Reel,
  type SearchResult
} from "./api";
import BottomNav from "./BottomNav";
import CollectionSection from "./CollectionSection";
import DevicesSheet from "./DevicesSheet";
import Icon, { BrandMark } from "./Icon";
import { loadSeenReels, reelTitle, rememberSeenReel, sortByLatestReel } from "./library";
import { classifyOmnibox, toSaveUrl } from "./omnibox";
import RecentSaves from "./RecentSaves";
import ReelDetail from "./ReelDetail";
import ReelTile from "./ReelTile";
import SaveSheet from "./SaveSheet";
import SearchResults from "./SearchResults";
import Sidebar from "./Sidebar";
import Toasts, { type Toast } from "./Toasts";
import TopBar from "./TopBar";
import { useIngestQueue } from "./useIngestQueue";
import { useSession } from "./useSession";

type SearchState = { query: string; results: SearchResult[] | null; error: string };

const UPLOAD_ACCEPT = "video/mp4,video/quicktime,image/jpeg,image/png,image/webp";
// The worker regroups collections after it marks a job done, so look again shortly after.
const FOLLOW_UP_REFRESH_MS = 10_000;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export default function App() {
  const session = useSession();
  const [health, setHealth] = useState<Health | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [recent, setRecent] = useState<Reel[] | null>(null);
  const [libraryError, setLibraryError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState | null>(null);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [sheet, setSheet] = useState<"save" | "devices" | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [seen, setSeen] = useState<Set<string>>(loadSeenReels);
  const [regrouping, setRegrouping] = useState(false);

  const omniboxRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const retryKeyRef = useRef<string | null>(null);
  const followUpTimer = useRef<number | undefined>(undefined);
  const staleCollections = useRef<Set<string>>(new Set());
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((items) => items.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((items) => [...items.slice(-2), { ...toast, id }]);
    window.setTimeout(() => dismissToast(id), toast.action ? 7000 : 4500);
  }, [dismissToast]);

  const refreshLibrary = useCallback(async () => {
    const [overview, recentResult] = await Promise.all([
      fetchLibraryOverview(),
      fetchRecentReels().then((reels) => ({ reels, error: null }), (error: unknown) => ({ reels: null, error }))
    ]);

    if (overview.count !== null) setCount(overview.count);
    else console.error("Failed to fetch library count:", overview.countError);

    if (overview.collections !== null) {
      setCollections(overview.collections);
      setLibraryError("");
    } else {
      console.error("Failed to fetch collections:", overview.collectionsError);
      setCollections((current) => current ?? []);
      setLibraryError(overview.collectionsError instanceof Error ? overview.collectionsError.message : "Couldn't load your collections");
    }

    if (recentResult.reels) setRecent(recentResult.reels);
    else {
      console.error("Failed to fetch recent reels:", recentResult.error);
      setRecent((current) => current ?? []);
    }
  }, []);

  const refreshSoonAndLater = useCallback(() => {
    void refreshLibrary();
    window.clearTimeout(followUpTimer.current);
    followUpTimer.current = window.setTimeout(() => void refreshLibrary(), FOLLOW_UP_REFRESH_MS);
  }, [refreshLibrary]);

  useEffect(() => () => window.clearTimeout(followUpTimer.current), []);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (session.sessionKey > 0) void refreshLibrary();
  }, [session.sessionKey, refreshLibrary]);

  const openReel = useCallback((reel: Reel) => {
    setSelectedReel(reel);
    setSeen((current) => rememberSeenReel(current, reel.id));
  }, []);

  const queue = useIngestQueue({
    onSaved: (reel) => {
      showToast({
        message: reel ? `Saved “${reelTitle(reel)}”` : "Reel saved",
        action: reel ? { label: "View", onClick: () => openReel(reel) } : undefined
      });
      refreshSoonAndLater();
    },
    onDuplicate: (reel) => {
      showToast({ message: "Already in your library", action: { label: "View", onClick: () => openReel(reel) } });
    },
    onError: (message) => showToast({ message, tone: "error" })
  });

  const clearSearch = useCallback(() => setSearch(null), []);

  async function runSearch(text: string) {
    setSearch({ query: text, results: null, error: "" });
    scrollToTop();
    try {
      const results = await searchReels(text, 30);
      setSearch((current) => (current?.query === text ? { ...current, results } : current));
    } catch (err) {
      const error = err instanceof Error ? err.message : "Search failed";
      setSearch((current) => (current?.query === text ? { ...current, error } : current));
    }
  }

  function startSave(url: string, files: File[] = []) {
    void queue.save(url, files);
    setSearch(null);
    scrollToTop();
  }

  function submitOmnibox() {
    const mode = classifyOmnibox(query);
    if (mode === "save") {
      startSave(toSaveUrl(query));
      setQuery("");
    } else if (mode === "search") {
      void runSearch(query.trim());
      omniboxRef.current?.blur();
    }
  }

  function chooseFiles(retryKey: string | null = null) {
    retryKeyRef.current = retryKey;
    fileInputRef.current?.click();
  }

  function onFilesChosen(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setSheet(null);
    const retryKey = retryKeyRef.current;
    retryKeyRef.current = null;
    if (retryKey) {
      queue.retryWithFiles(retryKey, files);
      scrollToTop();
      return;
    }
    // A link in the box goes along with the files, so the files act as its fallback.
    const link = classifyOmnibox(query) === "save" ? toSaveUrl(query) : "";
    if (link) setQuery("");
    startSave(link, files);
  }

  function goHome() {
    setQuery("");
    clearSearch();
    scrollToTop();
  }

  function focusSearch() {
    scrollToTop();
    omniboxRef.current?.focus();
  }

  function jumpTo(anchorId: string) {
    clearSearch();
    // Wait a frame so the library is back on screen when leaving search results.
    requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    });
  }

  const handleDeleted = useCallback((reelId: string) => {
    setHiddenIds((current) => new Set(current).add(reelId));
    setSelectedReel(null);
    setCount((current) => (current === null ? current : Math.max(0, current - 1)));
    showToast({ message: "Reel deleted" });
    refreshSoonAndLater();
  }, [refreshSoonAndLater, showToast]);

  const handleStaleCollection = useCallback((collectionId: string) => {
    if (staleCollections.current.has(collectionId)) return;
    staleCollections.current.add(collectionId);
    void refreshLibrary();
  }, [refreshLibrary]);

  async function regroup() {
    setRegrouping(true);
    try {
      const [grouped, countResult] = await Promise.all([reclusterCollections(), fetchLibraryCount()]);
      setCollections(grouped);
      setCount(countResult.count);
      showToast({ message: "Collections regrouped" });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : "Couldn't regroup collections", tone: "error" });
    } finally {
      setRegrouping(false);
    }
  }

  const sortedCollections = useMemo(() => (collections ? sortByLatestReel(collections) : null), [collections]);
  const visibleRecent = useMemo(() => recent?.filter((reel) => !hiddenIds.has(reel.id)) ?? null, [recent, hiddenIds]);
  const libraryEmpty = count === 0 && visibleRecent?.length === 0 && queue.pending.length === 0;

  if (session.isAuthLoading) {
    return (
      <div className="boot" role="status">
        <BrandMark size={56} />
        <span className="boot__spinner" aria-hidden="true" />
        <span className="sr-only">Loading your library</span>
      </div>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#library">Skip to library</a>
      <TopBar
        ref={omniboxRef}
        query={query}
        onQueryChange={setQuery}
        onSubmit={submitOmnibox}
        onClear={() => { setQuery(""); clearSearch(); }}
        onHome={goHome}
        onOpenSave={() => setSheet("save")}
        onUpload={() => chooseFiles()}
        onOpenDevices={() => setSheet("devices")}
      />

      {health && !health.ok && (
        <div className="banner" role="status">
          <Icon name="alert" size={18} />
          Server setup is incomplete. Missing: {health.missing_env.join(", ")}
        </div>
      )}

      <div className="layout">
        <Sidebar
          collections={sortedCollections}
          regrouping={regrouping}
          onJump={jumpTo}
          onRegroup={regroup}
          onOpenDevices={() => setSheet("devices")}
        />

        <main className="feed" id="library">
          {search ? (
            <SearchResults
              query={search.query}
              results={search.results}
              error={search.error}
              hiddenIds={hiddenIds}
              onOpen={openReel}
              onClear={() => { setQuery(""); clearSearch(); }}
            />
          ) : libraryEmpty ? (
            <section className="card welcome" aria-labelledby="welcome-heading">
              <BrandMark size={48} />
              <h2 id="welcome-heading" className="welcome__title">Save your first reel</h2>
              <p className="muted">Paste an Instagram or YouTube link above. ReelMind watches it, writes down the takeaways and files it into a collection, so you can find it later by describing it.</p>
              <div className="welcome__actions">
                <button type="button" className="btn btn--primary" onClick={() => setSheet("save")}>
                  <Icon name="plus" size={18} /> Save a reel
                </button>
                <button type="button" className="btn" onClick={() => setSheet("devices")}>
                  <Icon name="bolt" size={18} /> Set up iPhone Shortcut
                </button>
              </div>
            </section>
          ) : (
            <>
              <RecentSaves
                reels={visibleRecent}
                pending={queue.pending}
                seen={seen}
                onOpen={openReel}
                onRetryWithFile={(key) => chooseFiles(key)}
                onDismiss={queue.dismiss}
              />

              <div className="library__header">
                <div>
                  <h2 className="library__title">Library</h2>
                  {count !== null && collections !== null && (
                    <p className="muted">
                      {count} {count === 1 ? "reel" : "reels"} in {collections.length} {collections.length === 1 ? "collection" : "collections"}
                    </p>
                  )}
                </div>
                <button type="button" className="btn btn--ghost" onClick={regroup} disabled={regrouping}>
                  <Icon name="refresh" size={18} className={regrouping ? "spin" : undefined} />
                  {regrouping ? "Regrouping…" : "Regroup"}
                </button>
              </div>

              {libraryError && (
                <div className="card notice" role="alert">
                  <span>{libraryError}</span>
                  <button type="button" className="btn" onClick={() => void refreshLibrary()}>Try again</button>
                </div>
              )}

              {sortedCollections === null
                ? Array.from({ length: 2 }, (_, index) => (
                  <section key={index} className="card collection collection--skeleton" aria-hidden="true">
                    <div className="collection__header"><span className="collection__cover" /><span className="skeleton-line" /></div>
                    <ul className="collection__grid">
                      {Array.from({ length: 6 }, (__, tile) => (
                        <li key={tile}><span className="tile tile--skeleton"><span className="tile__media" /></span></li>
                      ))}
                    </ul>
                  </section>
                ))
                : sortedCollections.map((collection) => (
                  <CollectionSection
                    key={collection.id}
                    collection={collection}
                    hiddenIds={hiddenIds}
                    onOpen={openReel}
                    onStale={handleStaleCollection}
                  />
                ))}

              {sortedCollections?.length === 0 && !libraryError && visibleRecent && visibleRecent.length > 0 && (
                <section className="card" aria-labelledby="all-reels-heading">
                  <div className="card__header">
                    <h2 id="all-reels-heading" className="card__title">All reels</h2>
                    <span className="muted">Collections are still being organized</span>
                  </div>
                  <ul className="collection__grid">
                    {visibleRecent.map((reel) => (
                      <li key={reel.id}><ReelTile reel={reel} onOpen={openReel} /></li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </main>
      </div>

      <BottomNav
        searching={search !== null}
        onHome={goHome}
        onSearch={focusSearch}
        onSave={() => setSheet("save")}
        onDevices={() => setSheet("devices")}
      />

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFilesChosen}
      />

      {selectedReel && (
        <ReelDetail reel={selectedReel} onClose={() => setSelectedReel(null)} onDeleted={handleDeleted} />
      )}

      {sheet === "save" && (
        <SaveSheet
          onClose={() => setSheet(null)}
          onSaveLink={(url) => { setSheet(null); startSave(url); }}
          onChooseFiles={() => chooseFiles()}
        />
      )}

      {sheet === "devices" && (
        <DevicesSheet
          userId={session.userId}
          onClose={() => setSheet(null)}
          rememberSyncIdentity={session.rememberSyncIdentity}
          adoptSyncIdentity={session.adoptSyncIdentity}
          importSupabaseSync={session.importSupabaseSync}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
