#!/usr/bin/env node
// Analyze Sub-stage A rescan results. Identify the stores whose verdict changed.

import { readFileSync, writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const RUN_ID = "ec3b40a1-3ae0-48a3-a361-962e0ab82baf";

const targets = JSON.parse(readFileSync("audit/logs/phase-1j-substage-a-targets.json", "utf8"));
const ids = targets.targets.map(t => t.v2_id);

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

// Pull all pass2 rows for the target IDs under the same run_id, ordered by created_at desc.
// The Sub-stage A rescan wrote new rows via upsert on (run_id, intel_store_v2_id, pass),
// so each target now has ONE pass2_browser row — the latest detection.
const pv = await paged(`platform_verification?select=intel_store_v2_id,pass,primary_platform,scan_error,signals,needs_credential_extraction,created_at&run_id=eq.${RUN_ID}&intel_store_v2_id=in.(${ids.join(",")})&order=created_at.desc`);
console.log(`pv rows for ${ids.length} targets: ${pv.length}`);

const byV2 = new Map();
for (const r of pv) {
  if (!byV2.has(r.intel_store_v2_id)) byV2.set(r.intel_store_v2_id, []);
  byV2.get(r.intel_store_v2_id).push(r);
}

const v2 = await paged(`intel_stores_v2?select=id,lcb_license_id,name,city,website,primary_platform,designated_scraper&id=in.(${ids.join(",")})`);
const v2ById = new Map(v2.map(r => [r.id, r]));

const results = [];
for (const t of targets.targets) {
  const rows = byV2.get(t.v2_id) || [];
  const pass2 = rows.find(r => r.pass === "pass2_browser");
  const newVerdict = pass2
    ? (pass2.scan_error ? "error" : (pass2.primary_platform || "none"))
    : null;
  const oldVerdict = t.bucket === "regressed" || t.bucket === "gap+regressed"
    ? t.stage4_verdict
    : "(no_pass2_before)";
  const changed = newVerdict && newVerdict !== oldVerdict && newVerdict !== "none" && newVerdict !== "error";
  const store = v2ById.get(t.v2_id);
  results.push({
    v2_id: t.v2_id,
    name: t.name,
    city: t.city,
    website: t.website,
    bucket: t.bucket,
    previous_verdict: oldVerdict,
    new_verdict: newVerdict ?? "(no_pass2_written)",
    changed,
    v2_current_primary_platform: store?.primary_platform ?? null,
    v2_current_designated_scraper: store?.designated_scraper ?? null,
    needs_credential_extraction: pass2?.needs_credential_extraction ?? null,
    joint_business_id: pass2?.signals?.joint_business_id?.[0] ?? null,
  });
}

const improved = results.filter(r => r.changed);
const stillNone = results.filter(r => r.new_verdict === "none");
const stillError = results.filter(r => r.new_verdict === "error");
const noPass2 = results.filter(r => r.new_verdict === "(no_pass2_written)");

console.log(`\n=== Improved (verdict changed to real platform) ===`);
for (const r of improved) console.log(`  ${r.name} (${r.city}) | was=${r.previous_verdict} → now=${r.new_verdict} | ${r.website}`);

console.log(`\n=== Still none (${stillNone.length}) ===`);
for (const r of stillNone) console.log(`  ${r.name} (${r.city}) | ${r.bucket} | was=${r.previous_verdict} | ${r.website}`);

console.log(`\n=== Still error (${stillError.length}) ===`);
for (const r of stillError) console.log(`  ${r.name} (${r.city}) | was=${r.previous_verdict} | ${r.website}`);

console.log(`\n=== Summary ===`);
console.log(`  improved: ${improved.length}`);
console.log(`  still_none: ${stillNone.length}`);
console.log(`  still_error: ${stillError.length}`);
console.log(`  no_pass2_written: ${noPass2.length}`);

writeFileSync("audit/logs/phase-1j-substage-a-analysis.json", JSON.stringify({
  run_id: RUN_ID,
  total_targets: results.length,
  improved_count: improved.length,
  still_none_count: stillNone.length,
  still_error_count: stillError.length,
  no_pass2_count: noPass2.length,
  results,
}, null, 2));
console.log(`\nWrote audit/logs/phase-1j-substage-a-analysis.json`);
