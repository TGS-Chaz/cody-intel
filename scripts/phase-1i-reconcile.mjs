#!/usr/bin/env node
// Phase 1i — reconcile intel_stores against current LCB active retail list.
// Input: data/lcb-licensees-20260419.csv, audit/logs/intel-stores-full.json.
// Output: audit/logs/phase-1i-reconciliation.json + console summary.

import { readFileSync, writeFileSync } from "node:fs";

function parseCsv(text) {
  // Simple RFC4180 parser tuned for our LCB CSV (no embedded newlines within cells).
  const rows = [];
  let i = 0;
  const n = text.length;
  let row = [];
  let field = "";
  let inQuotes = false;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ""; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    if (c === '\r') { i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows.filter(r => r.length && r.some(x => x.trim() !== ""));
  return data.map(r => Object.fromEntries(header.map((h,k) => [h, r[k] ?? ""])));
}

function normAddr(s) {
  if (!s) return "";
  let a = String(s).toUpperCase().trim();
  a = a.replace(/,\s*WA\s*\d{5}(-\d{4})?,\s*USA$/i, "");
  a = a.replace(/,\s*[A-Z\s]+,\s*WA\s*\d{5}(-\d{4})?,?\s*USA?$/i, "");
  a = a.replace(/,.*$/, "");               // strip anything after first comma (city-state-zip tail)
  a = a.replace(/[.,]/g, " ");
  a = a.replace(/\bSUITE\b|\bSTE\b|\bUNIT\b|\bAPT\b|\bRM\b|\bROOM\b|\bBLDG\b/g, " ");
  a = a.replace(/\s#\s*[A-Z0-9-]+/g, " ");
  a = a.replace(/\bSTREET\b/g, "ST");
  a = a.replace(/\bAVENUE\b/g, "AVE");
  a = a.replace(/\bBOULEVARD\b/g, "BLVD");
  a = a.replace(/\bROAD\b/g, "RD");
  a = a.replace(/\bDRIVE\b/g, "DR");
  a = a.replace(/\bHIGHWAY\b/g, "HWY");
  a = a.replace(/\bPLACE\b/g, "PL");
  a = a.replace(/\bCOURT\b/g, "CT");
  a = a.replace(/\bLANE\b/g, "LN");
  a = a.replace(/\bPARKWAY\b/g, "PKWY");
  a = a.replace(/\bNORTHEAST\b/g, "NE");
  a = a.replace(/\bNORTHWEST\b/g, "NW");
  a = a.replace(/\bSOUTHEAST\b/g, "SE");
  a = a.replace(/\bSOUTHWEST\b/g, "SW");
  a = a.replace(/\bNORTH\b/g, "N");
  a = a.replace(/\bSOUTH\b/g, "S");
  a = a.replace(/\bEAST\b/g, "E");
  a = a.replace(/\bWEST\b/g, "W");
  a = a.replace(/\bWASHINGTON\b/g, "WA");
  // Highway normalization: "US 101"/"U S 101"/"US HWY 101"/"HIGHWAY 101" → "US-101"
  a = a.replace(/\bU\s+S\b/g, "US");
  a = a.replace(/\b(US|WA|SR|STATE\s+ROUTE|STATE\s+HWY|US\s+HWY)\s*-?\s*(\d+)\b/g, "US-$2");  // any route prefix → US-N
  a = a.replace(/\bHWY\s+(\d+)\b/g, "US-$1");
  a = a.replace(/\bHIGHWAY\s+(\d+)\b/g, "US-$1");  // (should already be HWY but safety)
  a = a.replace(/\s+/g, " ").trim();
  return a;
}

function normCity(s) {
  return (s || "").toUpperCase().replace(/[.,]/g, "").trim();
}

function normPhone(s) {
  const d = String(s || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d;
}

function normName(s) {
  return (s || "").toUpperCase().replace(/['"`.,/-]/g, "").replace(/\s+/g, " ").trim();
}

function stripHouseNumber(a) {
  // First token is usually the house number — strip it for looser street-name compare.
  return a.replace(/^\d+\s+/, "");
}

const lcb = parseCsv(readFileSync("data/lcb-licensees-20260419.csv", "utf8"));
const activeLcb = lcb.filter(r => r.status === "ACTIVE (ISSUED)");
const closedLcb = lcb.filter(r => /CLOSED|EXPIRED|FORMER/i.test(r.status));
console.log(`LCB CSV loaded: ${lcb.length} rows, ${activeLcb.length} ACTIVE (ISSUED), ${closedLcb.length} closed/expired/former`);

// Known WA tribal cannabis retailers (sovereign, LCB-exempt)
// Includes Colville, Cowlitz, Tulalip, Sauk-Suiattle, Nooksack, and similar.
const TRIBAL_NAME_PATTERNS = [
  /\bTRIBAL\b/i, /\bTULALIP\b/i, /N[IÍ]KXNA/i, /Q['’]ANAPSU/i,
  /\bNOOKSACK\b/i, /SAUK-SUIATTLE/i, /\bELWHA\b/i,
];
function looksTribal(store) {
  const text = [store.name, store.trade_name, store.business_name, store.city].filter(Boolean).join(" ");
  return TRIBAL_NAME_PATTERNS.some(re => re.test(text));
}

const intel = JSON.parse(readFileSync("audit/logs/intel-stores-full.json", "utf8"));
console.log(`Intel stores loaded: ${intel.length}`);

// Index LCB active by multiple keys
const lcbByPhone = new Map();
const lcbByAddr = new Map();     // normAddr+city → lcb row
const lcbByStreet = new Map();   // stripped-house normAddr+city → [lcb rows]
const lcbByName = new Map();     // normName(trade_name) → [lcb rows]
const lcbByHouseCity = new Map();// house#+city → [lcb rows] (crude fallback)

for (const r of activeLcb) {
  const phone = normPhone(r.phone);
  if (phone) {
    if (!lcbByPhone.has(phone)) lcbByPhone.set(phone, []);
    lcbByPhone.get(phone).push(r);
  }
  const addrKey = normAddr(r.address) + "|" + normCity(r.city);
  if (!lcbByAddr.has(addrKey)) lcbByAddr.set(addrKey, []);
  lcbByAddr.get(addrKey).push(r);
  const streetKey = stripHouseNumber(normAddr(r.address)) + "|" + normCity(r.city);
  if (!lcbByStreet.has(streetKey)) lcbByStreet.set(streetKey, []);
  lcbByStreet.get(streetKey).push(r);
  const nameKey = normName(r.trade_name);
  if (nameKey) {
    if (!lcbByName.has(nameKey)) lcbByName.set(nameKey, []);
    lcbByName.get(nameKey).push(r);
  }
  // house number + city (fallback when street norm differs but house number lines up)
  const houseMatch = normAddr(r.address).match(/^(\d+)/);
  if (houseMatch) {
    const hKey = houseMatch[1] + "|" + normCity(r.city);
    if (!lcbByHouseCity.has(hKey)) lcbByHouseCity.set(hKey, []);
    lcbByHouseCity.get(hKey).push(r);
  }
}

function matchLcb(store) {
  // Returns { match: lcb_row|null, reason: "phone"|"addr"|"street+name"|"name+city"|null, candidates: [] }
  const phone = normPhone(store.phone);
  const addrKey = normAddr(store.address) + "|" + normCity(store.city);
  const streetKey = stripHouseNumber(normAddr(store.address)) + "|" + normCity(store.city);
  const nameKey = normName(store.name);
  const tradeKey = normName(store.trade_name);

  if (phone && lcbByPhone.has(phone) && lcbByPhone.get(phone).length === 1) {
    return { match: lcbByPhone.get(phone)[0], reason: "phone" };
  }
  if (addrKey && addrKey !== "|" && lcbByAddr.has(addrKey)) {
    const hits = lcbByAddr.get(addrKey);
    if (hits.length === 1) return { match: hits[0], reason: "addr" };
    // Multiple — disambiguate by name
    const byName = hits.find(h => normName(h.trade_name) === nameKey || normName(h.trade_name) === tradeKey);
    if (byName) return { match: byName, reason: "addr+name" };
    return { match: hits[0], reason: "addr(ambiguous)" };
  }
  if (streetKey && streetKey !== "|" && lcbByStreet.has(streetKey)) {
    const hits = lcbByStreet.get(streetKey);
    const byName = hits.find(h => normName(h.trade_name) === nameKey || normName(h.trade_name) === tradeKey);
    if (byName) return { match: byName, reason: "street+name" };
  }
  // House number + city — catches highway-format address mismatches (US 101 vs US-101 vs HIGHWAY 101)
  const houseMatch = normAddr(store.address).match(/^(\d+)/);
  if (houseMatch) {
    const hKey = houseMatch[1] + "|" + normCity(store.city);
    if (lcbByHouseCity.has(hKey)) {
      const hits = lcbByHouseCity.get(hKey);
      // Require name similarity — house+city alone too loose
      const byName = hits.find(h => {
        const hn = normName(h.trade_name);
        return hn === nameKey || hn === tradeKey
            || (nameKey && (hn.includes(nameKey) || nameKey.includes(hn)))
            || (tradeKey && (hn.includes(tradeKey) || tradeKey.includes(hn)));
      });
      if (byName) return { match: byName, reason: "house+city+nameish" };
    }
  }
  // Name only — last resort, requires city match
  for (const key of [nameKey, tradeKey]) {
    if (!key) continue;
    if (lcbByName.has(key)) {
      const hits = lcbByName.get(key).filter(h => normCity(h.city) === normCity(store.city));
      if (hits.length === 1) return { match: hits[0], reason: "name+city" };
    }
  }
  // Substring-name + city — catches "HAPPY TREES PROSSER" → "HAPPY TREE" (Prosser)
  if (nameKey || tradeKey) {
    const storeKeys = [nameKey, tradeKey].filter(Boolean);
    const candidates = [];
    for (const [lcbKey, hits] of lcbByName) {
      for (const sk of storeKeys) {
        if (!sk || sk.length < 5) continue;
        const lcbMatchesStore = sk.includes(lcbKey) || lcbKey.includes(sk);
        if (lcbMatchesStore) {
          for (const h of hits) {
            if (normCity(h.city) === normCity(store.city)) candidates.push(h);
          }
        }
      }
    }
    const unique = Array.from(new Set(candidates.map(c => c.license_number))).map(ln => candidates.find(c => c.license_number === ln));
    if (unique.length === 1) return { match: unique[0], reason: "substring-name+city" };
  }
  return { match: null, reason: null };
}

// Also build a closed-LCB name+city index to enrich phantom classification
const closedByNameCity = new Map();
for (const r of closedLcb) {
  const key = normName(r.trade_name) + "|" + normCity(r.city);
  if (!closedByNameCity.has(key)) closedByNameCity.set(key, []);
  closedByNameCity.get(key).push(r);
}
function closedMatchFor(store) {
  const keys = [
    normName(store.name) + "|" + normCity(store.city),
    normName(store.trade_name) + "|" + normCity(store.city),
  ];
  for (const k of keys) {
    if (k === "|") continue;
    if (closedByNameCity.has(k)) return closedByNameCity.get(k)[0];
  }
  // also try substring match
  const storeKey = normName(store.name) || normName(store.trade_name);
  if (storeKey && storeKey.length >= 5) {
    for (const [k, hits] of closedByNameCity) {
      const [lcbName, lcbCity] = k.split("|");
      if (lcbCity !== normCity(store.city)) continue;
      if (storeKey.includes(lcbName) || lcbName.includes(storeKey)) return hits[0];
    }
  }
  return null;
}

// First pass: match every intel store
const matches = []; // {intel, lcb, reason}
for (const s of intel) {
  const m = matchLcb(s);
  matches.push({ intel: s, lcb: m.match, reason: m.reason });
}

// Index LCB active rows that got matched
const matchedLcbLicense = new Set();
for (const m of matches) {
  if (m.lcb) matchedLcbLicense.add(m.lcb.license_number);
}

// Classify intel stores
const catA = [];  // phantom (null lcb_license_id + no LCB match)
const catB = [];  // duplicate alias (matches an LCB row that is ALSO matched by a canonical row with lcb_license_id)
const catC = [];  // lcb_license_id populated but no current LCB match
const catD = [];  // null lcb_license_id but has an LCB match — needs backfill
const legit = []; // has lcb_license_id + matches LCB (no action)

// Find LCB license_numbers that have multiple intel rows matching
const lcbLicenseToIntel = new Map();
for (const m of matches) {
  if (m.lcb) {
    const ln = m.lcb.license_number;
    if (!lcbLicenseToIntel.has(ln)) lcbLicenseToIntel.set(ln, []);
    lcbLicenseToIntel.get(ln).push(m);
  }
}

for (const m of matches) {
  const hasLcbId = !!m.intel.lcb_license_id;
  const hasLcbMatch = !!m.lcb;

  if (hasLcbMatch) {
    // Is this the canonical row or a duplicate?
    const sibs = lcbLicenseToIntel.get(m.lcb.license_number);
    if (sibs.length > 1) {
      // Multiple intel rows match this LCB row.
      // Canonical = the one with lcb_license_id populated (from original import).
      // If more than one has lcb_license_id, pick the oldest created_at.
      const withId = sibs.filter(x => x.intel.lcb_license_id);
      const canonical = withId.length > 0
        ? withId.sort((a,b) => String(a.intel.created_at).localeCompare(String(b.intel.created_at)))[0]
        : sibs.sort((a,b) => String(a.intel.created_at).localeCompare(String(b.intel.created_at)))[0];
      if (m.intel.id === canonical.intel.id) {
        // This is the canonical row
        if (hasLcbId) legit.push({ m, canonicalFor: m.lcb.license_number, sibCount: sibs.length });
        else catD.push({ m, lcbMatch: m.lcb, reason: m.reason });
      } else {
        catB.push({ m, canonical, lcbMatch: m.lcb });
      }
    } else {
      // Only one intel row matches this LCB row — normal case
      if (hasLcbId) legit.push({ m });
      else catD.push({ m, lcbMatch: m.lcb, reason: m.reason });
    }
  } else {
    // No current LCB match
    if (hasLcbId) catC.push({ m });
    else catA.push({ m });
  }
}

// Missing: LCB active rows not matched by any intel store
const missing = [];
for (const r of activeLcb) {
  if (!matchedLcbLicense.has(r.license_number)) missing.push(r);
}

console.log("\n=== Category tallies ===");
console.log(`Legitimate (no action): ${legit.length}`);
console.log(`Category A (phantom):    ${catA.length}`);
console.log(`Category B (duplicate):  ${catB.length}`);
console.log(`Category C (edge-case):  ${catC.length}`);
console.log(`Category D (backfill):   ${catD.length}`);
console.log(`Sum: ${legit.length + catA.length + catB.length + catC.length + catD.length} (expected ${intel.length})`);
console.log(`Missing legit stores:    ${missing.length}`);

// Save output
const out = {
  lcb_csv: "data/lcb-licensees-20260419.csv",
  lcb_active_count: activeLcb.length,
  intel_total: intel.length,
  counts: {
    legit: legit.length,
    catA: catA.length,
    catB: catB.length,
    catC: catC.length,
    catD: catD.length,
    missing: missing.length,
  },
  catA: catA.map(x => {
    const closed = closedMatchFor(x.m.intel);
    return {
      id: x.m.intel.id,
      name: x.m.intel.name,
      address: x.m.intel.address,
      city: x.m.intel.city,
      website: x.m.intel.website,
      has_online_menu: x.m.intel.has_online_menu,
      total_products: x.m.intel.total_products,
      created_at: x.m.intel.created_at,
      tribal: looksTribal(x.m.intel),
      closed_lcb_license: closed ? closed.license_number : null,
      closed_lcb_trade_name: closed ? closed.trade_name : null,
      closed_lcb_status: closed ? closed.status : null,
    };
  }),
  catB: catB.map(x => ({
    id: x.m.intel.id,
    name: x.m.intel.name,
    address: x.m.intel.address,
    city: x.m.intel.city,
    website: x.m.intel.website,
    created_at: x.m.intel.created_at,
    total_products: x.m.intel.total_products,
    canonical_id: x.canonical.intel.id,
    canonical_name: x.canonical.intel.name,
    canonical_address: x.canonical.intel.address,
    canonical_has_lcb: !!x.canonical.intel.lcb_license_id,
    lcb_license_number: x.lcbMatch.license_number,
  })),
  catC: catC.map(x => ({
    id: x.m.intel.id,
    name: x.m.intel.name,
    address: x.m.intel.address,
    city: x.m.intel.city,
    website: x.m.intel.website,
    lcb_license_id: x.m.intel.lcb_license_id,
    created_at: x.m.intel.created_at,
    total_products: x.m.intel.total_products,
  })),
  catD: catD.map(x => ({
    id: x.m.intel.id,
    name: x.m.intel.name,
    address: x.m.intel.address,
    city: x.m.intel.city,
    website: x.m.intel.website,
    created_at: x.m.intel.created_at,
    lcb_license_number: x.lcbMatch.license_number,
    match_reason: x.reason,
  })),
  missing: missing.map(r => ({
    license_number: r.license_number,
    trade_name: r.trade_name,
    address: r.address,
    city: r.city,
    zip: r.zip,
    phone: r.phone,
    ubi: r.ubi,
    is_se: !!r.is_se,
  })),
};
writeFileSync("audit/logs/phase-1i-reconciliation.json", JSON.stringify(out, null, 2));
console.log(`\nWrote audit/logs/phase-1i-reconciliation.json`);
