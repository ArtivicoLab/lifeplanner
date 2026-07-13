// Google Identity Services (GIS) token client (spec §8). No gapi — we load the
// tiny GIS script and call REST endpoints with fetch ourselves.

const GIS_SRC = "https://accounts.google.com/gsi/client";
export const SCOPE_SHEETS = "https://www.googleapis.com/auth/drive.file";
export const SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar.events";

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
export const hasClientId = CLIENT_ID.length > 0;

interface TokenState {
  token: string;
  expiresAt: number; // epoch ms
  scopes: Set<string>;
}
// Keyed by the exact scope STRING requested (SCOPE_SHEETS vs SCOPE_CALENDAR
// are different keys) — NOT a single shared slot. A single shared token used
// to mean requesting a Calendar-reminder token would silently evict a still
// valid Sheets token (and vice versa), so ordinary use (any task/bill with a
// reminder on) ping-ponged between the two scopes on every save, each swap
// needing a fresh token — which is exactly what surfaced as a real Google
// popup on every single add (confirmed 2026-07-13). Each scope now keeps its
// own independent cache entry so getting one token never evicts the other.
const tokenCache = new Map<string, TokenState>();

// GIS global (loaded from the script tag).
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: {
              access_token?: string;
              expires_in?: number;
              scope?: string;
              error?: string;
            }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let gisReady: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check your connection."));
    document.head.appendChild(s);
  });
  return gisReady;
}

/**
 * Fetch the Google sign-in script ahead of time (fire-and-forget), so it's
 * already loaded by the time the user clicks Connect. Without this, the first
 * click has to wait on a real network round-trip before it can call
 * requestAccessToken() — which happens outside the click's synchronous call
 * stack and can make browsers treat the resulting popup as not user-initiated
 * (opens, then gets closed immediately).
 */
export function preloadGis(): void {
  if (hasClientId) void loadGis();
}

function tokenValid(scope: string): boolean {
  const entry = tokenCache.get(scope);
  return !!entry && entry.expiresAt - Date.now() > 60_000;
}

/** Milliseconds left before `scope`'s cached token expires (0 if there is
    none cached at all). Lets background code decide "is this worth quietly
    refreshing now" without forcing a request. */
export function tokenTimeLeftMs(scope: string): number {
  const entry = tokenCache.get(scope);
  return entry ? Math.max(0, entry.expiresAt - Date.now()) : 0;
}

// GIS's callback is not always guaranteed to fire — e.g. with strict
// third-party cookie/storage blocking, a silent (prompt:"none") request can
// just never call back at all instead of cleanly erroring. With no bound on
// that, every caller awaiting requestToken() hung forever with no error,
// which is exactly what left the sync pill stuck on "Syncing…" with no way
// to recover short of a full page reload (confirmed 2026-07-13). Silent
// requests are normally near-instant, so its timeout is short. A BLOCKED
// popup is the other confirmed real-world cause (2026-07-13) — the browser
// can silently swallow requestAccessToken() with no callback at all, so an
// interactive request needs its own bound too; kept well under a minute
// (real sign-in with an existing Google session normally takes under 15s)
// so a blocked popup surfaces a clear, actionable message quickly instead of
// leaving the user staring at "Syncing…" for two minutes first.
const SILENT_TOKEN_TIMEOUT_MS = 10_000;
const INTERACTIVE_TOKEN_TIMEOUT_MS = 45_000;

/**
 * Request (or silently refresh) an access token for `scope`.
 * @param interactive false = try silent (prompt: ''); true = allow the popup.
 */
export function requestToken(
  scope: string = SCOPE_SHEETS,
  interactive = true
): Promise<string> {
  if (!hasClientId) {
    return Promise.reject(
      new Error("No Google client ID configured. Add VITE_GOOGLE_CLIENT_ID to your .env.")
    );
  }
  if (tokenValid(scope)) return Promise.resolve(tokenCache.get(scope)!.token);

  return loadGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
        let settled = false;
        const timeoutMs = interactive ? INTERACTIVE_TOKEN_TIMEOUT_MS : SILENT_TOKEN_TIMEOUT_MS;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(interactive
            ? "Google sign-in didn't open — your browser may have blocked the popup. Look for a blocked-popup icon in the address bar, allow it for this site, then try again."
            : "Could not silently refresh your Google connection."));
        }, timeoutMs);

        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope,
          callback: (resp) => {
            if (settled) return; // already timed out — ignore a very late callback
            settled = true;
            clearTimeout(timeout);
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error || "Authorization was cancelled."));
              return;
            }
            tokenCache.set(scope, {
              token: resp.access_token,
              expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
              scopes: new Set((resp.scope ?? scope).split(" ")),
            });
            resolve(resp.access_token);
          },
        });
        // '' attempts silent; 'consent' forces the account chooser.
        client.requestAccessToken({ prompt: interactive ? "" : "none" });
      })
  );
}

export function currentToken(): string | null {
  return tokenValid(SCOPE_SHEETS) ? tokenCache.get(SCOPE_SHEETS)!.token : null;
}

/** Drop a scope's cached token — e.g. after a 401 shows it's actually bad
    server-side even though it still looked time-valid locally. The NEXT
    requestToken() for that scope will fetch a genuinely fresh one. */
export function invalidateToken(scope: string): void {
  tokenCache.delete(scope);
}

export function forgetToken() {
  for (const entry of tokenCache.values()) {
    try {
      window.google?.accounts.oauth2.revoke(entry.token);
    } catch {
      /* ignore */
    }
  }
  tokenCache.clear();
}
