import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchHealth, fetchReels, Health, Reel, saveReel, searchReels, SearchResult, deleteReel } from "./api";
import { supabase } from "./supabaseClient";

type SaveState = "idle" | "downloading" | "uploading" | "embedding" | "saved" | "failed";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getPlatformName(url: string | undefined, fallback: string = "Instagram") {
  if (!url) return fallback;
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  return fallback;
}

function ReelCard({ reel, score, onClick }: { reel: Reel; score?: number; onClick: () => void }) {
  const title = reel.title || reel.caption || "Saved reel";

  return (
    <div 
      onClick={onClick}
      className="group bg-surface-container-lowest rounded-lg p-4 border border-outline-variant shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col h-full cursor-pointer"
    >
      <div className="relative aspect-[9/16] rounded-lg overflow-hidden mb-6 bg-surface-variant flex items-center justify-center">
        {reel.thumbnail_url ? (
          <img 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
            src={reel.thumbnail_url} 
            alt={title} 
          />
        ) : (
          <span className="material-symbols-outlined text-[48px] text-outline">video_library</span>
        )}
        
        <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-surface/90 flex items-center justify-center shadow-lg">
            <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              play_arrow
            </span>
          </div>
        </div>

        {score !== undefined && (
          <div className="absolute top-4 right-4">
            <span className="bg-primary/95 backdrop-blur-sm text-on-primary px-3 py-1 rounded-full font-label-sm text-label-sm font-bold">
              {Math.round(score * 100)}% match
            </span>
          </div>
        )}
      </div>

      <div className="px-2 pb-2 space-y-3 flex-grow flex flex-col">
        <span className="font-label-sm text-label-sm text-primary">{reel.creator || getPlatformName(reel.source_url)}</span>
        <h3 className="font-headline-sm text-[20px] text-on-surface group-hover:text-primary transition-colors line-clamp-1">
          {title}
        </h3>
        {reel.caption && reel.caption !== title && (
          <p className="font-body-md text-body-md text-on-surface-variant line-clamp-3">
            {reel.caption}
          </p>
        )}
        {reel.tags && reel.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            {reel.tags.map((tag) => (
              <span key={tag} className="bg-primary/5 text-primary border border-primary/10 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="pt-4 mt-auto flex items-center justify-between border-t border-outline-variant/30">
          <span className="font-label-sm text-label-sm text-outline">Saved {formatDate(reel.created_at)}</span>
          <button className="text-primary hover:bg-primary/5 p-2 rounded-full transition-all">
            <span className="material-symbols-outlined">open_in_new</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ReelModal({ reel, onClose, onDeleteSuccess }: { reel: Reel; onClose: () => void; onDeleteSuccess: () => void }) {
  const title = reel.title || "Reel Details";
  const [deleting, setDeleting] = useState(false);

  let actionableItems: string[] = [];
  if (reel.actionable_items) {
    try {
      actionableItems = JSON.parse(reel.actionable_items);
    } catch {
      actionableItems = reel.actionable_items.split("\n").filter((i) => i.trim());
    }
  }

  interface ResourceObj {
    title: string;
    url: string;
  }
  let resources: ResourceObj[] = [];
  if (reel.resources) {
    try {
      resources = JSON.parse(reel.resources);
    } catch {
      // ignore
    }
  }

  let gcsUris: string[] = [];
  if (reel.gcs_uri) {
    if (reel.gcs_uri.startsWith("[")) {
      try {
        gcsUris = JSON.parse(reel.gcs_uri);
      } catch {
        gcsUris = [reel.gcs_uri];
      }
    } else {
      gcsUris = [reel.gcs_uri];
    }
  }

  async function handleDeleteClick() {
    if (!window.confirm("Are you sure you want to permanently delete this reel? This will remove it from GCS and your Database library.")) {
      return;
    }
    setDeleting(true);
    try {
      await deleteReel(reel.id);
      onDeleteSuccess();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete reel");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-on-background/40 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-surface rounded-lg border border-outline-variant/50 max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-low">
          <div>
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest">{reel.creator || getPlatformName(reel.source_url)}</span>
            <h2 className="font-headline-sm text-on-surface font-bold mt-1 line-clamp-1">{title}</h2>
          </div>
          <button className="p-2 hover:bg-primary/5 rounded-full transition-all text-on-surface-variant hover:text-primary" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 custom-scrollbar">
          <div className="flex flex-col gap-4">
            <div className="aspect-[9/12] rounded-lg overflow-hidden bg-surface-variant border border-outline-variant/30">
              {reel.thumbnail_url ? (
                <img className="w-full h-full object-cover" src={reel.thumbnail_url} alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-outline">
                  <span className="material-symbols-outlined text-[48px]">video_library</span>
                </div>
              )}
            </div>

            <a 
              href={reel.source_url} 
              target="_blank" 
              rel="noreferrer" 
              className="bg-primary text-on-primary py-3 rounded-full font-label-md text-label-md bouncy-interaction text-center shadow-md hover:bg-primary/95 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Open Original
            </a>

            <button 
              onClick={handleDeleteClick} 
              disabled={deleting}
              className="border border-error/30 text-error hover:bg-error/5 py-3 rounded-full font-label-md text-label-md bouncy-interaction flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {deleting ? (
                <span className="material-symbols-outlined animate-spin">sync</span>
              ) : (
                <span className="material-symbols-outlined text-[18px]">delete</span>
              )}
              Delete Archive
            </button>

            <div className="space-y-4 pt-4 border-t border-outline-variant/30 text-xs">
              <div>
                <p className="font-bold text-outline uppercase tracking-wider mb-1">Status</p>
                <p className="text-on-surface-variant bg-surface-container px-2 py-1 rounded inline-block font-mono">{reel.ingest_status}</p>
              </div>
              <div>
                <p className="font-bold text-outline uppercase tracking-wider mb-1">Saved</p>
                <p className="text-on-surface-variant font-medium">{formatDate(reel.created_at)}</p>
              </div>
              {gcsUris.length > 0 && (
                <div>
                  <p className="font-bold text-outline uppercase tracking-wider mb-1">
                    {gcsUris.length > 1 ? "Staged Carousel Files" : "GCS Staging Path"}
                  </p>
                  <div className="space-y-1">
                    {gcsUris.map((uri, idx) => (
                      <span key={idx} className="block font-mono text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded" title={uri}>
                        {idx + 1}. {uri.split("/").pop()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {reel.tags && reel.tags.length > 0 && (
                <div>
                  <p className="font-bold text-outline uppercase tracking-wider mb-1">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {reel.tags.map((tag) => (
                      <span key={tag} className="bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {reel.summary ? (
              <section className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-widest">AI Content Summary</h3>
                <p className="font-body-md text-body-md text-on-surface-variant bg-surface-container-low p-4 rounded-lg border border-outline-variant/20">
                  {reel.summary}
                </p>
              </section>
            ) : (
              <section className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-widest">AI Content Summary</h3>
                <div className="flex items-center gap-3 bg-error-container/30 border border-error/20 p-4 rounded-lg text-error">
                  <span className="material-symbols-outlined">warning</span>
                  <span className="font-body-md text-body-md">No AI summary available. AI summaries are automatically generated for newly saved reels.</span>
                </div>
              </section>
            )}

            {resources.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-widest">Useful Resources</h3>
                <ul className="space-y-2">
                  {resources.map((res, idx) => (
                    <li key={idx} className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/20 hover:border-primary/45 transition-colors">
                      <a href={res.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary font-bold font-body-md">
                        <span className="material-symbols-outlined text-[18px]">link</span>
                        {res.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {actionableItems.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-widest">Actionable Takeaways</h3>
                <ul className="space-y-2 bg-surface-container-low p-4 rounded-lg border border-outline-variant/20">
                  {actionableItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-on-surface-variant font-body-md">
                      <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">check_circle</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {reel.caption && (
              <section className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-widest">Original Caption</h3>
                <pre className="text-xs text-on-surface-variant bg-surface-container-low p-4 rounded-lg border border-outline-variant/20 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar font-sans">
                  {reel.caption}
                </pre>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [library, setLibrary] = useState<Reel[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null); // Keep fallback or deprecated signature ref if needed, wait, we can just replace it:
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showUploadArea, setShowUploadArea] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [showShortcutGuide, setShowShortcutGuide] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [recallHits, setRecallHits] = useState<number>(() => {
    const val = localStorage.getItem("reel_search_recall_hits");
    return val ? parseInt(val, 10) : 0;
  });

  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    library.forEach((reel) => {
      if (reel.tags) {
        reel.tags.forEach((tag) => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet).sort();
  }, [library]);

  const activeTagsCount = allTags.length;

  const topCollection = useMemo(() => {
    if (library.length === 0) return "None";
    const counts: Record<string, number> = {};
    library.forEach((reel) => {
      if (reel.tags) {
        reel.tags.forEach((tag) => {
          counts[tag] = (counts[tag] || 0) + 1;
        });
      }
    });
    let top = "None";
    let max = 0;
    Object.entries(counts).forEach(([tag, count]) => {
      if (count > max) {
        top = tag;
        max = count;
      }
    });
    return top;
  }, [library]);

  const saveLabel = useMemo(() => {
    if (saveState === "downloading") return "Downloading stream...";
    if (saveState === "uploading") return "Uploading GCS...";
    if (saveState === "embedding") return "Embedding vectors...";
    if (saveState === "saved") return "Saved & Analyzed";
    if (saveState === "failed") return "Failed";
    return "Analyze";
  }, [saveState]);

  const shortcutEndpoint = "https://reel-search-api-771696730702.us-central1.run.app/api/reels/shortcut";

  function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function refreshLibrary() {
    try {
      const reels = await fetchReels();
      setLibrary(reels);
    } catch (err) {
      console.error("Failed to fetch library:", err);
      setLibrary([]);
    }
  }

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    let active = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (active) {
          if (!session) {
            await supabase.auth.signInAnonymously();
          } else {
            if (session.user) {
              setUserId(session.user.id);
            }
            refreshLibrary();
          }
        }
      } catch (err) {
        console.error("Auth initialization failed:", err);
      } finally {
        if (active) {
          setIsAuthLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (active) {
        if (!session) {
          setIsAuthLoading(true);
          setUserId("");
          await supabase.auth.signInAnonymously();
        } else {
          if (session.user) {
            setUserId(session.user.id);
          }
          setIsAuthLoading(false);
          refreshLibrary();
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!url.trim() && files.length === 0) return;
    setError("");
    setSaveMessage("");
    setSaveState(url ? "downloading" : "uploading");
    try {
      if (files.length > 0 && !url) {
        setSaveState("uploading");
      }
      setTimeout(() => setSaveState("embedding"), 500);
      const response = await saveReel(url, files);
      setSaveState("saved");
      setSaveMessage(response.duplicate ? "Reel is already in library!" : "Reel saved and analyzed.");
      setUrl("");
      setFiles([]);
      setShowUploadArea(false);
      await refreshLibrary();
    } catch (err) {
      setSaveState("failed");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setError("");
    setSearching(true);
    try {
      const searchResults = await searchReels(query.trim());
      setResults(searchResults);
      
      // Increment recall hits if we found a relevant match (score >= 0.70)
      const hasHit = searchResults.some(r => r.score && r.score >= 0.70);
      if (hasHit) {
        setRecallHits((prev) => {
          const next = prev + 1;
          localStorage.setItem("reel_search_recall_hits", String(next));
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function handleReelDelete(deletedId: string) {
    setLibrary((prev) => prev.filter((r) => r.id !== deletedId));
    setResults((prev) => prev.filter((r) => r.id !== deletedId));
  }

  // Filter by selected tag
  const filteredLibrary = useMemo(() => {
    if (!selectedTag) return library;
    return library.filter((reel) => reel.tags && reel.tags.includes(selectedTag));
  }, [library, selectedTag]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center space-y-6 max-w-sm px-6">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="space-y-2">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Initializing secure session</h3>
            <p className="text-on-surface-variant font-body-md">Setting up your private workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col max-w-full overflow-x-hidden selection:bg-primary-fixed selection:text-on-primary-fixed">
      {/* TopNavBar */}
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 shadow-sm">
        <div className="flex justify-between items-center h-16 px-gutter max-w-container-max mx-auto">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="ReelMind Logo" className="w-8 h-8 rounded-full object-cover shrink-0" />
              <span className="font-headline-sm text-headline-sm font-bold text-primary">ReelMind</span>
            </div>
            <nav className="hidden md:flex gap-6">
              <a 
                className="text-primary font-bold border-b-2 border-primary pb-1 font-body-md text-body-md" 
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Dashboard
              </a>
              <a 
                className="text-on-surface-variant font-medium hover:text-primary transition-colors font-body-md text-body-md" 
                href="#library-section" 
                onClick={(e) => {
                  e.preventDefault();
                  setSelectedTag(null);
                  document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Library
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {health && (
              <div className="hidden lg:flex items-center gap-2 bg-surface-container-low px-4 py-1.5 rounded-full border border-outline-variant/20 text-xs text-on-surface-variant font-medium">
                <div className={`w-2 h-2 rounded-full ${health.ok ? "bg-tertiary" : "bg-error"}`}></div>
                <span>{health.ok ? "Supabase, GCS & Gemini Connected" : `Missing configuration: ${health.missing_env.join(", ")}`}</span>
              </div>
            )}
            <button 
              onClick={() => {
                document.getElementById("ingest-input")?.focus();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="bg-primary text-on-primary px-6 py-2 rounded-full font-label-md text-label-md bouncy-interaction shadow-md hover:bg-primary/90 transition-all"
            >
              Ingest URL
            </button>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16 flex-grow">
        {/* Hero Section */}
        <section className="max-w-container-max mx-auto px-gutter py-12 text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface leading-tight">Turn scrolls into insights.</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              ReelMind captures the wisdom hidden in your social feed. Paste an Instagram or YouTube URL, or upload local files, and let our AI distill them into actionable takeaways.
            </p>

            <form onSubmit={onSave} className="space-y-4">
              <div className="relative max-w-2xl mx-auto soft-glow-focus group px-4 sm:px-0">
                <div className="flex items-center bg-surface-container-low rounded-full p-1.5 sm:p-2 border border-outline-variant shadow-lg group-hover:shadow-xl transition-all duration-300">
                  <span className="material-symbols-outlined ml-2 sm:ml-4 text-primary shrink-0">link</span>
                  <input 
                    id="ingest-input"
                    className="flex-grow min-w-0 w-full bg-transparent border-none focus:ring-0 px-2 sm:px-4 font-body-md text-body-md text-on-surface-variant placeholder:text-outline outline-none text-ellipsis" 
                    placeholder="Paste Instagram or YouTube URL here..." 
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={saveState === "downloading" || saveState === "uploading" || saveState === "embedding"}
                  />
                  <button 
                    type="submit"
                    disabled={saveState === "downloading" || saveState === "uploading" || saveState === "embedding" || (!url.trim() && files.length === 0)}
                    className="bg-primary text-on-primary px-4 sm:px-8 py-2 sm:py-3 rounded-full font-label-md text-label-md bouncy-interaction shadow-[0_0_15px_rgba(148,73,46,0.2)] hover:shadow-[0_0_20px_rgba(148,73,46,0.4)] transition-all flex items-center gap-2 disabled:opacity-50 shrink-0"
                  >
                    {saveState === "downloading" || saveState === "uploading" || saveState === "embedding" ? (
                      <span className="material-symbols-outlined animate-spin text-[18px] sm:text-[20px]">sync</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px] sm:text-[20px]">auto_awesome</span>
                    )}
                    <span>{saveLabel}</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-center items-center gap-4 text-xs font-semibold text-on-surface-variant">
                <button 
                  type="button"
                  onClick={() => setShowUploadArea(!showUploadArea)} 
                  className="text-primary hover:underline flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  {showUploadArea ? "Hide file upload" : "Or upload local file fallback"}
                </button>
              </div>

              {showUploadArea && (
                <div className="max-w-2xl mx-auto border-2 border-dashed border-outline-variant/50 bg-surface-container-low rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-surface-container-high transition-colors relative">
                  <input 
                    type="file" 
                    multiple
                    accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  />
                  <span className="material-symbols-outlined text-[36px] text-primary">upload</span>
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {files.length > 0 ? `Selected ${files.length} files: ${files.map(f => f.name).join(", ")}` : "Click or drag files (MP4, QuickTime, JPG, PNG, WEBP)"}
                  </span>
                </div>
              )}

              {saveMessage && <p className="text-tertiary font-bold text-center text-sm">{saveMessage}</p>}
              {error && <p className="text-error font-bold text-center text-sm">{error}</p>}
            </form>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="max-w-container-max mx-auto px-gutter mb-16 animate-fade-in">
          <div className="bg-surface-container-low rounded-lg py-4 sm:py-6 px-4 sm:px-12 flex flex-wrap justify-around items-center border border-outline-variant/30 gap-6 sm:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant">
                <span className="material-symbols-outlined">video_library</span>
              </div>
              <div>
                <p className="font-headline-sm text-[20px] text-on-surface font-bold">{library.length}</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">Archive Items</p>
              </div>
            </div>
            <div className="h-8 w-px bg-outline-variant hidden lg:block"></div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed-variant">
                <span className="material-symbols-outlined">track_changes</span>
              </div>
              <div>
                <p className="font-headline-sm text-[20px] text-on-surface font-bold">{recallHits}</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">Recall Hits</p>
              </div>
            </div>
            <div className="h-8 w-px bg-outline-variant hidden lg:block"></div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed-variant">
                <span className="material-symbols-outlined">auto_awesome_motion</span>
              </div>
              <div>
                <p className="font-headline-sm text-[20px] text-on-surface font-bold">{activeTagsCount}</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">Active Tags</p>
              </div>
            </div>
            <div className="h-8 w-px bg-outline-variant hidden lg:block"></div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant">
                <span className="material-symbols-outlined">workspace_premium</span>
              </div>
              <div>
                <p className="font-headline-sm text-[20px] text-on-surface font-bold truncate max-w-[120px]" title={topCollection}>{topCollection}</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">Top Collection</p>
              </div>
            </div>
          </div>
        </section>

        {/* Content Area with Sidebar */}
        <section id="library-section" className="max-w-container-max mx-auto px-gutter grid grid-cols-1 md:grid-cols-[240px_1fr] gap-12">
          {/* Sidebar Quick Filters */}
          <aside className="space-y-8">
            <div>
              <h3 className="font-label-md text-label-md text-primary mb-4 uppercase tracking-widest">Library</h3>
              <nav className="flex flex-col gap-1">
                <button 
                  onClick={() => setSelectedTag(null)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-full font-body-md transition-all text-left w-full ${!selectedTag ? "bg-primary-container text-on-primary-container font-bold" : "hover:bg-surface-container-high text-on-surface-variant"}`}
                >
                  <span className="material-symbols-outlined">grid_view</span>
                  All Reels
                </button>
              </nav>
            </div>
            {allTags.length > 0 && (
              <div>
                <h3 className="font-label-md text-label-md text-primary mb-4 uppercase tracking-widest">Filter by Tag</h3>
                <nav className="flex flex-col gap-1 max-h-[45vh] overflow-y-auto custom-scrollbar pr-1">
                  {allTags.map((tag) => {
                    const count = library.filter((r) => r.tags && r.tags.includes(tag)).length;
                    return (
                      <button 
                        key={tag}
                        onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                        className={`flex items-center justify-between px-4 py-2 rounded-full font-body-md transition-all text-left w-full text-xs ${selectedTag === tag ? "bg-primary-container text-on-primary-container font-bold" : "hover:bg-surface-container-high text-on-surface-variant"}`}
                      >
                        <span className="truncate mr-2 font-medium">#{tag}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${selectedTag === tag ? "bg-primary/25 text-on-primary-container" : "bg-surface-container-high text-on-surface-variant"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}

            {/* iOS/macOS Shortcut Guide */}
            <div className="border border-outline-variant/35 rounded-lg p-4 bg-surface-container-low space-y-4">
              <button 
                onClick={() => setShowShortcutGuide(!showShortcutGuide)}
                className="flex items-center justify-between w-full font-label-md text-label-md text-primary uppercase tracking-widest text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">cell_tower</span>
                  Shortcut Setup
                </span>
                <span className="material-symbols-outlined">
                  {showShortcutGuide ? "expand_less" : "expand_more"}
                </span>
              </button>
              {showShortcutGuide && (
                <div className="space-y-4 pt-2 text-xs text-on-surface-variant animate-fade-in">
                  <p className="font-body-md text-body-md text-[11px] leading-relaxed">
                    Set up an Apple Shortcut to save URLs directly from your Share Sheet.
                  </p>
                  
                  <div className="space-y-2">
                    <p className="font-bold text-[10px] text-outline uppercase tracking-wider">1. Webhook Endpoint</p>
                    <div className="flex items-center gap-1 bg-surface-container-high rounded px-2 py-1 font-mono text-[9px] truncate">
                      <span className="truncate flex-grow">{shortcutEndpoint}</span>
                      <button 
                        onClick={() => copyToClipboard(shortcutEndpoint, setCopiedUrl)}
                        className="text-primary hover:text-primary/80"
                        type="button"
                        title="Copy URL"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiedUrl ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="font-bold text-[10px] text-outline uppercase tracking-wider">2. Your User ID</p>
                    <div className="flex items-center gap-1 bg-surface-container-high rounded px-2 py-1 font-mono text-[9px]">
                      <span className="truncate flex-grow">{userId || "Loading..."}</span>
                      {userId && (
                        <button 
                          onClick={() => copyToClipboard(userId, setCopiedUserId)}
                          className="text-primary hover:text-primary/80"
                          type="button"
                          title="Copy User ID"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {copiedUserId ? "check" : "content_copy"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-outline-variant/30 space-y-1.5 text-[10px]">
                    <p className="font-bold text-outline uppercase tracking-wider">Shortcut Config:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Set Shortcut input type to <strong>URLs</strong>.</li>
                      <li>Use <strong>Get Contents of URL</strong> action set to <strong>POST</strong>.</li>
                      <li>Add Form keys: <code>url</code> (input), <code>user_id</code> (above), and <code>token</code> (your secret).</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Library Grid */}
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pb-4 border-b border-outline-variant/30">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                {selectedTag ? `#${selectedTag} Reels` : "Your Archived Insights"}
              </h2>
              
              {/* Semantic search row */}
              <form onSubmit={onSearch} className="flex items-center gap-2 bg-surface-container-low rounded-full pl-4 pr-1 py-1 border border-outline-variant shadow-sm focus-within:border-primary transition-all max-w-sm w-full">
                <span className="material-symbols-outlined text-[20px] text-outline">search</span>
                <input 
                  className="bg-transparent border-none focus:ring-0 p-0 text-sm placeholder:text-outline text-on-surface-variant outline-none min-w-0 w-full mr-2" 
                  placeholder="Semantic search query..." 
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query.trim() && (
                  <button 
                    type="button" 
                    onClick={() => { setQuery(""); setResults([]); }}
                    className="text-outline hover:text-primary mr-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                )}
                <button 
                  type="submit" 
                  className="bg-primary text-on-primary hover:bg-primary/95 text-xs font-bold px-4 py-2 rounded-full transition-all bouncy-interaction flex items-center gap-1 shrink-0 shadow-sm"
                >
                  Search
                </button>
              </form>
            </div>

            {searching && (
              <div className="flex items-center justify-center gap-2 py-12 text-primary font-bold">
                <span className="material-symbols-outlined animate-spin">sync</span>
                <span>Searching your memory database...</span>
              </div>
            )}

            {results.length > 0 && !searching && (
              <div className="space-y-6 bg-surface-container-low p-6 rounded-lg border border-outline-variant/30">
                <div className="flex justify-between items-center">
                  <h3 className="font-label-md text-label-md text-primary uppercase tracking-widest">Relevance Search Matches</h3>
                  <button onClick={() => setResults([])} className="text-xs text-outline hover:text-primary font-bold">Clear Matches</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {results.map((reel) => (
                    <ReelCard 
                      key={reel.id} 
                      reel={reel} 
                      score={reel.score} 
                      onClick={() => {
                        setSelectedReel(reel);
                        setRecallHits((prev) => {
                          const next = prev + 1;
                          localStorage.setItem("reel_search_recall_hits", String(next));
                          return next;
                        });
                      }} 
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Default Shelf Grid */}
            {!searching && results.length === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredLibrary.length > 0 ? (
                  filteredLibrary.map((reel) => (
                    <ReelCard key={reel.id} reel={reel} onClick={() => setSelectedReel(reel)} />
                  ))
                ) : (
                  <div className="col-span-full py-16 text-center space-y-4 border-2 border-dashed border-outline-variant/30 rounded-lg text-outline">
                    <span className="material-symbols-outlined text-[48px]">video_library</span>
                    <p className="font-body-md text-body-md text-on-surface-variant max-w-sm mx-auto">
                      No reels found in this view. Ingest some URLs above to see them displayed here.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-12 mt-auto bg-surface-container-low border-t border-outline-variant/20">
        <div className="flex flex-col md:flex-row justify-between items-center px-gutter max-w-container-max mx-auto gap-4">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="ReelMind Logo" className="w-6 h-6 rounded-full object-cover shrink-0" />
              <span className="font-headline-sm text-[18px] font-bold text-primary">ReelMind</span>
            </div>
            <p className="font-label-sm text-label-sm text-on-secondary-fixed-variant">© 2026 ReelMind. Built for focus.</p>
          </div>
          <div className="flex gap-8">
            <a className="font-label-sm text-label-sm text-on-secondary-fixed-variant hover:text-primary hover:underline" href="#">Privacy</a>
            <a className="font-label-sm text-label-sm text-on-secondary-fixed-variant hover:text-primary hover:underline" href="#">Terms</a>
            <a className="font-label-sm text-label-sm text-on-secondary-fixed-variant hover:text-primary hover:underline" href="#">Support</a>
          </div>
        </div>
      </footer>

      {selectedReel && (
        <ReelModal 
          reel={selectedReel} 
          onClose={() => setSelectedReel(null)} 
          onDeleteSuccess={() => handleReelDelete(selectedReel.id)} 
        />
      )}
    </div>
  );
}
