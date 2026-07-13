import { create } from "zustand";
import { hasClientId } from "../lib/google/auth";
import * as sync from "../lib/sync";
import { useToast } from "./useToast";
import type { Collection } from "../lib/db";

export type SyncStatus = "synced" | "syncing" | "offline";

interface SyncState {
  status: SyncStatus;
  pending: number;
  connected: boolean;
  spreadsheetId: string;
  hasClientId: boolean;
  busy: boolean;
  error: string;
  /**
   * True when the last connect() failed because the signed-in Google account
   * doesn't own the remembered sheet (picked the wrong account, or a genuine
   * switch). Settings shows a specific "try a different account" / "start a
   * new sheet with this account" choice instead of the raw API error text.
   */
  wrongAccount: boolean;
  /**
   * True when a background sync attempt found the Google token expired and a
   * silent refresh failed — typically the tab sat open long enough that the
   * ~1hr token lapsed. Background code deliberately never opens a popup to
   * fix this itself (see ReauthRequiredError); the UI shows a "tap to
   * reconnect" affordance instead, and that click is what's allowed to open
   * Google's sign-in popup safely.
   */
  needsReauth: boolean;

  setStatus: (s: SyncStatus) => void;
  /**
   * Called after every mutation; debounced push to Sheets when connected.
   * Pass the collection that changed so only its tab gets pushed (falls back
   * to a full push if omitted).
   */
  touch: (collection?: Collection) => void;

  connect: () => Promise<void>;
  /** Link to an existing Sheet by id/URL — the cross-device recovery path. */
  relink: (idOrUrl: string) => Promise<boolean>;
  disconnect: () => void;
  /**
   * `allowInteractive` (default true) must be passed `false` for any caller
   * that isn't a direct, current user click — e.g. the `online` browser
   * event, which fires whenever the network reconnects and can happen while
   * the tab isn't even focused. Defaulting this to "allowed" is what let a
   * Google popup appear "while the window is not used" (confirmed
   * 2026-07-13); see pushAll()'s doc comment in sync.ts.
   */
  syncNow: (allowInteractive?: boolean) => Promise<void>;
  /** Recovery for wrongAccount: abandon the remembered sheet, then connect()
      again so a fresh spreadsheet is created for the currently-signed-in account. */
  useThisAccountInstead: () => Promise<void>;
  /**
   * What the sync pill's click calls, in Header AND Sidebar — centralized so
   * a failure (e.g. a blocked popup) surfaces as a toast right where the user
   * clicked, instead of only being visible if they happen to go to Settings.
   */
  tapToRetry: () => Promise<void>;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Flip needsReauth on, and — only on the false→true transition — explain WHY
 * in a toast instead of leaving the pill to silently change label with no
 * context. A buyer who's never seen this before has no way to know "tap to
 * reconnect" is normal, expected behavior after the browser tab sits open
 * and idle for a while (the ~1hr Google token lapsing), not something
 * broken or something we did — reported directly: "they wont understand a
 * thing" (2026-07-13). Guarded to fire once per episode (not on every
 * background retry) so it doesn't nag: `keepTokenWarm`'s own 5-min interval
 * and the retry-with-backoff in attemptPush both call this repeatedly while
 * the state stays broken, and only the FIRST call should surface a toast.
 */
function flagNeedsReauth(get: () => SyncState, set: (p: Partial<SyncState>) => void) {
  if (get().needsReauth) { set({ needsReauth: true }); return; }
  set({ needsReauth: true });
  useToast.getState().show({
    message: "Your Google connection needs a quick refresh after being idle a while. Tap to reconnect, nothing was lost.",
  });
}

