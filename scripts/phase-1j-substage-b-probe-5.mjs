#!/usr/bin/env node
// Runs inside cody-scraper container. Probes each of the 5 Jane regression
// stores (homepage + common menu subpaths), captures iframe srcs, script srcs,
// any jane-ish globals / data attributes, and dumps HTML for whichever path
// shows the strongest Jane signal.

import fs from "node:fs";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteerExtra.use(StealthPlugin());

const STORES = [
  { name: "seattlehashtag",  url: "https://seattlehashtag.com/" },
  { name: "potshopseattle",  url: "https://www.potshopseattle.co/" },
  { name: "marymart",        url: "https://www.marymart.com/" },
  { name: "potzone420",      url: "https://www.potzone420.com/potzone-port-orchard-location" },
  { name: "firehousenw",     url: "https://www.firehousenw.com/" },
];
const SUBPATHS = ["", "/menu", "/shop", "/order", "/order-online", "/menus"];

const browser = await puppeteerExtra.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"],
});

const summary = [];
for (const store of STORES) {
  const storeResults = { store: store.name, url: store.url, probes: [] };
  const base = new URL(store.url);
  const originRoot = `${base.protocol}//${base.host}/`;

  for (const sub of SUBPATHS) {
    const target = sub === "" ? store.url : originRoot.replace(/\/$/, "") + sub;
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    const probeData = { target };
    try {
      const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 25000 });
      probeData.status = resp?.status() ?? 0;
      probeData.final_url = resp?.url() ?? target;
      // Wait for hydration + async embeds
      await new Promise(r => setTimeout(r, 12000));
      // Light age gate dismiss
      try {
        await page.evaluate(() => {
          const patterns = [/^enter$/i, /i\s*am/i, /21\+/i, /over\s*21/i, /^yes$/i, /confirm/i];
          const clickable = Array.from(document.querySelectorAll("button, a, [role=button]"));
          for (const el of clickable) {
            const txt = (el.textContent || "").trim();
            if (txt && patterns.some(re => re.test(txt))) { el.click(); return true; }
          }
          return false;
        });
        await new Promise(r => setTimeout(r, 4000));
      } catch {}
      const data = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll("iframe")).map(i => ({ src: i.src, id: i.id, dataset: { ...i.dataset } }));
        const scripts = Array.from(document.querySelectorAll("script[src]")).map(s => s.src);
        const allText = document.documentElement.innerHTML;
        const janeMentions = [];
        const patterns = [
          /iheartjane\.com[^"'\s<>]{0,120}/gi,
          /jane\.com[^"'\s<>]{0,120}/gi,
          /data-jane[^=\s>]*=?"?[^"'\s<>]{0,80}/gi,
          /jane-embed[^"'\s<>]{0,80}/gi,
          /jane-widget[^"'\s<>]{0,80}/gi,
          /jane-iframe[^"'\s<>]{0,80}/gi,
          /\bwindow\.Jane[^;]{0,80}/gi,
          /\bwindow\.jane[^;]{0,80}/gi,
        ];
        for (const re of patterns) {
          const matches = allText.match(re);
          if (matches) janeMentions.push(...matches.slice(0, 8));
        }
        const janeGlobals = {};
        for (const k of Object.keys(window)) {
          if (/jane|iheart/i.test(k)) {
            try { janeGlobals[k] = String(window[k]).slice(0, 120); } catch {}
          }
        }
        return { iframes, scripts: scripts.slice(0, 30), jane_mentions: Array.from(new Set(janeMentions)).slice(0, 20), jane_globals: janeGlobals };
      });
      probeData.iframes = data.iframes;
      probeData.script_count = data.scripts.length;
      probeData.jane_script_hits = data.scripts.filter(s => /iheartjane|jane/i.test(s));
      probeData.jane_mentions = data.jane_mentions;
      probeData.jane_globals = data.jane_globals;
      probeData.jane_signal =
        data.iframes.some(i => /iheartjane|jane/i.test(i.src)) ||
        probeData.jane_script_hits.length > 0 ||
        data.jane_mentions.length > 0 ||
        Object.keys(data.jane_globals).length > 0;
      if (probeData.jane_signal) {
        const html = await page.content();
        const safeName = `${store.name}${sub.replace(/[\/]/g, "-") || "-root"}`.replace(/[^a-zA-Z0-9-]/g, "_");
        const outPath = `/tmp/jane-probe-${safeName}.html`;
        fs.writeFileSync(outPath, html);
        probeData.html_saved = outPath;
        probeData.html_bytes = html.length;
      }
    } catch (e) {
      probeData.error = e.message;
    } finally {
      await page.close().catch(() => {});
    }
    storeResults.probes.push(probeData);
    console.log(`[${store.name}${sub || "/"}] status=${probeData.status ?? "?"} iframes=${(probeData.iframes||[]).length} jane_signal=${probeData.jane_signal ? "YES" : "no"} ${probeData.jane_signal ? JSON.stringify(probeData.jane_mentions?.slice(0,3) ?? []) : ""}`);
  }
  summary.push(storeResults);
}

fs.writeFileSync("/tmp/jane-probe-summary.json", JSON.stringify(summary, null, 2));
console.log("\nWrote /tmp/jane-probe-summary.json");
await browser.close();
