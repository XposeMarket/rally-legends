// Headless smoke test + screenshots. node tools/shot.mjs <url-path> <out.png> [w] [h] [waitMs] [keys...]
// keys: "down:ArrowUp", "wait:2000", "up:ArrowUp", "press:KeyC", "click:#selector", "eval:js"
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const [, , urlPath = '/', out = 'shots/test.png', w = '1280', h = '720', waitMs = '4000', ...steps] = process.argv;
const base = process.env.BASE || 'http://localhost:5200';
const exe = fs.readdirSync(path.join(process.env.LOCALAPPDATA, 'ms-playwright')).filter((d) => d.startsWith('chromium-')).map((d) => path.join(process.env.LOCALAPPDATA, 'ms-playwright', d, 'chrome-win64', 'chrome.exe')).find((p) => fs.existsSync(p))
  || fs.readdirSync(path.join(process.env.LOCALAPPDATA, 'ms-playwright')).filter((d) => d.startsWith('chromium-')).map((d) => path.join(process.env.LOCALAPPDATA, 'ms-playwright', d, 'chrome-win', 'chrome.exe')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const mobile = process.env.MOBILE === '1';
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); if (process.env.LOG) console.log('console:', m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const t0 = Date.now();
await page.goto(base + urlPath, { waitUntil: 'load' });
await page.waitForTimeout(+waitMs);
for (const s of steps) {
  const [k, ...rest] = s.split(':'); const v = rest.join(':');
  if (k === 'down') await page.keyboard.down(v);
  else if (k === 'up') await page.keyboard.up(v);
  else if (k === 'press') await page.keyboard.press(v);
  else if (k === 'wait') await page.waitForTimeout(+v);
  else if (k === 'click') await page.click(v, { timeout: 5000 }).catch((e) => errors.push('click fail ' + v));
  else if (k === 'eval') console.log('eval:', JSON.stringify(await page.evaluate(v)).slice(0, 1500));
  else if (k === 'shot') await page.screenshot({ path: v });
}
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
console.log(`shot ${out} in ${Date.now() - t0}ms fps~${fps}`);
console.log(errors.filter((e) => !e.includes('favicon')).slice(0, 15).join('\n') || 'no errors');
await browser.close();
