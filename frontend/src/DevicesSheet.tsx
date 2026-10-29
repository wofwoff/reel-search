import { useEffect, useState, type FormEvent } from "react";
import { API_BASE, createSyncToken, getStoredSyncIdentity } from "./api";
import Icon from "./Icon";
import Sheet from "./Sheet";
import { buildSyncLink, parseSyncInput, shortcutEndpoint } from "./sync";

type DevicesSheetProps = {
  userId: string;
  onClose: () => void;
  rememberSyncIdentity: (userId: string, syncToken: string) => void;
  adoptSyncIdentity: (userId: string, syncToken: string) => void;
  importSupabaseSync: (accessToken: string | null, refreshToken: string | null) => Promise<unknown>;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the value is still selectable.
    }
  }

  return (
    <div className="copy-field">
      <span className="field-label">{label}</span>
      <div className="copy-field__row">
        <code className="copy-field__value">{value || "Loading…"}</code>
        {value && (
          <button type="button" className="icon-btn" aria-label={copied ? `${label} copied` : `Copy ${label}`} onClick={copy}>
            <Icon name={copied ? "check" : "copy"} size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function DevicesSheet({ userId, onClose, rememberSyncIdentity, adoptSyncIdentity, importSupabaseSync }: DevicesSheetProps) {
  const [syncLink, setSyncLink] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [linkError, setLinkError] = useState("");
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState("");
  const [importDone, setImportDone] = useState(false);

  useEffect(() => {
    let active = true;
    createSyncToken()
      .then((issued) => {
        if (!active) return;
        rememberSyncIdentity(issued.user_id, issued.sync_token);
        setSyncToken(issued.sync_token);
        setSyncLink(buildSyncLink(window.location.origin, window.location.pathname, issued.user_id, issued.sync_token));
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to create sync link", err);
        setLinkError(err instanceof Error ? err.message : "Couldn't create a sync link");
        const stored = getStoredSyncIdentity();
        setSyncToken(stored.token);
        setSyncLink(buildSyncLink(window.location.origin, window.location.pathname, stored.userId, stored.token));
      });
    return () => {
      active = false;
    };
  }, [rememberSyncIdentity]);

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    if (!importValue.trim()) return;
    setImportError("");
    setImportDone(false);
    try {
      const parsed = parseSyncInput(importValue);
      if (parsed.kind === "sync") {
        // Validate the credentials before replacing this device's library with them.
        const response = await fetch(`${API_BASE}/api/reels/count`, {
          headers: { "X-Reel-User-Id": parsed.userId, "X-Reel-Sync-Token": parsed.syncToken }
        });
        if (response.status === 401) throw new Error("Invalid sync token");
        if (!response.ok) throw new Error(`Sync validation failed: Server returned ${response.status}`);
        adoptSyncIdentity(parsed.userId, parsed.syncToken);
      } else {
        const error = await importSupabaseSync(parsed.accessToken, parsed.refreshToken);
        if (error) throw error;
      }
      setImportDone(true);
      setImportValue("");
      setTimeout(onClose, 1500);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid sync token");
    }
  }

  return (
    <Sheet title="Devices" onClose={onClose}>
      <section className="sheet-section" aria-labelledby="devices-open">
        <h3 id="devices-open" className="sheet-section__title">Open your library on another device</h3>
        <p className="muted">Scan with your phone's camera, or send yourself the link.</p>
        {syncLink ? (
          <div className="qr">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(syncLink)}`}
              alt="QR code for your sync link"
              width={180}
              height={180}
            />
          </div>
        ) : (
          <p className="muted">{linkError || "Creating a secure link…"}</p>
        )}
        {linkError && syncLink && <p className="form-error">{linkError}</p>}
        <CopyField label="Sync link" value={syncLink} />
      </section>

      <section className="sheet-section" aria-labelledby="devices-import">
        <h3 id="devices-import" className="sheet-section__title">Use a library from another device</h3>
        <form className="import-form" onSubmit={handleImport}>
          <label htmlFor="sync-import" className="field-label">Sync link</label>
          <div className="save-sheet__row">
            <input
              id="sync-import"
              className="text-input"
              type="text"
              autoComplete="off"
              placeholder="Paste a sync link"
              value={importValue}
              onChange={(event) => setImportValue(event.target.value)}
            />
            <button type="submit" className="btn btn--primary">Import</button>
          </div>
          <div aria-live="polite">
            {importDone && <p className="form-success"><Icon name="check" size={16} /> Library synced</p>}
            {importError && <p className="form-error">{importError}</p>}
          </div>
        </form>
      </section>

      <section className="sheet-section" aria-labelledby="devices-shortcut">
        <h3 id="devices-shortcut" className="sheet-section__title">
          <Icon name="bolt" size={18} /> iPhone Shortcut
        </h3>
        <p className="muted">Save straight from the Share Sheet with a Shortcut that posts the link here.</p>
        <CopyField label="Endpoint" value={shortcutEndpoint(API_BASE, window.location.origin)} />
        <CopyField label="Your user ID" value={userId} />
        {syncToken && <CopyField label="Token" value={syncToken} />}
        <ol className="steps">
          <li>Set the Shortcut's input type to <strong>URLs</strong>.</li>
          <li>Add <strong>Get Contents of URL</strong>, method <strong>POST</strong>, body <strong>Form</strong>.</li>
          <li>Add form fields <code>url</code> (Shortcut input), <code>user_id</code> and <code>token</code> (both above).</li>
        </ol>
      </section>
    </Sheet>
  );
}
