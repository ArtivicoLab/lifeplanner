// Global build flags.
// LOCAL_MODE = true → the whole app runs on-device (IndexedDB) with no Google.
// Flip to false once the Sheets sync layer (lib/google/*) is wired in.
export const LOCAL_MODE = true;

export const APP_NAME = "Life Planner";
export const DB_NAME = "lifeplanner";
export const DB_VERSION = 4;

// Public source repository — the Privacy screen's "check the source" link.
export const GITHUB_URL = "https://github.com/ArtivicoLab/lifeplanner";

// Copyright holder shown in Privacy / footers.
export const COPYRIGHT_HOLDER = "Life Planner";