export const useSync = create<SyncState>((set, get) => ({
  status: navigator.onLine ? "synced" : "offline",
  pending: 0,
  connected: sync.isConnected(),
  spreadsheetId: sync.getSpreadsheetId(),
  hasClientId,
  busy: false,
  error: "",
  wrongAccount: false,
  needsReauth: false,

  setStatus: (status) => set({ status }),

  touch: (collection) => {
    if (get().connected) {
      sync.markDirty(collection ? sync.COLLECTION_TAB[collection] : undefined);
      sync.scheduleFlush(
        (s) => set({ status: s }),
        () => flagNeedsReauth(get, set)
      );
      return;
    }
    // Local-only mode: flash a quick "saved".
    if (!navigator.onLine) {
      set((s) => ({ status: "offline", pending: s.pending + 1 }));
      return;
    }
    set({ status: "syncing" });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ status: "synced", pending: 0 }), 400);
  },

  connect: async () => {
    set({ busy: true, error: "", wrongAccount: false, status: "syncing" });
    try {
      const id = await sync.connect();
      set({
        connected: true,
        spreadsheetId: id,
        busy: false,
        wrongAccount: false,
        needsReauth: false,
        status: "synced",
      });
    } catch (e) {
      const wrongAccount = e instanceof sync.SheetPermissionDeniedError;
      set({
        busy: false,
        wrongAccount,
        status: get().connected ? "synced" : "offline",
        error: wrongAccount
          ? "This Google account doesn't have access to your existing Life Planner sheet."
          : e instanceof Error ? e.message : "Could not connect.",
      });
    }
  },

  relink: async (idOrUrl) => {
    set({ busy: true, error: "", status: "syncing" });
    try {
      await sync.relink(idOrUrl);
      set({
        connected: true,
        spreadsheetId: sync.getSpreadsheetId(),
        busy: false,
        status: "synced",
      });
      return true;
    } catch (e) {
      set({
        busy: false,
        status: get().connected ? "synced" : "offline",
        error: e instanceof Error ? e.message : "Could not link that sheet.",
      });
      return false;
    }
  },

  disconnect: () => {
    sync.disconnect();
    // spreadsheetId is deliberately left in place — sync.disconnect() keeps the
    // sheet remembered so the next connect() relinks to it instead of creating
    // a new one; blanking it here would just make "Open my sheet" disappear
    // for no reason while disconnected.
    set({ connected: false, error: "", needsReauth: false });
  },

  syncNow: async (allowInteractive = true) => {
    if (!get().connected) return;
    set({ busy: true, status: "syncing", error: "" });
    try {
      await sync.pushAll(allowInteractive);
      set({ busy: false, status: "synced", needsReauth: false });
    } catch (e) {
      const needsReauth = e instanceof sync.ReauthRequiredError;
      set({
        busy: false,
        status: "offline",
        needsReauth,
        error: e instanceof Error ? e.message : "Sync failed.",
      });
    }
  },

  useThisAccountInstead: async () => {
    sync.abandonRememberedSheet();
    await get().connect();
  },

  tapToRetry: async () => {
    // Always the same call, needsReauth or not. This used to branch to a
    // dedicated reauth() for needsReauth that forced an interactive popup
    // UNCONDITIONALLY, upfront, skipping the silent-refresh-first attempt
    // pushAll()'s own authedFetch chain already does correctly — that's
    // exactly why Settings' "Sync now" (which has always just called
    // syncNow(), i.e. this same path) kept working while this pill's
    // dedicated branch didn't (confirmed 2026-07-13, reported directly: only
    // Settings' syncing worked, the sidebar's reconnect failed with "Google
    // sign-in didn't complete"). syncNow(true) already resets needsReauth on
    // success and only escalates to an interactive popup if silent genuinely
    // fails, same as every other successful reconnect path in this app.
    await get().syncNow();
    const err = get().error;
    if (err) useToast.getState().show({ message: err });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    const st = useSync.getState();
    // false: the network reconnecting has nothing to do with a user click and
    // can fire while the tab isn't even focused — must never risk a popup.
    // If a real reauth is needed, this fails fast (ReauthRequiredError) and
    // the sync pill shows "Tap to reconnect" for the user to click when ready.
    if (st.connected) void st.syncNow(false);
    else useSync.setState({ status: "synced", pending: 0 });
  });
  window.addEventListener("offline", () => useSync.setState({ status: "offline" }));

  // Proactively top up the Google token between edits instead of only ever
  // checking reactively at the exact moment a save needs one — that reactive
  // pattern is what made reconnecting feel like it kept ambushing active work
  // (confirmed 2026-07-13: "annoying... while we finish editing", and rapid
  // edits made it worse — the debounced save timer keeps getting pushed back
  // by each new edit, so the reauth check only ever fired once things finally
  // went quiet, landing right as a backlog of work was about to fire too).
  // Silent-only (see keepTokenWarm) — this never opens a popup itself, it
  // just means "tap to reconnect" tends to appear during a pause, not mid-edit.
  const warmUp = () =>
    void sync.keepTokenWarm(
      useSync.getState().needsReauth,
      () => flagNeedsReauth(useSync.getState, useSync.setState)
    );
  setInterval(warmUp, 5 * 60_000);
  // The setInterval above is NOT enough on its own: browsers throttle timers
  // in a backgrounded/minimized tab (Chrome can drop a hidden tab's interval
  // to firing far less than once per 5 min), so "left the tab open in the
  // background for a while" is exactly the case where the token can slip past
  // TOKEN_REFRESH_MARGIN_MS with no proactive check catching it — the user
  // then comes back, the token's already expired, and if a silent refresh
  // also fails at that exact moment, it lands as "tap to reconnect" with no
  // obvious cause (confirmed report: happens "after left open for a while").
  // Fixed by also checking immediately whenever the tab regains focus, same
  // pattern main.tsx already uses for the service-worker update check — this
  // catches up on whatever the throttled interval missed the instant it can.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") warmUp();
  });
}
