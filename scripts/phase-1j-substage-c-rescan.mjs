#!/usr/bin/env node
// Sub-stage C — rescan all Stage-4 'none' stores with the refreshed
// Jane detector. Same Stage 4 run_id so upserts overwrite prior Pass 2 rows.
// waitMs=40000 is the middle ground between Stage 4's 25s and Sub-stage A's 60s.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const LOG = process.env.LOG_FILE || "/tmp/phase-1j-substage-c.log";
const RUN_ID = "ec3b40a1-3ae0-48a3-a361-962e0ab82baf";
const CONCURRENCY = 3;
const WAIT_MS = 40000;
const CLIENT_TIMEOUT = 140_000;

function log(m) {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  try { appendFileSync(LOG, line + "\n"); } catch {}
}

async function invokePass2(id) {
  const t0 = Date.now();
  const res = await fetch(`${SUPA_URL}/functions/v1/verify-platform-pass2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      runId: RUN_ID, storeIds: [id], target: "v2",
      chunkSize: 1, waitMs: WAIT_MS,
      extractPosabitCreds: true, retryEmpty: false,
    }),
    signal: AbortSignal.timeout(CLIENT_TIMEOUT),
  });
  const dur = Date.now() - t0;
  if (!res.ok) throw new Error(`pass2 HTTP ${res.status} after ${dur}ms: ${(await res.text()).slice(0, 200)}`);
  return { ...(await res.json()), dur };
}

async function main() {
  const t = JSON.parse(readFileSync("/tmp/phase-1j-substage-c-targets.json", "utf8"));
  const ids = t.targets.map(r => r.id);
  writeFileSync(LOG, `Sub-stage C rescan — ${new Date().toISOString()}\nRUN_ID=${RUN_ID}\ntargets=${ids.length}\n\n`);
  log(`Targets: ${ids.length}`);

  const counts = { dutchie: 0, jane: 0, leafly: 0, posabit: 0, weedmaps: 0, joint: 0, none: 0, error: 0 };
  const errors = [];
  let completed = 0;
  let idx = 0;

  async function worker(wid) {
    while (true) {
      const i = idx++;
      if (i >= ids.length) return;
      const id = ids[i];
      let attempt = 0;
      while (attempt < 2) {
        attempt++;
        try {
          const r = await invokePass2(id);
          for (const k of Object.keys(counts)) counts[k] += r.counts?.[k] ?? 0;
          completed++;
          const verdict = Object.entries(r.counts || {}).find(([k, v]) => v > 0 && !["none","error"].includes(k))?.[0] ?? (r.counts?.error ? "error" : "none");
          log(`[w${wid}] ${completed}/${ids.length} ${id} → ${verdict} in ${r.dur}ms`);
          break;
        } catch (e) {
          if (attempt >= 2) {
            errors.push({ id, error: e.message });
            completed++;
            log(`[w${wid}] ${id} gave up: ${e.message}`);
          } else await new Promise(r => setTimeout(r, 3000));
        }
      }
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  const dur = Math.round((Date.now() - started) / 1000);
  log(`DONE in ${dur}s — errors=${errors.length} — counts=${JSON.stringify(counts)}`);
}

main().catch(e => { log(`FATAL: ${e.stack ?? e.message}`); process.exit(1); });
