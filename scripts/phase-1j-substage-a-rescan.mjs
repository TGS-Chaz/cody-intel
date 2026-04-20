#!/usr/bin/env node
// Sub-stage A — rescan gap + regressed stores from audit/logs/phase-1j-substage-a-targets.json.
// Writes Pass 2 rows under the same Stage 4 run_id so analysis logic stays single-source.
// Longer waitMs (60s) for stubborn widgets / age gates. retryEmpty disabled to stay under
// the 150s edge function IDLE_TIMEOUT budget.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const SUPA_URL = "https://dpglliwbgsdsofkjgaxj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ2xsaXdiZ3Nkc29ma2pnYXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMzNjQsImV4cCI6MjA5MDcyOTM2NH0.0U6HMg24qzwTJ34BMgrqxG0Bz7iug5D7Qc0bxYyTqO8";
const LOG = process.env.LOG_FILE || "/tmp/phase-1j-substage-a-rescan.log";
const RUN_ID = "ec3b40a1-3ae0-48a3-a361-962e0ab82baf";  // same as Stage 4
const CONCURRENCY = 3;                                  // softer than Stage 4's 4
const WAIT_MS = 60000;                                  // 60s per Chaz direction
const CLIENT_TIMEOUT = 140_000;                         // under edge IDLE_TIMEOUT (150s)

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG, line + "\n"); } catch {}
}

async function invokePass2(storeIds) {
  const t0 = Date.now();
  const res = await fetch(`${SUPA_URL}/functions/v1/verify-platform-pass2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      runId: RUN_ID,
      storeIds,
      target: "v2",
      chunkSize: Math.min(5, storeIds.length),
      waitMs: WAIT_MS,
      extractPosabitCreds: true,
      retryEmpty: false,
    }),
    signal: AbortSignal.timeout(CLIENT_TIMEOUT),
  });
  const dur = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pass2 HTTP ${res.status} after ${dur}ms: ${text.slice(0, 200)}`);
  }
  return { ...(await res.json()), dur };
}

async function main() {
  const t = JSON.parse(readFileSync("/tmp/phase-1j-substage-a-targets.json", "utf8"));
  const ids = t.targets.map(r => r.v2_id);
  writeFileSync(LOG, `Sub-stage A rescan — ${new Date().toISOString()}\nRUN_ID=${RUN_ID}\nTargets: ${ids.length}\n\n`);
  log(`Targets: ${ids.length} (${t.gap_count} gap + ${t.regressed_count} regressed, dedup to ${t.combined_count})`);

  const counts = { dutchie: 0, jane: 0, leafly: 0, posabit: 0, weedmaps: 0, joint: 0, none: 0, error: 0 };
  const errors = [];
  let completed = 0;
  let idx = 0;

  async function worker(wid) {
    while (true) {
      const i = idx++;
      if (i >= ids.length) return;
      const sid = ids[i];
      let attempt = 0;
      while (attempt < 2) {
        attempt++;
        try {
          const r = await invokePass2([sid]);
          for (const k of Object.keys(counts)) counts[k] += r.counts?.[k] ?? 0;
          completed++;
          log(`[w${wid}] ${completed}/${ids.length} ${sid} in ${r.dur}ms — ${JSON.stringify(r.counts)}`);
          break;
        } catch (e) {
          if (attempt >= 2) {
            errors.push({ sid, error: e.message });
            completed++;
            log(`[w${wid}] ${sid} gave up: ${e.message}`);
          } else {
            await new Promise(r => setTimeout(r, 3000));
          }
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
