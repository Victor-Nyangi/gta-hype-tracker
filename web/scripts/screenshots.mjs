// Screenshots of a running page at desktop and phone widths, plus a horizontal-scroll check.
//
//   node scripts/screenshots.mjs <url> <outDir> <prefix> [--header]
//
// Writes <prefix>-hero-<w>.png (top of the page) and, with --header, <prefix>-header-<w>.png
// (scrolled so the sticky header sits over the hero). With --nojs, the page is loaded with
// JavaScript disabled instead (<prefix>-nojs-<w>.png), to check content is still visible. Uses Playwright's Chromium if it is
// installed, else the system Chrome.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const [url, outDir, prefix, ...flags] = process.argv.slice(2);
if (!url || !outDir || !prefix) {
  console.error("usage: screenshots.mjs <url> <outDir> <prefix> [--header]");
  process.exit(2);
}
const withHeader = flags.includes("--header");
const noJs = flags.includes("--nojs");
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
}

await mkdir(outDir, { recursive: true });
const browser = await launch();
let failed = false;
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, javaScriptEnabled: !noJs });
  await page.goto(url, { waitUntil: "networkidle" });
  if (!noJs) await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2600); // entrance animations (1200ms + stagger) and the clock tick
  const hero = path.join(outDir, `${prefix}-${noJs ? "nojs" : "hero"}-${vp.width}.png`);
  await page.screenshot({ path: hero });
  if (noJs) {
    console.log(hero);
    await page.close();
    continue;
  }
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const hscroll = overflow.scrollWidth > overflow.clientWidth;
  if (hscroll) failed = true;
  console.log(`${hero}  scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}${hscroll ? "  HORIZONTAL SCROLL" : ""}`);
  if (withHeader) {
    await page.evaluate(() => window.scrollTo({ top: Math.round(window.innerHeight * 0.45), behavior: "instant" }));
    await page.waitForTimeout(600);
    const header = path.join(outDir, `${prefix}-header-${vp.width}.png`);
    await page.screenshot({ path: header });
    const info = await page.evaluate(() => {
      const h = document.querySelector("header");
      const active = document.querySelector('[aria-current="true"]');
      return { headerTop: h?.getBoundingClientRect().top, activeTab: active?.textContent ?? null, y: window.scrollY };
    });
    console.log(`${header}  ${JSON.stringify(info)}`);
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
