#!/usr/bin/env node
// Patch /opt/cody-scraper/server.js on the VPS to refresh Jane detectors.

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const SRC = "/opt/cody-scraper/server.js";
const BACKUP = `${SRC}.bak-pre-jane-refresh-${Math.floor(Date.now()/1000)}`;

copyFileSync(SRC, BACKUP);
console.log(`Backed up to ${BACKUP}`);

let t = readFileSync(SRC, "utf8");
let replacements = 0;

// 1) EMBED_PATTERNS jane entry
const embedPatternOld = `{ platform: "jane",     re: /iheartjane\\.com/i },`;
const embedPatternNew = `{ platform: "jane",     re: /iheartjane\\.com|tags\\.cnna\\.io\\/jane/i },`;
if (t.includes(embedPatternOld)) {
  t = t.replace(embedPatternOld, embedPatternNew);
  replacements++;
  console.log("EMBED_PATTERNS jane: updated");
} else {
  console.log("EMBED_PATTERNS jane: NOT FOUND (may already be patched)");
}

// 2) PLATFORM_SIGNATURES jane.embed
const sigEmbedOld = `embed:  /iheartjane\\.com/i,`;
const sigEmbedNew = `embed:  /iheartjane\\.com|tags\\.cnna\\.io\\/jane\\.[a-f0-9]+\\.js|tags\\.cnna\\.io\\/[^"'\\s]*environment=jane/i,`;
if (t.includes(sigEmbedOld)) {
  t = t.replace(sigEmbedOld, sigEmbedNew);
  replacements++;
  console.log("PLATFORM_SIGNATURES jane.embed: updated");
}

// 3) PLATFORM_SIGNATURES jane.widget
const sigWidgetOld = `widget: /(?:jane-app-settings|window\\.iHeartJane|iHeartJaneConfig)/i,`;
const sigWidgetNew = `widget: /(?:jane-app-settings|window\\.iHeartJane|iHeartJaneConfig|mj-snowplow-static-js\\.s3|tags\\.cnna\\.io\\/jane)/i,`;
if (t.includes(sigWidgetOld)) {
  t = t.replace(sigWidgetOld, sigWidgetNew);
  replacements++;
  console.log("PLATFORM_SIGNATURES jane.widget: updated");
}

if (replacements === 0) {
  console.error("No replacements made — file already patched or structure changed. Aborting.");
  process.exit(1);
}

writeFileSync(SRC, t);
console.log(`Wrote ${replacements} replacements to ${SRC}`);

// Show the updated lines for verification
const updated = readFileSync(SRC, "utf8");
const lines = updated.split("\n");
lines.forEach((line, i) => {
  if (/cnna|mj-snowplow-static-js/.test(line)) {
    console.log(`L${i+1}: ${line.trim()}`);
  }
});
