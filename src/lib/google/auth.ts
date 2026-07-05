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
let state: TokenState | null = null;

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
  return (
    !!state &&
    state.expiresAt - Date.now() > 60_000 &&
    scope.split(" ").every((s) => state!.scopes.has(s))
  );
}

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
  if (tokenValid(scope)) return Promise.resolve(state!.token);

  return loadGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error || "Authorization was cancelled."));
              return;
            }
            state = {
              token: resp.access_token,
              expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
              scopes: new Set((resp.scope ?? scope).split(" ")),
            };
            resolve(resp.access_token);
          },
        });
        // '' attempts silent; 'consent' forces the account chooser.
        client.requestAccessToken({ prompt: interactive ? "" : "none" });
      })
  );
}

export function currentToken(): string | null {
  return state && tokenValid(SCOPE_SHEETS) ? state.token : null;
}

export function forgetToken() {
  if (state?.token) {
    try {
      window.google?.accounts.oauth2.revoke(state.token);
    } catch {
      /* ignore */
    }
  }
  state = null;
}
