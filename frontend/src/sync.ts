// Where the web app is publicly served; must match `_FRONTEND_URL` in cloudbuild.yaml.
// Used for sync links created inside the iOS app or on localhost, whose own origin is unreachable from another device.
export const PUBLIC_APP_URL = "https://reel-search-frontend-403410843888.us-central1.run.app";

export type SyncImport =
  | { kind: "sync"; userId: string; syncToken: string }
  | { kind: "supabase"; accessToken: string; refreshToken: string };

export function shortcutEndpoint(apiBase: string, origin: string): string {
  const base = (apiBase || origin).replace(/\/+$/, "");
  return `${base}/api/reels/shortcut`;
}

export function buildSyncLink(origin: string, pathname: string, userId: string, syncToken: string): string {
  if (!userId || !syncToken) return "";
  const reachable = !(origin.startsWith("capacitor://") || origin.includes("localhost"));
  const base = reachable ? origin : PUBLIC_APP_URL;
  const path = reachable ? pathname : "/";
  return `${base}${path}?user_id=${encodeURIComponent(userId)}&sync_token=${encodeURIComponent(syncToken)}`;
}

/** Accepts a full sync link (user_id + sync_token), a legacy session link, or a bare refresh token. */
export function parseSyncInput(value: string): SyncImport {
  let token = value.trim();
  let accessToken = "";
  let userId = "";
  let syncToken = "";

  if (token.startsWith("v1.") && !token.includes("?")) {
    throw new Error("Sync token requires a User ID. Please paste the full Sync Link instead.");
  }

  try {
    if (!/^https?:\/\//i.test(token) && (token.includes("user_id=") || token.includes("sync_token="))) {
      token = `https://${token}`;
    }
    if (token.includes("?")) {
      const url = new URL(token);
      token = url.searchParams.get("refresh_token") || url.searchParams.get("sync") || token;
      accessToken = url.searchParams.get("access_token") || "";
      userId = url.searchParams.get("user_id") || "";
      syncToken = url.searchParams.get("sync_token") || "";
    }
  } catch {
    // Treat raw input as a legacy refresh token.
  }

  if (userId && syncToken) {
    return { kind: "sync", userId, syncToken };
  }
  return { kind: "supabase", accessToken, refreshToken: token };
}
