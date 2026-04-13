// Geocode intel_stores via the free US Census Geocoder.
// Reads scripts/_candidates.txt (dumped via CLI) and writes
// scripts/geocode-updates.sql with a single batched UPDATE statement.
//
//   npx supabase db query --linked "SELECT json_agg(row_to_json(s)) AS j FROM (SELECT id, name, address, city, state, zip FROM intel_stores WHERE latitude IS NULL AND address IS NOT NULL AND address <> '' ORDER BY name) s;" > scripts/_candidates.txt
//   node scripts/geocode-stores.mjs
//   cat scripts/geocode-updates.sql | npx supabase db query --linked

import fs from "node:fs";

const CENSUS      = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const BENCHMARK   = "Public_AR_Current";
const CONCURRENCY = 15;

function log(msg) { process.stderr.write(msg + "\n"); }

function loadCandidates() {
  const raw = fs.readFileSync("scripts/_candidates.txt", "utf8");
  // CLI wraps results in boundary JSON; extract the "j" field.
  const m = raw.match(/"j"\s*:\s*(\[[\s\S]*?\])\s*\n\s*\}/);
  if (!m) throw new Error("Could not parse candidates dump — regenerate _candidates.txt");
  return JSON.parse(m[1]);
}

async function geocodeOne(store) {
  const parts = [store.address, store.city, store.state, store.zip].filter(Boolean);
  const addr  = parts.join(", ");
  if (!addr) return null;

  const url = `${CENSUS}?address=${encodeURIComponent(addr)}&benchmark=${BENCHMARK}&format=json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const data = await r.json();
    const hit  = data?.result?.addressMatches?.[0];
    if (!hit?.coordinates) return null;
    const { x, y } = hit.coordinates;
    if (typeof x !== "number" || typeof y !== "number") return null;
    return { id: store.id, lat: y, lng: x };
  } catch {
    return null;
  }
}

async function runBatch(stores) {
  const results = [];
  let done = 0, hit = 0, miss = 0;
  let idx = 0;

  async function worker() {
    while (idx < stores.length) {
      const i = idx++;
      const r = await geocodeOne(stores[i]);
      if (r) { results.push(r); hit++; } else { miss++; }
      done++;
      if (done % 25 === 0) log(`  ${done}/${stores.length} — ${hit} hit, ${miss} miss`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  log(`Done. ${hit} geocoded, ${miss} unmatched of ${stores.length}.`);
  return results;
}

function emitSQL(results, path) {
  if (!results.length) { log("No updates to emit."); return; }
  const values = results
    .map((r) => `  ('${r.id}'::uuid, ${r.lat.toFixed(6)}::numeric, ${r.lng.toFixed(6)}::numeric)`)
    .join(",\n");
  const sql =
`-- Batch geocode update: ${results.length} stores
BEGIN;

UPDATE intel_stores s
SET    latitude  = c.lat,
       longitude = c.lng
FROM (VALUES
${values}
) AS c(id, lat, lng)
WHERE s.id = c.id;

COMMIT;

SELECT COUNT(*) AS geocoded FROM intel_stores WHERE latitude IS NOT NULL;
`;
  fs.writeFileSync(path, sql);
  log(`Wrote ${path} (${results.length} updates)`);
}

const stores = loadCandidates();
log(`${stores.length} stores need coordinates.`);
const results = await runBatch(stores);
emitSQL(results, "scripts/geocode-updates.sql");
