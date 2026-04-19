#!/usr/bin/env node
// Phase 1i — cross-reference suspect list against Phase 1h results.

import { readFileSync, writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const RUN_ID = "9d85b941-05e6-4c97-b677-3c5b608f1c7b";

async function get(path) {
  const pages = [];
  let offset = 0;
  const page_size = 1000;
  while (true) {
    const url = `${SUPA_URL}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${page_size}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    pages.push(...rows);
    if (rows.length < page_size) break;
    offset += page_size;
  }
  return pages;
}

const reconcile = JSON.parse(readFileSync("audit/logs/phase-1i-reconciliation.json", "utf8"));
const pv = await get(`platform_verification?run_id=eq.${RUN_ID}&select=intel_store_id,pass,primary_platform,scan_error,final_url`);

function bestRow(rows) {
  const p2 = rows.find(r => r.pass === "pass2_browser");
  if (p2) return p2;
  return rows[0];
}

const byStore = new Map();
for (const r of pv) {
  if (!byStore.has(r.intel_store_id)) byStore.set(r.intel_store_id, []);
  byStore.get(r.intel_store_id).push(r);
}

function pvFor(id) {
  const rows = byStore.get(id);
  if (!rows) return { primary: "(no pv row)", scan_error: null, final_url: null };
  const b = bestRow(rows);
  return { primary: b.primary_platform || "none", scan_error: b.scan_error, final_url: b.final_url };
}

const catAWithPv = reconcile.catA.map(s => ({ ...s, ...pvFor(s.id) }));
const catBWithPv = reconcile.catB.map(s => ({ ...s, ...pvFor(s.id) }));

function tally(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] ?? "(null)";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a,b) => b[1]-a[1]);
}

console.log(`=== Category A (${catAWithPv.length} phantoms) by Phase 1h primary_platform ===`);
for (const [k,c] of tally(catAWithPv, "primary")) console.log(`  ${k}: ${c}`);

console.log(`\n=== Category B (${catBWithPv.length} duplicates) by Phase 1h primary_platform ===`);
for (const [k,c] of tally(catBWithPv, "primary")) console.log(`  ${k}: ${c}`);

// Overall: how many of Phase 1h's 147 "none" and 18 "error" are phantom/duplicate?
const allSuspectIds = new Set([
  ...catAWithPv.map(x => x.id),
  ...catBWithPv.map(x => x.id),
]);

let phase1hNone = 0, phase1hError = 0;
let phase1hNoneSuspect = 0, phase1hErrorSuspect = 0;
const allPlatforms = new Map();
for (const [storeId, rows] of byStore) {
  const b = bestRow(rows);
  const p = b.primary_platform || "none";
  if (b.scan_error) {
    phase1hError++;
    if (allSuspectIds.has(storeId)) phase1hErrorSuspect++;
  } else if (p === "none") {
    phase1hNone++;
    if (allSuspectIds.has(storeId)) phase1hNoneSuspect++;
  }
  allPlatforms.set(p, (allPlatforms.get(p) ?? 0) + 1);
}

console.log(`\n=== Phase 1h overlap ===`);
console.log(`Phase 1h 'none':  ${phase1hNone} total, ${phase1hNoneSuspect} are phantom/duplicate (${(100*phase1hNoneSuspect/phase1hNone).toFixed(1)}%)`);
console.log(`Phase 1h 'error': ${phase1hError} total, ${phase1hErrorSuspect} are phantom/duplicate (${(100*phase1hErrorSuspect/phase1hError).toFixed(1)}%)`);
console.log(`Revised 'none' (real detection misses): ${phase1hNone - phase1hNoneSuspect}`);
console.log(`Revised 'error' (real errors):          ${phase1hError - phase1hErrorSuspect}`);

// Also: what fraction of phantoms have a real menu (menu_items > 0)?
const phantomsWithMenu = catAWithPv.filter(x => x.total_products > 0);
console.log(`\nPhantoms with menu data (total_products > 0): ${phantomsWithMenu.length}/${catAWithPv.length}`);
const duplicatesWithMenu = catBWithPv.filter(x => x.total_products > 0);
console.log(`Duplicates with menu data (total_products > 0): ${duplicatesWithMenu.length}/${catBWithPv.length}`);

writeFileSync("audit/logs/phase-1i-overlap.json", JSON.stringify({
  catAWithPv,
  catBWithPv,
  phase1hStats: {
    none_total: phase1hNone,
    none_suspect: phase1hNoneSuspect,
    error_total: phase1hError,
    error_suspect: phase1hErrorSuspect,
    none_revised: phase1hNone - phase1hNoneSuspect,
    error_revised: phase1hError - phase1hErrorSuspect,
  },
  phantomsWithMenu: phantomsWithMenu.length,
  duplicatesWithMenu: duplicatesWithMenu.length,
}, null, 2));
console.log(`\nWrote audit/logs/phase-1i-overlap.json`);
