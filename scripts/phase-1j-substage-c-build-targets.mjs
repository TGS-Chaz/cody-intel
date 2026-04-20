#!/usr/bin/env node
// Sub-stage C target list: all v2 rows where Stage 4's best-available verdict
// is 'none' AND the row is active / has a website / is undesignated.
// Rescans get a chance to benefit from the refreshed Jane detector (Sub-stage B).

import { writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const RUN = "ec3b40a1-3ae0-48a3-a361-962e0ab82baf";

async function paged(path) {
  const out = [];
  let offset = 0;
  const page = 1000;
  while (true) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${page}&offset=${offset}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < page) break;
    offset += page;
  }
  return out;
}

// 1. Pull v2 candidates (active, website populated, designated_scraper NULL)
const v2 = await paged(
  "intel_stores_v2?select=id,name,city,website,designated_scraper,primary_platform,is_active"
  + "&is_active=eq.true"
  + "&website=not.is.null&website=neq."
  + "&designated_scraper=is.null"
);
console.log(`v2 candidates (active/website/undesignated): ${v2.length}`);

// 2. Pull pv rows for the run to compute best-available verdict
const pv = await paged(
  `platform_verification?select=intel_store_v2_id,pass,primary_platform,scan_error,signals&run_id=eq.${RUN}&intel_store_v2_id=not.is.null`
);
const byV2 = new Map();
for (const r of pv) {
  if (!byV2.has(r.intel_store_v2_id)) byV2.set(r.intel_store_v2_id, []);
  byV2.get(r.intel_store_v2_id).push(r);
}
function bestRow(rows) {
  const p2 = rows.find(r => r.pass === "pass2_browser");
  if (p2) return p2;
  return rows[0];
}

// 3. Filter to rows whose best-available verdict is 'none' (or no pv row)
const targets = [];
const stillErrored = [];
for (const s of v2) {
  const rows = byV2.get(s.id);
  if (!rows) { targets.push({ ...s, reason: "no_pv_row" }); continue; }
  const best = bestRow(rows);
  const verdict = best.scan_error ? "error" : (best.primary_platform || "none");
  if (verdict === "none") targets.push({ ...s, reason: "stage4_none" });
  else if (verdict === "error") stillErrored.push({ ...s, reason: "stage4_error" });
}

console.log(`Targets (stage4=none or no pv row): ${targets.length}`);
console.log(`Stage 4 error bucket (excluded; carry into separate pass): ${stillErrored.length}`);

writeFileSync("audit/logs/phase-1j-substage-c-targets.json", JSON.stringify({
  run_id: RUN,
  target_count: targets.length,
  errored_excluded: stillErrored.length,
  targets,
  errored: stillErrored,
}, null, 2));
console.log("Wrote audit/logs/phase-1j-substage-c-targets.json");
