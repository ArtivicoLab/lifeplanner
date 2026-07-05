// Global build flags.
// LOCAL_MODE = true → the whole app runs on-device (IndexedDB) with no Google.
// Flip to false once the Sheets sync layer (lib/google/*) is wired in.
export const LOCAL_MODE = true;

export const APP_NAME = "Life Planner";
export const DB_NAME = "lifeplanner";
export const DB_VERSION = 4;

// Public source repository. TODO: set this once the repo is live, then the
// Privacy screen's "check the source" link becomes clickable automatically.
export const GITHUB_URL = "";

// Copyright holder shown in Privacy / footers.
export const COPYRIGHT_HOLDER = "Life Planner";
