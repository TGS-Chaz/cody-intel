#!/usr/bin/env node
// Phase 1h — full 419-store platform verification (Pass 1 + Pass 2).
// Not committed; lives here only for this run. See audit/35 for results.

import { randomUUID } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const LOG = process.env.LOG_FILE || "/tmp/phase-1h-run.log";
const RUN_ID = process.env.RUN_ID || randomUUID();

// Pass 1: chunk size 30 — edge function processes sequentially; with ~3-5s per
// fetch × up to 5 variants per store, 30 × ~15s avg = 450s — over the 150s edge
// function timeout. So we go 20 per batch.
const PASS1_CHUNK = 20;
// Pass 2: 1 store per edge function invocation, 4 concurrent. audit/31 noted
// WORKER_RESOURCE_LIMIT hits at chunks of 5 with waitMs=25s, so we go minimal.
const PASS2_STORES_PER_CALL = 1;
const PASS2_CONCURRENCY = 4;
const PASS2_WAIT_MS = 25000;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
}

async function fetchStores() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/intel_stores?select=id,name,website,designated_scraper&status=eq.active&website=not.is.null&website=neq.&order=id`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
  );
  if (!res.ok) throw new Error(`fetch intel_stores: ${res.status}`);
  return res.json();
}

async function invokePass1(storeIds) {
  const started = Date.now();
  const res = await fetch(`${SUPA_URL}/functions/v1/verify-platform-pass1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ runId: RUN_ID, storeIds, timeoutMs: 15000 }),
    signal: AbortSignal.timeout(280_000),
  });
  const dur = Date.now() - started;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pass1 HTTP ${res.status} after ${dur}ms: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return { ...data, dur };
}

async function invokePass2(storeIds) {
  const started = Date.now();
  const res = await fetch(`${SUPA_URL}/functions/v1/verify-platform-pass2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      runId: RUN_ID,
      storeIds,
      chunkSize: Math.min(5, storeIds.length),
      waitMs: PASS2_WAIT_MS,
      extractPosabitCreds: true,
      retryEmpty: true,
    }),
    // Pass 2 per-call budget: 1 store × ~45s browser + ~3s writes = well under 150s.
    signal: AbortSignal.timeout(150_000),
  });
  const dur = Date.now() - started;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pass2 HTTP ${res.status} after ${dur}ms: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return { ...data, dur };
}

async function runPass1(allStores) {
  log(`=== PASS 1 (HTTP) start — ${allStores.length} stores, runId=${RUN_ID} ===`);
  const pass1Started = Date.now();
  const allMisses = [];
  const combinedCounts = { dutchie: 0, jane: 0, leafly: 0, weedmaps: 0, joint: 0, posabit_hint: 0, none: 0, error: 0 };
  const errors = [];

  for (let i = 0; i < allStores.length; i += PASS1_CHUNK) {
    const batch = allStores.slice(i, i + PASS1_CHUNK).map((s) => s.id);
    let attempt = 0;
    let lastErr = null;
    while (attempt < 3) {
      attempt++;
      try {
        const r = await invokePass1(batch);
        for (const k of Object.keys(combinedCounts)) {
          combinedCounts[k] += r.counts?.[k] ?? 0;
        }
        allMisses.push(...(r.missesForPass2 ?? []));
        log(`Pass 1 batch ${Math.floor(i / PASS1_CHUNK) + 1} (${i + 1}-${i + batch.length}): ${r.scanned}/${batch.length} in ${r.dur}ms — counts ${JSON.stringify(r.counts)}`);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        log(`Pass 1 batch ${Math.floor(i / PASS1_CHUNK) + 1} attempt ${attempt} failed: ${e.message}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    if (lastErr) {
      errors.push({ batch: i, ids: batch, error: lastErr.message });
      log(`Pass 1 batch ${Math.floor(i / PASS1_CHUNK) + 1} gave up after 3 attempts`);
    }
    if ((i + PASS1_CHUNK) % 100 === 0 || i + PASS1_CHUNK >= allStores.length) {
      log(`Pass 1 progress: ${Math.min(i + PASS1_CHUNK, allStores.length)}/${allStores.length} — misses=${allMisses.length}, counts=${JSON.stringify(combinedCounts)}`);
    }
  }

  const pass1Dur = Math.round((Date.now() - pass1Started) / 1000);
  log(`=== PASS 1 done in ${pass1Dur}s — total misses for Pass 2: ${allMisses.length}, errors: ${errors.length} ===`);
  return { misses: allMisses, counts: combinedCounts, errors, durSec: pass1Dur };
}

async function runPass2(missIds) {
  log(`=== PASS 2 (browser) start — ${missIds.length} stores ===`);
  const pass2Started = Date.now();
  const counts = { dutchie: 0, jane: 0, leafly: 0, posabit: 0, weedmaps: 0, joint: 0, none: 0, error: 0 };
  const errors = [];
  let completed = 0;

  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= missIds.length) return;
      const storeId = missIds[i];
      let attempt = 0;
      while (attempt < 2) {
        attempt++;
        try {
          const r = await invokePass2([storeId]);
          for (const k of Object.keys(counts)) counts[k] += r.counts?.[k] ?? 0;
          completed++;
          if (completed % 25 === 0 || completed === missIds.length) {
            log(`Pass 2 progress: ${completed}/${missIds.length} — counts=${JSON.stringify(counts)}`);
          }
          break;
        } catch (e) {
          if (attempt >= 2) {
            errors.push({ storeId, error: e.message });
            completed++;
            log(`Pass 2 store ${storeId} gave up: ${e.message}`);
          } else {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }
    }
  }

  const workers = Array.from({ length: PASS2_CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const dur = Math.round((Date.now() - pass2Started) / 1000);
  log(`=== PASS 2 done in ${dur}s — errors: ${errors.length} — counts=${JSON.stringify(counts)} ===`);
  return { counts, errors, durSec: dur };
}

async function main() {
  writeFileSync(LOG, `Phase 1h full verification run — started ${new Date().toISOString()}\nRUN_ID=${RUN_ID}\n\n`);
  log(`RUN_ID=${RUN_ID}`);

  const stores = await fetchStores();
  log(`Loaded ${stores.length} active stores with websites`);

  const p1 = await runPass1(stores);

  // Dedup misses just in case
  const missIds = Array.from(new Set(p1.misses));
  log(`Unique Pass 2 targets: ${missIds.length}`);

  const p2 = await runPass2(missIds);

  log(`=== RUN COMPLETE ===`);
  log(`RUN_ID=${RUN_ID}`);
  log(`Total wall: ${p1.durSec + p2.durSec}s (pass1=${p1.durSec}s, pass2=${p2.durSec}s)`);
  log(`Pass 1 counts: ${JSON.stringify(p1.counts)}`);
  log(`Pass 2 counts: ${JSON.stringify(p2.counts)}`);
  log(`Pass 1 batch errors: ${p1.errors.length}, Pass 2 store errors: ${p2.errors.length}`);
}

main().catch((e) => {
  log(`FATAL: ${e.stack ?? e.message}`);
  process.exit(1);
});
