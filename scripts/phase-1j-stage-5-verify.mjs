#!/usr/bin/env node
// Stage 5 verification + audit data gather.

import { writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";

async function paged(path) {
  const out = [];
  let offset = 0;
  const page = 1000;
  while (true) {
    const url = `${SUPA_URL}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${page}&offset=${offset}`;
    const r = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < page) break;
    offset += page;
  }
  return out;
}

const mapping = await paged("stage_5_store_mapping?select=old_intel_store_id,new_intel_store_v2_id,match_method,confidence");
const v2 = await paged("intel_stores_v2?select=id,lcb_license_id,ubi,source_of_truth,name,city,address,website,website_verified,designated_scraper,primary_platform,platform_detection_confidence,platform_detected_at,joint_business_id,dutchie_slug,jane_store_id,leafly_slug,posabit_merchant_slug:posabit_merchant,posabit_venue,posabit_merchant_token,weedmaps_slug,menu_last_updated,total_products,has_online_menu,dutchie_last_scraped_at,jane_last_scraped_at,leafly_last_scraped_at,posabit_last_scraped_at,joint_last_scraped_at,weedmaps_last_scraped_at");
const ambiguous = await paged("stage_5_address_ambiguous_audit?select=v2_id,v2_name,candidate_count,v1_names");

console.log("=== Q1 mapping breakdown ===");
const byMethodConf = {};
for (const m of mapping) {
  const k = m.match_method + " / " + m.confidence;
  byMethodConf[k] = (byMethodConf[k] || 0) + 1;
}
for (const [k, v] of Object.entries(byMethodConf).sort()) console.log(`  ${k}: ${v}`);

console.log(`\n=== Q2 v2 designated_scraper NOT NULL: ${v2.filter(r => r.designated_scraper).length} ===`);

console.log("\n=== Q3 v2 primary_platform distribution ===");
const platDist = {};
for (const r of v2) {
  if (!r.primary_platform) continue;
  platDist[r.primary_platform] = (platDist[r.primary_platform] || 0) + 1;
}
for (const [k, v] of Object.entries(platDist).sort((a,b) => b[1]-a[1])) console.log(`  ${k}: ${v}`);

console.log("\n=== Q4 joint_business_id on v2 joint stores ===");
const joint = v2.filter(r => r.primary_platform === "joint").sort((a,b) => (a.joint_business_id||"").localeCompare(b.joint_business_id||""));
for (const r of joint) console.log(`  bizid=${r.joint_business_id || "(null)"} | ${r.name} | ${r.city}`);
const hasBizId = joint.filter(r => r.joint_business_id).length;
console.log(`  → ${hasBizId}/${joint.length} joint rows have bizid`);
const new6114 = joint.filter(r => r.joint_business_id === "6114");
console.log(`  → bizId 6114 rows: ${new6114.length} (${new6114.map(r => r.name).join(", ")})`);

console.log("\n=== Q5 POSaBit fields carried forward ===");
const posabit = v2.filter(r => r.primary_platform === "posabit");
const withMerchant = posabit.filter(r => r.posabit_merchant_slug || r.posabit_venue);
console.log(`  ${posabit.length} posabit-detected stores`);
console.log(`  ${withMerchant.length} have posabit_merchant or posabit_venue populated`);
const withToken = posabit.filter(r => r.posabit_merchant_token);
console.log(`  ${withToken.length} have posabit_merchant_token populated`);

// Carry-forward stats per platform
console.log("\n=== Q6 carry-forward by platform ===");
function countField(rows, field) { return rows.filter(r => r[field]).length; }
for (const p of ["dutchie","jane","leafly","posabit","joint","weedmaps"]) {
  const rows = v2.filter(r => r.primary_platform === p);
  const slugFields = {
    dutchie: "dutchie_slug", jane: "jane_store_id", leafly: "leafly_slug",
    posabit: "posabit_merchant_slug", joint: "joint_business_id", weedmaps: "weedmaps_slug",
  };
  const lastScraped = p + "_last_scraped_at";
  console.log(`  ${p}: ${rows.length} total | ${countField(rows, slugFields[p])} with slug/id | ${countField(rows, lastScraped)} with last_scraped_at`);
}

console.log("\n=== Q7 menu metadata carry-forward ===");
const mapped = new Set(mapping.filter(m => m.confidence === "high" || m.confidence === "medium").map(m => m.new_intel_store_v2_id));
const v2Mapped = v2.filter(r => mapped.has(r.id));
const withMenuTS = v2Mapped.filter(r => r.menu_last_updated);
const withProducts = v2Mapped.filter(r => r.total_products > 0);
console.log(`  v2 rows with high/medium mapping: ${v2Mapped.length}`);
console.log(`  with menu_last_updated: ${withMenuTS.length}`);
console.log(`  with total_products > 0: ${withProducts.length}`);

console.log("\n=== Q8 ambiguous address matches ===");
console.log(`  count: ${ambiguous.length}`);
for (const a of ambiguous.slice(0, 20)) console.log(`  ${a.v2_name}: ${a.candidate_count} candidates → ${(a.v1_names||[]).join(", ")}`);

console.log("\n=== Q9 unmatched_new_v2 breakdown ===");
const newV2 = mapping.filter(m => m.match_method === "unmatched_new_v2");
const newV2Rows = v2.filter(r => newV2.some(m => m.new_intel_store_v2_id === r.id));
const newV2BySource = {};
for (const r of newV2Rows) {
  newV2BySource[r.source_of_truth] = (newV2BySource[r.source_of_truth] || 0) + 1;
}
for (const [k, v] of Object.entries(newV2BySource)) console.log(`  source_of_truth=${k}: ${v}`);
console.log("  All new_v2 rows:");
for (const r of newV2Rows) console.log(`    ${r.source_of_truth} | lic=${r.lcb_license_id || "(null)"} | ${r.name} | ${r.city}`);

writeFileSync("audit/logs/phase-1j-stage-5-verify.json", JSON.stringify({
  mapping_counts: byMethodConf,
  v2_designated: v2.filter(r => r.designated_scraper).length,
  platform_distribution: platDist,
  joint_rows: joint.map(r => ({ bizid: r.joint_business_id, name: r.name, city: r.city, lic: r.lcb_license_id })),
  ambiguous_matches: ambiguous,
  new_v2_rows: newV2Rows.map(r => ({ source_of_truth: r.source_of_truth, lic: r.lcb_license_id, name: r.name, city: r.city })),
  posabit_stats: { total: posabit.length, with_merchant: withMerchant.length, with_token: withToken.length },
  menu_meta: { high_med_mapped: v2Mapped.length, with_menu_ts: withMenuTS.length, with_products: withProducts.length },
}, null, 2));
console.log("\nWrote audit/logs/phase-1j-stage-5-verify.json");
