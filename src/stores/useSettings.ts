import { create } from "zustand";
import { getKV, setKV } from "../lib/db";
import { syncDailyDigest } from "../lib/reminders";
import { DEFAULT_CATEGORIES, type Settings } from "../lib/types";

const KEY = "settings";
const DEFAULTS: Settings = {
  name: "",
  currency: "$",
  weekStart: 0,
  theme: "auto",
  digestTime: "",
  digestEventId: "",
  unitSystem: "imperial",
  hydrationGoalMl: 2000,
  debtStrategy: "snowball",
  debtOrder: [],
  monthlyExtra: 100,
  timeblockStart: "06:30",
  timeblockInterval: 30,
  categories: [...DEFAULT_CATEGORIES],
  hiddenRoutes: [],
  householdMembers: [],
  tabBarRoutes: ["dashboard", "tasks", "calendar", "habits"],
  accessCode: "",
  activated: false,
  hideAtsHint: false,
  tourDone: false,
};

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

function applyTheme(theme: Settings["theme"]) {
  document.documentElement.setAttribute("data-theme", theme);
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    const stored = (await getKV<Settings>(KEY)) ?? {};
    const merged = { ...DEFAULTS, ...stored };
    applyTheme(merged.theme);
    set({ ...merged, loaded: true });
  },
  update: (patch) => {
    const prev = pickSettings(get());
    const next = { ...prev, ...patch };
    if (patch.theme) applyTheme(patch.theme);
    set(patch);
    void setKV(KEY, next);
    // Only the actual settings screen calls this with a changed digestTime —
    // never on boot's `load()` — so the calendar.events scope stays lazy:
    // this is the first (and only) place it can be requested interactively.
    if (patch.digestTime !== undefined && patch.digestTime !== prev.digestTime) {
      void syncDailyDigest(patch.digestTime, prev.digestEventId).then((eventId) => {
        if (eventId === undefined || eventId === get().digestEventId) return;
        // Persist directly, bypassing `update()`, so this never re-triggers digest sync.
        set({ digestEventId: eventId });
        void setKV(KEY, { ...pickSettings(get()), digestEventId: eventId });
      });
    }
  },
}));

function pickSettings(s: Settings): Settings {
  return {
    name: s.name,
    currency: s.currency,
    weekStart: s.weekStart,
    theme: s.theme,
    digestTime: s.digestTime,
    digestEventId: s.digestEventId,
    unitSystem: s.unitSystem,
    hydrationGoalMl: s.hydrationGoalMl,
    debtStrategy: s.debtStrategy,
    debtOrder: s.debtOrder,
    monthlyExtra: s.monthlyExtra,
    timeblockStart: s.timeblockStart,
    timeblockInterval: s.timeblockInterval,
    categories: s.categories,
    hiddenRoutes: s.hiddenRoutes,
    householdMembers: s.householdMembers,
    tabBarRoutes: s.tabBarRoutes,
    accessCode: s.accessCode,
    activated: s.activated,
    hideAtsHint: s.hideAtsHint,
    tourDone: s.tourDone,
  };
}
