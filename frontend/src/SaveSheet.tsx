import { useState, type FormEvent } from "react";
import Icon from "./Icon";
import { classifyOmnibox, toSaveUrl } from "./omnibox";
import Sheet from "./Sheet";

type SaveSheetProps = {
  onClose: () => void;
  onSaveLink: (url: string) => void;
  onChooseFiles: () => void;
};

export default function SaveSheet({ onClose, onSaveLink, onChooseFiles }: SaveSheetProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const canPaste = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (classifyOmnibox(value) !== "save") {
      setError("Paste an Instagram or YouTube link.");
      return;
    }
    onSaveLink(toSaveUrl(value));
  }

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      setValue(text);
      setError("");
    } catch {
      setError("Couldn't read the clipboard. Paste the link into the box instead.");
    }
  }

  return (
    <Sheet title="Save a reel" onClose={onClose}>
      <form className="save-sheet" onSubmit={submit}>
        <label htmlFor="save-sheet-url" className="field-label">Instagram or YouTube link</label>
        <div className="save-sheet__row">
          <input
            id="save-sheet-url"
            data-autofocus
            className="text-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://www.instagram.com/reel/…"
            value={value}
            onChange={(event) => { setValue(event.target.value); setError(""); }}
          />
          {canPaste && (
            <button type="button" className="icon-btn icon-btn--filled" aria-label="Paste from clipboard" onClick={paste}>
              <Icon name="paste" />
            </button>
          )}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--primary btn--block">Save reel</button>
        <p className="muted save-sheet__note">Saving keeps going in the background, so you can close this and keep browsing.</p>
      </form>

      <div className="divider"><span>or</span></div>

      <button type="button" className="btn btn--block" onClick={onChooseFiles}>
        <Icon name="upload" size={18} />
        Upload a video or photos
      </button>
    </Sheet>
  );
}
