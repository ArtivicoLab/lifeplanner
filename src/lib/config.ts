// Global build flags.
// LOCAL_MODE = true → the whole app runs on-device (IndexedDB) with no Google.
// Flip to false once the Sheets sync layer (lib/google/*) is wired in.
export const LOCAL_MODE = false;

export const APP_NAME = "Life Planner";
export const DB_NAME = "lifeplanner";
export const DB_VERSION = 4;

// Public source repository — the Privacy screen's "check the source" link.
export const GITHUB_URL = "https://github.com/ArtivicoLab/lifeplanner";

// Copyright holder shown in Privacy / footers.
export const COPYRIGHT_HOLDER = "Life Planner";

// Version stamp shown in page footers — package.json version plus (when built
// by CI) the short deployed commit SHA, so a live site's freshness can be
// checked at a glance instead of guessing whether a deploy actually landed.
export const APP_VERSION = __APP_VERSION__;
export const BUILD_SHA = (import.meta.env.VITE_COMMIT_SHA ?? "").slice(0, 7);
