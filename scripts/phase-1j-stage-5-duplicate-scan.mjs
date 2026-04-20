#!/usr/bin/env node
// Scan Stage 3 manual_chaz rows for Joint-bizId duplicates and generic URLs.
// Produces flagged list for audit/41-appendix.

import { writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";

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

const v2 = await paged("intel_stores_v2?select=id,lcb_license_id,name,city,address,website,website_association_source,joint_business_id,primary_platform,is_active");

const manual = v2.filter(r => r.website_association_source === "manual_chaz");
console.log(`manual_chaz rows: ${manual.length}`);

// Group by joint_business_id (non-null only)
const bizGroups = new Map();
for (const r of v2) {
  if (!r.joint_business_id || !r.is_active) continue;
  const k = r.joint_business_id;
  if (!bizGroups.has(k)) bizGroups.set(k, []);
  bizGroups.get(k).push(r);
}

// Generic URL detector — matches /locations, /stores (without a specific city/store path),
// /shop (without product context), utm-only query strings, missing path after hostname.
const GENERIC_URL_RE = /\/locations(?:[\/?#]|$)|\/locations\?|\/stores[\/?#]?$|\/shop[\/?#]?$|utm_source=gmb/i;

function isGenericUrl(u) {
  if (!u) return false;
  if (GENERIC_URL_RE.test(u)) return true;
  try {
    const parsed = new URL(u);
    if (parsed.pathname === "/" || parsed.pathname === "") return true;
  } catch {}
  return false;
}

const flagged = [];

// Flag 1: manual_chaz row shares bizId with another row
for (const m of manual) {
  if (!m.joint_business_id) continue;
  const peers = (bizGroups.get(m.joint_business_id) || []).filter(p => p.id !== m.id);
  if (peers.length > 0) {
    flagged.push({
      v2_id: m.id,
      name: m.name,
      lcb_license_id: m.lcb_license_id,
      website: m.website,
      joint_business_id: m.joint_business_id,
      flag_type: "shared_bizid",
      peers: peers.map(p => ({ id: p.id, name: p.name, lcb_license_id: p.lcb_license_id, website: p.website, city: p.city })),
      suggested_action: peers.some(p => p.website === m.website) ? "revert or deactivate (same URL as peer)" : "manual review — confirm shared catalog is intentional",
    });
  }
}

// Flag 2: manual_chaz row with joint_business_id AND generic URL
for (const m of manual) {
  if (!m.joint_business_id) continue;
  if (!isGenericUrl(m.website)) continue;
  if (flagged.find(f => f.v2_id === m.id)) continue;  // dedupe
  flagged.push({
    v2_id: m.id,
    name: m.name,
    lcb_license_id: m.lcb_license_id,
    website: m.website,
    joint_business_id: m.joint_business_id,
    flag_type: "generic_url_with_bizid",
    peers: [],
    suggested_action: "manual review — generic URL (chain /locations or /shop); may have picked up a peer's Joint widget",
  });
}

// Flag 3: manual_chaz row with ANY primary_platform and a generic URL (not just joint)
for (const m of manual) {
  if (!m.primary_platform || m.primary_platform === "none") continue;
  if (!isGenericUrl(m.website)) continue;
  if (flagged.find(f => f.v2_id === m.id)) continue;
  flagged.push({
    v2_id: m.id,
    name: m.name,
    lcb_license_id: m.lcb_license_id,
    website: m.website,
    joint_business_id: m.joint_business_id,
    primary_platform: m.primary_platform,
    flag_type: "generic_url_with_platform",
    peers: [],
    suggested_action: "manual review — generic URL may surface a peer store's embed",
  });
}

console.log(`\nFlagged rows: ${flagged.length}`);
for (const f of flagged) {
  console.log(`  [${f.flag_type}] ${f.name} (lic ${f.lcb_license_id}) bizid=${f.joint_business_id || "(none)"} → ${f.website}`);
  for (const p of f.peers) console.log(`    peer: ${p.name} (lic ${p.lcb_license_id}) → ${p.website}`);
}

writeFileSync("audit/logs/phase-1j-stage-5-duplicate-flags.json", JSON.stringify({
  scanned: manual.length,
  flagged: flagged.length,
  rows: flagged,
}, null, 2));
console.log("\nWrote audit/logs/phase-1j-stage-5-duplicate-flags.json");
