#!/usr/bin/env node
// Sub-stage A target list:
//   (1) Pass 2 gap: v2 rows where Pass 1 found 'none' or posabit-hint,
//       AND no Pass 2 row exists for Stage 4 run ec3b40a1.
//   (2) Regressed: v2 rows where Phase 1h best-verdict was a real platform,
//       AND Stage 4 best-verdict is 'none' or 'error'.
// Uses stage_5_store_mapping to bridge v2 → v1.

import { writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const STAGE4 = "ec3b40a1-3ae0-48a3-a361-962e0ab82baf";
const PHASE1H = "9d85b941-05e6-4c97-b677-3c5b608f1c7b";

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

// Load all Stage 4 pv rows
const s4Pv = await paged(`platform_verification?select=intel_store_v2_id,pass,primary_platform,signals,scan_error&run_id=eq.${STAGE4}&intel_store_v2_id=not.is.null`);
const s4ByV2 = new Map();
for (const r of s4Pv) {
  if (!s4ByV2.has(r.intel_store_v2_id)) s4ByV2.set(r.intel_store_v2_id, []);
  s4ByV2.get(r.intel_store_v2_id).push(r);
}

function bestRow(rows) {
  const p2 = rows.find(r => r.pass === "pass2_browser");
  if (p2) return p2;
  return rows[0];
}

// Load all v2 active rows with websites
const v2 = await paged("intel_stores_v2?select=id,lcb_license_id,name,city,website,is_active&is_active=eq.true&website=not.is.null&website=neq.");

// Gap: Pass 1 none/posabit_hint AND no Pass 2 row
const gap = [];
for (const s of v2) {
  const rows = s4ByV2.get(s.id);
  if (!rows) continue;
  const p1 = rows.find(r => r.pass === "pass1_http");
  const p2 = rows.find(r => r.pass === "pass2_browser");
  if (!p1) continue;
  const p1Miss = (p1.primary_platform === "none" || !p1.primary_platform) ||
                 (p1.signals && (p1.signals.posabit_hint || p1.signals.posabit_widget));
  if (p1Miss && !p2) {
    gap.push({
      v2_id: s.id,
      name: s.name,
      city: s.city,
      website: s.website,
      reason: p1.primary_platform === "none" ? "pass1_none_no_pass2" : "pass1_posabit_hint_no_pass2",
    });
  }
}

// Regressed: Phase 1h had platform but Stage 4 best is none/error
// Bridge v2 → v1 via stage_5_store_mapping (use confidence high|medium).
const mapping = await paged("stage_5_store_mapping?select=old_intel_store_id,new_intel_store_v2_id,confidence&confidence=in.(high,medium)");
const v1ByV2 = new Map();
for (const m of mapping) {
  if (m.old_intel_store_id && m.new_intel_store_v2_id) {
    v1ByV2.set(m.new_intel_store_v2_id, m.old_intel_store_id);
  }
}

// Load Phase 1h pv rows for v1 ids we care about
const p1hPv = await paged(`platform_verification?select=intel_store_id,pass,primary_platform,scan_error&run_id=eq.${PHASE1H}&intel_store_id=not.is.null`);
const p1hByV1 = new Map();
for (const r of p1hPv) {
  if (!p1hByV1.has(r.intel_store_id)) p1hByV1.set(r.intel_store_id, []);
  p1hByV1.get(r.intel_store_id).push(r);
}

const regressed = [];
for (const s of v2) {
  const rows = s4ByV2.get(s.id);
  if (!rows) continue;
  const s4Best = bestRow(rows);
  const s4Verdict = s4Best.scan_error ? "error" : (s4Best.primary_platform || "none");
  if (s4Verdict !== "none" && s4Verdict !== "error") continue;

  const v1Id = v1ByV2.get(s.id);
  if (!v1Id) continue;
  const p1hRows = p1hByV1.get(v1Id);
  if (!p1hRows) continue;
  const p1hBest = bestRow(p1hRows);
  const p1hVerdict = p1hBest.scan_error ? "error" : (p1hBest.primary_platform || "none");
  if (["dutchie","jane","leafly","posabit","joint","weedmaps"].includes(p1hVerdict)) {
    regressed.push({
      v2_id: s.id,
      name: s.name,
      city: s.city,
      website: s.website,
      phase1h_verdict: p1hVerdict,
      stage4_verdict: s4Verdict,
      reason: `phase1h=${p1hVerdict}→stage4=${s4Verdict}`,
    });
  }
}

// Dedupe gap vs regressed (gap stores often also qualify as regressed)
const allIds = new Set();
const combined = [];
for (const r of gap) {
  if (!allIds.has(r.v2_id)) { allIds.add(r.v2_id); combined.push({ bucket: "gap", ...r }); }
}
for (const r of regressed) {
  if (!allIds.has(r.v2_id)) { allIds.add(r.v2_id); combined.push({ bucket: "regressed", ...r }); }
  else {
    // Upgrade existing gap row to also carry regressed info
    const existing = combined.find(x => x.v2_id === r.v2_id);
    existing.bucket = "gap+regressed";
    existing.phase1h_verdict = r.phase1h_verdict;
  }
}

console.log(`Gap rows:       ${gap.length}`);
console.log(`Regressed rows: ${regressed.length}`);
console.log(`Combined (dedup): ${combined.length}`);
console.log("\nTarget list:");
for (const c of combined) console.log(`  [${c.bucket}] ${c.name} | ${c.city} | ${c.website} | ${c.reason}`);

writeFileSync("audit/logs/phase-1j-substage-a-targets.json", JSON.stringify({
  stage4_run: STAGE4,
  phase1h_run: PHASE1H,
  gap_count: gap.length,
  regressed_count: regressed.length,
  combined_count: combined.length,
  targets: combined,
}, null, 2));
console.log("\nWrote audit/logs/phase-1j-substage-a-targets.json");
