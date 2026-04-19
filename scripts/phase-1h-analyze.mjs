#!/usr/bin/env node
// Phase 1h — analyze platform_verification results vs intel_stores designations.
// Reads RUN_ID from arg or env, pulls both tables, produces a JSON summary
// and writes per-section data that audit/35 tables are built from.
//
// Usage:   node scripts/phase-1h-analyze.mjs <RUN_ID>

import { writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const RUN_ID = process.argv[2] || process.env.RUN_ID;
if (!RUN_ID) { console.error("usage: node phase-1h-analyze.mjs <RUN_ID>"); process.exit(1); }

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

function pickBestRow(rows) {
  // Prefer pass2 row if present (more signal), else pass1
  const p2 = rows.find(r => r.pass === "pass2_browser");
  if (p2) return p2;
  return rows[0];
}

async function main() {
  const stores = await get("intel_stores?select=id,name,website,designated_scraper,status&status=eq.active&website=not.is.null&website=neq.");
  const pv = await get(`platform_verification?run_id=eq.${RUN_ID}&select=intel_store_id,pass,primary_platform,signals,confidence,needs_credential_extraction,scan_error,final_url,http_status,duration_ms,probed_urls`);

  const byStore = new Map();
  for (const r of pv) {
    if (!byStore.has(r.intel_store_id)) byStore.set(r.intel_store_id, []);
    byStore.get(r.intel_store_id).push(r);
  }

  const platforms = ["dutchie","jane","leafly","posabit","weedmaps","joint","none","error"];
  const distribution = Object.fromEntries(platforms.map(p => [p, 0]));

  const matches = [];
  const nullToDetected = [];
  const nullToNone = [];
  const mismatches = [];
  const posabitNeedCreds = [];
  const leaflyNotLeafly = [];
  const errors = [];
  let joint17StillDetected = 0;
  let jointNewDetected = [];

  const allJointStoresPre = new Set(stores.filter(s => s.designated_scraper === "joint").map(s => s.id));

  for (const s of stores) {
    const rows = byStore.get(s.id);
    if (!rows || rows.length === 0) {
      errors.push({ id: s.id, name: s.name, reason: "no_pv_row" });
      continue;
    }
    const best = pickBestRow(rows);
    const detected = best.primary_platform || "none";
    const current = s.designated_scraper;

    // error vs none vs detected
    if (best.scan_error) {
      distribution.error = (distribution.error ?? 0) + 1;
    } else if (detected === "none") {
      distribution.none = (distribution.none ?? 0) + 1;
    } else {
      distribution[detected] = (distribution[detected] ?? 0) + 1;
    }

    // Joint coverage tracking
    if (detected === "joint") {
      if (allJointStoresPre.has(s.id)) joint17StillDetected++;
      else jointNewDetected.push({ id: s.id, name: s.name, website: s.website });
    }

    if (detected === "posabit" && best.needs_credential_extraction) {
      posabitNeedCreds.push({ id: s.id, name: s.name, website: s.website });
    }

    if (current == null) {
      if (detected === "none") nullToNone.push({ id: s.id, name: s.name, website: s.website });
      else nullToDetected.push({ id: s.id, name: s.name, website: s.website, detected });
    } else if (current === detected) {
      matches.push({ id: s.id, name: s.name, platform: detected });
    } else {
      mismatches.push({ id: s.id, name: s.name, website: s.website, current, detected });
      if (current === "leafly") leaflyNotLeafly.push({ id: s.id, name: s.name, detected });
    }
  }

  // Build mismatch sub-table by (old, new)
  const mismatchPairs = new Map();
  for (const m of mismatches) {
    const k = `${m.current}→${m.detected}`;
    if (!mismatchPairs.has(k)) mismatchPairs.set(k, { old: m.current, new: m.detected, count: 0, samples: [] });
    const p = mismatchPairs.get(k);
    p.count++;
    if (p.samples.length < 3) p.samples.push(m.name);
  }
  const mismatchTable = Array.from(mismatchPairs.values()).sort((a,b) => b.count - a.count);

  // Pass 1 vs Pass 2 resolution split
  let pass1Resolved = 0;
  let pass2Resolved = 0;
  let bothNone = 0;
  for (const [storeId, rows] of byStore) {
    const p1 = rows.find(r => r.pass === "pass1_http");
    const p2 = rows.find(r => r.pass === "pass2_browser");
    const p1Primary = p1?.primary_platform;
    const p2Primary = p2?.primary_platform;
    if (p1Primary && p1Primary !== "none") pass1Resolved++;
    else if (p2Primary && p2Primary !== "none") pass2Resolved++;
    else bothNone++;
  }

  // Error patterns — common scan_error strings
  const errorPatterns = new Map();
  for (const r of pv) {
    if (r.scan_error) {
      const key = String(r.scan_error).slice(0, 80);
      errorPatterns.set(key, (errorPatterns.get(key) ?? 0) + 1);
    }
  }
  const topErrors = Array.from(errorPatterns.entries()).sort((a,b) => b[1]-a[1]).slice(0, 10);

  const summary = {
    runId: RUN_ID,
    totalStores: stores.length,
    pvRowsRunId: pv.length,
    uniqueStoresInPv: byStore.size,
    pass1Resolved,
    pass2Resolved,
    bothNone,
    distribution,
    comparison: {
      matches: matches.length,
      nullToDetected: nullToDetected.length,
      nullToNone: nullToNone.length,
      mismatches: mismatches.length,
      noPvRow: errors.length,
    },
    mismatchTable,
    posabitNeedCreds: posabitNeedCreds.length,
    posabitNeedCredsSample: posabitNeedCreds.slice(0,8),
    leaflyNotLeafly: leaflyNotLeafly.length,
    leaflyNotLeaflyBreakdown: (() => {
      const m = new Map();
      for (const r of leaflyNotLeafly) m.set(r.detected, (m.get(r.detected) ?? 0) + 1);
      return Object.fromEntries(m);
    })(),
    jointCoverage: {
      preRunJointCount: allJointStoresPre.size,
      joint17StillDetected,
      jointNewDetected: jointNewDetected,
    },
    nullResolvedSample: nullToDetected.slice(0, 20),
    nullStillNoneSample: nullToNone.slice(0, 20),
    topErrorPatterns: topErrors,
  };

  const out = `audit/logs/phase-1h-analysis-${RUN_ID}.json`;
  writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`Analysis written to ${out}`);
  console.log(JSON.stringify({
    runId: RUN_ID, total: stores.length,
    dist: distribution,
    comp: summary.comparison,
    mismatchPairsCount: mismatchTable.length,
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
