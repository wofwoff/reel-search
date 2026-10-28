import { forwardRef, type FormEvent } from "react";
import Icon, { BrandMark } from "./Icon";
import { classifyOmnibox } from "./omnibox";

type TopBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onHome: () => void;
  onOpenSave: () => void;
  onUpload: () => void;
  onOpenDevices: () => void;
};

const TopBar = forwardRef<HTMLInputElement, TopBarProps>(function TopBar(
  { query, onQueryChange, onSubmit, onClear, onHome, onOpenSave, onUpload, onOpenDevices },
  inputRef
) {
  const mode = classifyOmnibox(query);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode !== "empty") onSubmit();
  }

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); onHome(); }}>
          <BrandMark />
          <span className="brand__word">reelmind</span>
        </a>

        <form className="omnibox" role="search" onSubmit={submit}>
          <Icon name={mode === "save" ? "link" : "search"} size={18} className="omnibox__icon" />
          <label htmlFor="omnibox" className="sr-only">Paste a reel link to save it, or search your library</label>
          <input
            id="omnibox"
            ref={inputRef}
            className="omnibox__input"
            type="search"
            enterKeyHint={mode === "save" ? "send" : "search"}
            autoComplete="off"
            placeholder="Paste a link to save, or search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query && (
            <button type="button" className="omnibox__clear" aria-label="Clear" onClick={onClear}>
              <Icon name="close" size={16} />
            </button>
          )}
          {mode !== "empty" && (
            <button type="submit" className={`omnibox__go${mode === "save" ? " omnibox__go--save" : ""}`}>
              {mode === "save" ? "Save" : "Search"}
            </button>
          )}
        </form>

        <div className="topbar__actions">
          <button type="button" className="btn btn--primary topbar__save" onClick={onOpenSave} aria-label="Save a reel">
            <Icon name="plus" size={18} />
            <span className="topbar__save-label">Save reel</span>
          </button>
          <button type="button" className="icon-btn icon-btn--filled desktop-only" aria-label="Upload a video or photos" onClick={onUpload}>
            <Icon name="upload" />
          </button>
          <button type="button" className="icon-btn icon-btn--filled desktop-only" aria-label="Devices and iPhone Shortcut" onClick={onOpenDevices}>
            <Icon name="devices" />
          </button>
        </div>
      </div>
    </header>
  );
});

export default TopBar;
