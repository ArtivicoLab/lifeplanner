import { create } from "zustand";
import { hasClientId } from "../lib/google/auth";
import * as sync from "../lib/sync";

export type SyncStatus = "synced" | "syncing" | "offline";

interface SyncState {
  status: SyncStatus;
  pending: number;
  connected: boolean;
  spreadsheetId: string;
  hasClientId: boolean;
  busy: boolean;
  error: string;

  setStatus: (s: SyncStatus) => void;
  /** Called after every mutation; debounced push to Sheets when connected. */
  touch: () => void;

  connect: () => Promise<void>;
  /** Link to an existing Sheet by id/URL — the cross-device recovery path. */
  relink: (idOrUrl: string) => Promise<boolean>;
  disconnect: () => void;
  syncNow: () => Promise<void>;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

export const useSync = create<SyncState>((set, get) => ({
  status: navigator.onLine ? "synced" : "offline",
  pending: 0,
  connected: sync.isConnected(),
  spreadsheetId: sync.getSpreadsheetId(),
  hasClientId,
  busy: false,
  error: "",

  setStatus: (status) => set({ status }),

  touch: () => {
    if (get().connected) {
      sync.scheduleFlush((s) => set({ status: s }));
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
    set({ busy: true, error: "", status: "syncing" });
    try {
      const id = await sync.connect();
      set({
        connected: true,
        spreadsheetId: id,
        busy: false,
        status: "synced",
      });
    } catch (e) {
      set({
        busy: false,
        status: get().connected ? "synced" : "offline",
        error: e instanceof Error ? e.message : "Could not connect.",
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
    set({ connected: false, spreadsheetId: "", error: "" });
  },

  syncNow: async () => {
    if (!get().connected) return;
    set({ busy: true, status: "syncing", error: "" });
    try {
      await sync.pushAll();
      set({ busy: false, status: "synced" });
    } catch (e) {
      set({ busy: false, status: "offline", error: e instanceof Error ? e.message : "Sync failed." });
    }
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    const st = useSync.getState();
    if (st.connected) void st.syncNow();
    else useSync.setState({ status: "synced", pending: 0 });
  });
  window.addEventListener("offline", () => useSync.setState({ status: "offline" }));
}
