#!/usr/bin/env node
// Runs inside the cody-scraper container. Uses puppeteer-extra + stealth,
// matching the scanner's own browser setup, navigates to a Jane store's
// public homepage, lets JS run + any age gate dismiss, then dumps the full
// rendered HTML to /tmp/jane-selector-refresh.html.

import fs from "node:fs";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteerExtra.use(StealthPlugin());

const URL = process.env.TARGET_URL || "https://www.potshopseattle.co/";
const OUT = process.env.OUT_PATH   || "/tmp/jane-selector-refresh.html";
const WAIT_MS = Number(process.env.WAIT_MS) || 45000;

const browser = await puppeteerExtra.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--ignore-certificate-errors",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");

console.log(`Navigating to ${URL}`);
const resp = await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
console.log(`status=${resp?.status()} final=${resp?.url()}`);

// Give JS + iframes time to hydrate.
await new Promise(r => setTimeout(r, WAIT_MS));

// Attempt an age-gate dismiss similar to the scanner's dismissAgeGate function.
try {
  await page.evaluate(() => {
    const patterns = [/enter/i, /i\s*am/i, /21\+/i, /over\s*21/i, /yes/i, /confirm/i];
    const clickable = Array.from(document.querySelectorAll("button, a, [role=button]"));
    for (const el of clickable) {
      const txt = (el.textContent || "").trim();
      if (txt && patterns.some(re => re.test(txt))) {
        el.click();
        return true;
      }
    }
    return false;
  });
  await new Promise(r => setTimeout(r, 5000));
} catch {}

const html = await page.content();

// Also collect detection-relevant signals from live DOM.
const signals = await page.evaluate(() => {
  const out = {};
  out.iframe_srcs = Array.from(document.querySelectorAll("iframe")).map(i => i.src);
  out.script_srcs = Array.from(document.querySelectorAll("script[src]")).map(s => s.src);
  out.body_classes = Array.from(document.body?.classList ?? []);
  out.data_attrs = {};
  const scan = el => {
    for (const a of el.attributes) {
      if (a.name.startsWith("data-") && /jane|embed|iheart|store|menu/i.test(a.name + "=" + a.value)) {
        out.data_attrs[a.name] = (out.data_attrs[a.name] || []).concat([a.value.slice(0, 120)]);
      }
    }
    for (const c of el.children) scan(c);
  };
  scan(document.body);
  out.jane_globals = {};
  for (const k of Object.keys(window)) {
    if (/jane|iheart/i.test(k)) {
      try { out.jane_globals[k] = String(window[k]).slice(0, 120); } catch {}
    }
  }
  return out;
});

fs.writeFileSync(OUT, html);
console.log(`wrote ${html.length} bytes to ${OUT}`);
console.log(`signals: ${JSON.stringify(signals, null, 2)}`);

await browser.close();
