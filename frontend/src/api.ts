import { supabase } from "./supabaseClient";

export type Reel = {
  id: string;
  source_url: string;
  canonical_url?: string | null;
  title?: string | null;
  caption?: string | null;
  creator?: string | null;
  thumbnail_url?: string | null;
  ingest_status: string;
  created_at: string;
  gcs_uri?: string | null;
  summary?: string | null;
  actionable_items?: string | null;
  resources?: string | null;
  collection_id?: string | null;
  collection_name?: string | null;
};

export type SearchResult = Reel & {
  score: number;
};

export type Collection = {
  id: string;
  domain?: string | null;
  name: string;
  description?: string | null;
  keywords: string[];
  reel_count: number;
  updated_at: string;
  reels: Reel[];
};

export type LibraryCount = {
  count: number;
};

export type Health = {
  ok: boolean;
  database_configured: boolean;
  vertex_configured: boolean;
  gcs_configured: boolean;
  missing_env: string[];
};

export type SyncToken = {
  user_id: string;
  sync_token: string;
  expires_at: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const SYNC_USER_ID_STORAGE_KEY = "reel_search_sync_user_id";
export const SYNC_TOKEN_STORAGE_KEY = "reel_search_sync_token";

export function getStoredSyncIdentity() {
  const urlParams = new URLSearchParams(window.location.search);
  const userId = localStorage.getItem(SYNC_USER_ID_STORAGE_KEY) || urlParams.get("user_id") || import.meta.env.VITE_REEL_SYNC_USER_ID || "";
  const token = localStorage.getItem(SYNC_TOKEN_STORAGE_KEY) || urlParams.get("sync_token") || import.meta.env.VITE_REEL_SYNC_TOKEN || "";
  return { userId, token };
}

export function setStoredSyncIdentity(userId: string, token: string) {
  localStorage.setItem(SYNC_USER_ID_STORAGE_KEY, userId);
  localStorage.setItem(SYNC_TOKEN_STORAGE_KEY, token);
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const syncIdentity = getStoredSyncIdentity();
  if (syncIdentity.userId && syncIdentity.token) {
    return {
      "X-Reel-User-Id": syncIdentity.userId,
      "X-Reel-Sync-Token": syncIdentity.token
    };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.detail ?? message;
    } catch {
      // Keep the HTTP status text.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchHealth(): Promise<Health> {
  return parseResponse<Health>(await fetch(`${API_BASE}/api/health`));
}

export async function fetchReels(): Promise<Reel[]> {
  const headers = await getAuthHeaders();
  return parseResponse<Reel[]>(await fetch(`${API_BASE}/api/reels`, { headers }));
}

export async function fetchLibraryCount(): Promise<LibraryCount> {
  const headers = await getAuthHeaders();
  return parseResponse<LibraryCount>(await fetch(`${API_BASE}/api/reels/count`, { headers }));
}

export async function fetchCollections(): Promise<Collection[]> {
  const headers = await getAuthHeaders();
  return parseResponse<Collection[]>(await fetch(`${API_BASE}/api/collections`, { headers }));
}

export async function fetchCollectionReels(collectionId: string): Promise<Reel[]> {
  const headers = await getAuthHeaders();
  return parseResponse<Reel[]>(await fetch(
    `${API_BASE}/api/collections/${encodeURIComponent(collectionId)}/reels`,
    { headers }
  ));
}

export async function createSyncToken(): Promise<SyncToken> {
  const headers = await getAuthHeaders();
  return parseResponse<SyncToken>(await fetch(`${API_BASE}/api/sync-token`, {
    method: "POST",
    headers
  }));
}

export async function reclusterCollections(): Promise<Collection[]> {
  const headers = await getAuthHeaders();
  return parseResponse<Collection[]>(await fetch(`${API_BASE}/api/collections/recluster`, {
    method: "POST",
    headers
  }));
}

export async function saveReel(url: string, files?: File[] | File | null): Promise<{ reel: Reel; duplicate: boolean; ingest_source: "url" | "upload" }> {
  const form = new FormData();
  if (url.trim()) {
    form.append("url", url.trim());
  }
  if (files) {
    if (Array.isArray(files)) {
      files.forEach((file) => {
        form.append("files", file);
      });
    } else {
      form.append("files", files);
    }
  }
  const headers = await getAuthHeaders();
  return parseResponse(await fetch(`${API_BASE}/api/reels`, {
    method: "POST",
    headers,
    body: form
  }));
}

export async function searchReels(query: string, limit = 10): Promise<SearchResult[]> {
  const authHeaders = await getAuthHeaders();
  return parseResponse<SearchResult[]>(await fetch(`${API_BASE}/api/search`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify({ query, limit })
  }));
}

export async function deleteReel(id: string): Promise<{ ok: boolean }> {
  const headers = await getAuthHeaders();
  return parseResponse<{ ok: boolean }>(await fetch(`${API_BASE}/api/reels/${id}`, {
    method: "DELETE",
    headers
  }));
}
