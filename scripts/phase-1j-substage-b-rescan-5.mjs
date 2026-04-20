#!/usr/bin/env node
// Rescan the 5 Jane-regression stores with the refreshed detector.
// Writes into Stage 4 run_id ec3b40a1… so results integrate cleanly.

import { appendFileSync, writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const RUN_ID = "ec3b40a1-3ae0-48a3-a361-962e0ab82baf";
const LOG = "audit/logs/phase-1j-substage-b-rescan.log";

// 5 stores from Sub-stage A regression list
const STORE_IDS = [
  { id: "85f0b5be-4c58-48d5-a729-97b1aab9fbaa", name: "POT SHOP (Seattle)" },
  { id: "bf0a7b54-0c51-46b9-9403-e2b1992b2212", name: "MARY MART INC (Tacoma)" },
];

async function loadNamedRows() {
  // Look up the other 3 by name
  const names = ["HASHTAG CANNABIS", "POT ZONE", "THE FIRE HOUSE"];
  const ret = [...STORE_IDS];
  for (const n of names) {
    const r = await fetch(`${SUPA_URL}/rest/v1/intel_stores_v2?select=id,name,website,city&name=eq.${encodeURIComponent(n)}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    const rows = await r.json();
    for (const row of rows) {
      // Filter to the specific regressed store from Sub-stage A target list
      if ((n === "HASHTAG CANNABIS" && row.website?.includes("seattlehashtag")) ||
          (n === "POT ZONE" && row.website?.includes("potzone420")) ||
          (n === "THE FIRE HOUSE" && row.website?.includes("firehousenw"))) {
        ret.push({ id: row.id, name: `${row.name} (${row.city})` });
      }
    }
  }
  return ret;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG, line + "\n"); } catch {}
}

async function invokePass2(storeId) {
  const t0 = Date.now();
  const res = await fetch(`${SUPA_URL}/functions/v1/verify-platform-pass2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      runId: RUN_ID,
      storeIds: [storeId],
      target: "v2",
      chunkSize: 1,
      waitMs: 45000,
      extractPosabitCreds: true,
      retryEmpty: false,
    }),
    signal: AbortSignal.timeout(140_000),
  });
  const dur = Date.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status} after ${dur}ms: ${(await res.text()).slice(0,200)}`);
  return { ...(await res.json()), dur };
}

const stores = await loadNamedRows();
writeFileSync(LOG, `Sub-stage B rescan ${new Date().toISOString()}\nRUN_ID=${RUN_ID}\nstores=${stores.length}\n\n`);
log(`Targets: ${stores.map(s => s.name).join(", ")}`);

const results = [];
for (const s of stores) {
  try {
    const r = await invokePass2(s.id);
    const detected = Object.entries(r.counts || {}).find(([k, v]) => v > 0 && !["none","error"].includes(k))?.[0] ?? (r.counts?.error ? "error" : "none");
    results.push({ id: s.id, name: s.name, verdict: detected, counts: r.counts, dur: r.dur });
    log(`${s.name} → ${detected} in ${r.dur}ms | ${JSON.stringify(r.counts)}`);
  } catch (e) {
    results.push({ id: s.id, name: s.name, verdict: "error", error: e.message });
    log(`${s.name} → ERROR ${e.message}`);
  }
}

const recovered = results.filter(r => !["none","error"].includes(r.verdict));
log(`\nRecovered: ${recovered.length}/${results.length}`);
for (const r of recovered) log(`  ${r.name}: ${r.verdict}`);
const stillFailing = results.filter(r => ["none","error"].includes(r.verdict));
for (const r of stillFailing) log(`  still ${r.verdict}: ${r.name}`);

writeFileSync("audit/logs/phase-1j-substage-b-results.json", JSON.stringify({ run_id: RUN_ID, stores: results }, null, 2));
log("Wrote audit/logs/phase-1j-substage-b-results.json");
