import type { Reel, SearchResult } from "./api";
import ReelTile from "./ReelTile";

type SearchResultsProps = {
  query: string;
  results: SearchResult[] | null;
  error: string;
  hiddenIds: Set<string>;
  onOpen: (reel: Reel) => void;
  onClear: () => void;
};

export default function SearchResults({ query, results, error, hiddenIds, onOpen, onClear }: SearchResultsProps) {
  const visible = results?.filter((reel) => !hiddenIds.has(reel.id)) ?? null;

  return (
    <section className="card" aria-labelledby="results-heading" aria-busy={results === null && !error}>
      <div className="card__header">
        <div>
          <h2 id="results-heading" className="card__title">Results for “{query}”</h2>
          {visible && <p className="muted">{visible.length} {visible.length === 1 ? "match" : "matches"}, best first</p>}
        </div>
        <button type="button" className="btn" onClick={onClear}>Back to library</button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {!error && visible?.length === 0 && (
        <p className="empty-note">Nothing in your library matches that yet. Try describing what the reel showed or said.</p>
      )}

      <ul className="collection__grid">
        {visible === null && !error
          ? Array.from({ length: 6 }, (_, index) => (
            <li key={index} aria-hidden="true"><span className="tile tile--skeleton"><span className="tile__media" /></span></li>
          ))
          : visible?.map((reel) => (
            <li key={reel.id}><ReelTile reel={reel} score={reel.score} onOpen={onOpen} /></li>
          ))}
      </ul>
    </section>
  );
}
