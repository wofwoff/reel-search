import { useCallback, useEffect, useState } from "react";
import { getStoredSyncIdentity, setStoredSyncIdentity } from "./api";
import { supabase } from "./supabaseClient";

async function importSupabaseSync(accessToken: string | null, refreshToken: string | null) {
  if (!refreshToken) return null;
  if (accessToken) {
    const res = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (!res.error) return null;
    const refreshRes = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });
    return refreshRes.error;
  }

  const res = await supabase.auth.refreshSession({
    refresh_token: refreshToken
  });
  return res.error;
}

/**
 * Resolves who the library belongs to: a sync identity (from a sync link or storage) wins,
 * otherwise the Supabase session, signing in anonymously when there is none.
 * `sessionKey` changes whenever the library should be (re)loaded for the current identity.
 */
export function useSession() {
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [sessionKey, setSessionKey] = useState(0);

  const bumpSession = useCallback(() => setSessionKey((value) => value + 1), []);

  /** Store a sync identity for this same library (e.g. after issuing a sync link); no reload needed. */
  const rememberSyncIdentity = useCallback((nextUserId: string, syncToken: string) => {
    setStoredSyncIdentity(nextUserId, syncToken);
    setUserId(nextUserId);
  }, []);

  /** Switch to a library imported from another device and reload it. */
  const adoptSyncIdentity = useCallback((nextUserId: string, syncToken: string) => {
    rememberSyncIdentity(nextUserId, syncToken);
    bumpSession();
  }, [rememberSyncIdentity, bumpSession]);

  useEffect(() => {
    let active = true;

    function importSyncIdentity(userIdParam: string | null, syncTokenParam: string | null) {
      if (!userIdParam || !syncTokenParam) return false;
      setStoredSyncIdentity(userIdParam, syncTokenParam);
      setUserId(userIdParam);
      return true;
    }

    const initAuth = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const accessTokenParam = urlParams.get("access_token");
        const refreshTokenParam = urlParams.get("refresh_token") || urlParams.get("sync");
        const userIdParam = urlParams.get("user_id");
        const syncTokenParam = urlParams.get("sync_token");

        if (importSyncIdentity(userIdParam, syncTokenParam)) {
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (refreshTokenParam) {
          setIsAuthLoading(true);
          const error = await importSupabaseSync(accessTokenParam, refreshTokenParam);
          if (error) {
            console.error("Failed to import sync session:", error);
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        const syncIdentity = getStoredSyncIdentity();
        if (active && syncIdentity.userId && syncIdentity.token) {
          setUserId(syncIdentity.userId);
          setSessionKey((value) => value + 1);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (active) {
          if (!session) {
            await supabase.auth.signInAnonymously();
          } else {
            if (session.user) {
              setUserId(session.user.id);
            }
            setSessionKey((value) => value + 1);
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
      if (!active) return;
      const syncIdentity = getStoredSyncIdentity();
      if (syncIdentity.userId && syncIdentity.token) {
        setUserId(syncIdentity.userId);
        setIsAuthLoading(false);
        setSessionKey((value) => value + 1);
      } else if (!session) {
        setIsAuthLoading(true);
        setUserId("");
        await supabase.auth.signInAnonymously();
      } else {
        if (session.user) {
          setUserId(session.user.id);
        }
        setIsAuthLoading(false);
        setSessionKey((value) => value + 1);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { isAuthLoading, userId, sessionKey, bumpSession, rememberSyncIdentity, adoptSyncIdentity, importSupabaseSync };
}
