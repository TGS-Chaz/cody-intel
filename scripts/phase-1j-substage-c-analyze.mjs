#!/usr/bin/env node
// Identify which stores changed verdict in Sub-stage C.

import { readFileSync, writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const RUN = "ec3b40a1-3ae0-48a3-a361-962e0ab82baf";

const targets = JSON.parse(readFileSync("audit/logs/phase-1j-substage-c-targets.json", "utf8"));
const ids = targets.targets.map(t => t.id);

async function paged(path) {
  const out = [];
  let offset = 0; const page = 1000;
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

const pv = await paged(`platform_verification?select=intel_store_v2_id,pass,primary_platform,scan_error,signals,needs_credential_extraction,created_at&run_id=eq.${RUN}&pass=eq.pass2_browser&intel_store_v2_id=in.(${ids.join(",")})&order=created_at.desc`);
// Pick the LATEST pass2 row per store (upsert would have overwritten in DB, so there's only one).
const byV2 = new Map();
for (const r of pv) if (!byV2.has(r.intel_store_v2_id)) byV2.set(r.intel_store_v2_id, r);

const v2 = await paged(`intel_stores_v2?select=id,lcb_license_id,name,city,website&id=in.(${ids.join(",")})`);
const v2ById = new Map(v2.map(r => [r.id, r]));

const recovered = [];
const stillNone = [];
const stillError = [];
for (const t of targets.targets) {
  const rec = byV2.get(t.id);
  const store = v2ById.get(t.id);
  const verdict = rec
    ? (rec.scan_error ? "error" : (rec.primary_platform || "none"))
    : "(no_pass2)";
  const entry = {
    v2_id: t.id,
    name: t.name,
    city: t.city,
    website: t.website,
    previous: t.reason === "no_pv_row" ? "(no_pv_row)" : "none",
    new: verdict,
    signals_has_joint_biz: !!rec?.signals?.joint_business_id,
    needs_credential_extraction: rec?.needs_credential_extraction ?? null,
    joint_business_id: rec?.signals?.joint_business_id?.[0] ?? null,
  };
  if (["dutchie","jane","leafly","posabit","joint","weedmaps"].includes(verdict)) recovered.push(entry);
  else if (verdict === "error") stillError.push(entry);
  else stillNone.push(entry);
}

const byPlatform = {};
for (const r of recovered) {
  byPlatform[r.new] = byPlatform[r.new] || [];
  byPlatform[r.new].push(r);
}

console.log(`=== Recovered (${recovered.length}) ===`);
for (const [plat, rows] of Object.entries(byPlatform).sort((a,b) => b[1].length - a[1].length)) {
  console.log(`\n${plat}: ${rows.length}`);
  for (const r of rows) console.log(`  ${r.name} (${r.city}) → ${r.website}`);
}
console.log(`\n=== Still none: ${stillNone.length} ===`);
console.log(`=== Still error: ${stillError.length} ===`);

writeFileSync("audit/logs/phase-1j-substage-c-results.json", JSON.stringify({
  run_id: RUN,
  targets_total: targets.targets.length,
  recovered_count: recovered.length,
  recovered_by_platform: Object.fromEntries(Object.entries(byPlatform).map(([k, v]) => [k, v.length])),
  still_none_count: stillNone.length,
  still_error_count: stillError.length,
  recovered, stillNone, stillError,
}, null, 2));
console.log("\nWrote audit/logs/phase-1j-substage-c-results.json");
