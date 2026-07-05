// Typed Google Sheets REST wrapper (spec §8). Raw fetch + bearer token, with a
// single transparent retry on 401 (token expiry).

import { requestToken, SCOPE_SHEETS } from "./auth";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function authedFetch(
  url: string,
  init: RequestInit = {},
  retry = true
): Promise<Response> {
  const token = await requestToken(SCOPE_SHEETS, false).catch(() =>
    requestToken(SCOPE_SHEETS, true)
  );
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 401 && retry) {
    // Force a fresh interactive token, then retry once.
    await requestToken(SCOPE_SHEETS, true);
    return authedFetch(url, init, false);
  }
  return res;
}

export class SheetNotFoundError extends Error {}

async function ok(res: Response): Promise<unknown> {
  if (res.status === 404) throw new SheetNotFoundError("Spreadsheet not found");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Create a spreadsheet with the given tab titles. Returns its id. */
export async function createSpreadsheet(
  title: string,
  tabTitles: string[]
): Promise<string> {
  const body = {
    properties: { title },
    sheets: tabTitles.map((t) => ({ properties: { title: t } })),
  };
  const res = await authedFetch(BASE, { method: "POST", body: JSON.stringify(body) });
  const json = (await ok(res)) as { spreadsheetId: string };
  return json.spreadsheetId;
}

export interface SpreadsheetMeta {
  title: string;
  tabTitles: string[];
}

export async function getMeta(spreadsheetId: string): Promise<SpreadsheetMeta> {
  const res = await authedFetch(
    `${BASE}/${spreadsheetId}?fields=properties.title,sheets.properties.title`
  );
  const json = (await ok(res)) as {
    properties: { title: string };
    sheets: { properties: { title: string } }[];
  };
  return {
    title: json.properties.title,
    tabTitles: json.sheets.map((s) => s.properties.title),
  };
}

/** Add any missing tabs (used to migrate an older sheet forward). */
export async function ensureTabs(
  spreadsheetId: string,
  wantTabs: string[]
): Promise<void> {
  const meta = await getMeta(spreadsheetId);
  const missing = wantTabs.filter((t) => !meta.tabTitles.includes(t));
  if (missing.length === 0) return;
  const requests = missing.map((title) => ({ addSheet: { properties: { title } } }));
  const res = await authedFetch(`${BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  await ok(res);
}

/** Read several tab ranges in one call. Returns tab -> 2D string values. */
export async function batchGet(
  spreadsheetId: string,
  tabs: string[]
): Promise<Record<string, string[][]>> {
  const params = tabs.map((t) => `ranges=${encodeURIComponent(t)}`).join("&");
  const res = await authedFetch(`${BASE}/${spreadsheetId}/values:batchGet?${params}`);
  const json = (await ok(res)) as {
    valueRanges: { range: string; values?: string[][] }[];
  };
  const out: Record<string, string[][]> = {};
  json.valueRanges.forEach((vr, i) => {
    out[tabs[i]] = vr.values ?? [];
  });
  return out;
}

/** Overwrite a whole tab with `values` (header row + data). Clears stale rows first. */
export async function writeTab(
  spreadsheetId: string,
  tab: string,
  values: string[][]
): Promise<void> {
  const clearRes = await authedFetch(
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(tab)}:clear`,
    { method: "POST", body: "{}" }
  );
  await ok(clearRes);
  const res = await authedFetch(
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values }) }
  );
  await ok(res);
}

export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}
