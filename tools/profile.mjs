// Frame-time + smoothness profiler. node tools/profile.mjs <stage> [cpuThrottle] [mobile=0|1]
// Drives with the ?bot autopilot, records per-frame dt, car model pose, camera pose, quality changes.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const [, , stage = 'ouninpohja', throttle = '4', mob = '1'] = process.argv;
const base = process.env.BASE || 'http://localhost:5200';
const root = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const exe = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).flatMap((d) => ['chrome-win64', 'chrome-win'].map((s) => path.join(root, d, s, 'chrome.exe'))).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const mobile = mob === '1';
const ctx = await browser.newContext({ viewport: mobile ? { width: 844, height: 390 } : { width: +(process.env.W || 1280), height: +(process.env.H || 720) }, deviceScaleFactor: mobile ? 2 : +(process.env.DPR || 1), hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${base}/?bot=1&stage=${stage}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.RL && RL.G.mode === 'countdown', null, { timeout: 60000 });
console.log('gpu', await page.evaluate(() => { const gl = RL.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?') + ' buffer ' + gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight + ' shadows ' + RL.renderer.shadowMap.enabled; }));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
const res = await page.evaluate(() => new Promise((resolve) => {
  const G = RL.G, rows = [], marks = [];
  // wrap hot functions to attribute time per frame
  const prof = window.__prof = {};
  const wrap = (obj, name, label) => { const f = obj[name]; if (!f) return; obj[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); prof[label] = (prof[label] || 0) + performance.now() - t; return r; }; };
  wrap(G.car, 'update', 'phys'); wrap(G.fx, 'update', 'fxUpd'); wrap(G.fx, 'emitWheel', 'fxEmit'); wrap(G.fx, 'skid', 'fxSkid');
  wrap(G.world, 'update', 'world'); wrap(RL.audio, 'update', 'audio'); wrap(RL.audio, 'codriver', 'codriver'); wrap(RL.input, 'poll', 'input'); wrap(RL.renderer, 'render', 'render'); if (window.speechSynthesis) wrap(speechSynthesis, 'speak', 'speak');
  const frameProf = [];
  let lastQ = G.autoQuality, last = performance.now();
  const lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: false }); } catch (_) {}
  const t0 = performance.now();
  function f(now) {
    if (!(prof.render > 0)) { if (now - t0 < 14000) requestAnimationFrame(f); else resolve({ rows, marks, lt }); return; } // only frames the game actually rendered
    const dt = now - last; last = now;
    const m = G.model.group.position; const cam = RL.camera; const sp = m.clone().project(cam); const cy = cam.position.y, cgy = RL.G.car.pos.y;
    rows.push([Math.round(now - t0), +dt.toFixed(2), G.mode, +m.x.toFixed(4), +m.y.toFixed(4), +m.z.toFixed(4), +G.car.speed.toFixed(2), +(G.physAlpha || 0).toFixed(3), JSON.stringify(Object.fromEntries(Object.entries(prof).map(([k, v]) => [k, +v.toFixed(2)]))), +sp.x.toFixed(5), +sp.y.toFixed(5), +(cy - cgy).toFixed(4)]);
    for (const k in prof) prof[k] = 0;
    if (G.autoQuality !== lastQ) { marks.push([Math.round(now - t0), 'autoQuality ' + lastQ + '->' + G.autoQuality]); lastQ = G.autoQuality; }
    if (now - t0 < 14000) requestAnimationFrame(f); else resolve({ rows, marks, lt });
  }
  requestAnimationFrame(f);
}));
// analyse
const r = res.rows;
const race = r.filter((x) => x[2] === 'racing');
const firstRace = race.length ? race[0][0] : 0;
const dts = r.map((x) => x[1]);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; };
console.log(`frames ${r.length} mean dt ${(dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(1)}ms p50 ${pct(dts, 0.5)} p95 ${pct(dts, 0.95)} max ${Math.max(...dts)}`);
console.log('racing starts at', firstRace, 'ms');
const win = (a, b) => r.filter((x) => x[0] >= firstRace + a && x[0] < firstRace + b).map((x) => x[1]);
for (const [a, b] of [[-3000, 0], [0, 1000], [1000, 2000], [2000, 4000], [4000, 8000]]) { const w = win(a, b); if (w.length) console.log(`  [${a}..${b}] n=${w.length} mean ${(w.reduce((s, v) => s + v, 0) / w.length).toFixed(1)} max ${Math.max(...w).toFixed(1)} >50ms:${w.filter((v) => v > 50).length}`); }
console.log('spikes >40ms:', r.filter((x) => x[1] > 40).map((x) => `${x[0] - firstRace}:${x[1]}`).join(' '));
// per-window cost attribution (ms per frame)
for (const [a, b] of [[-2000, 0], [0, 1000], [1000, 3000], [3000, 9000]]) {
  const sel = r.filter((x) => x[0] >= firstRace + a && x[0] < firstRace + b); const acc = {};
  for (const x of sel) { const p = JSON.parse(x[8]); for (const k in p) acc[k] = (acc[k] || 0) + p[k]; }
  console.log(`  cost[${a}..${b}]`, Object.entries(acc).map(([k, v]) => `${k}=${(v / sel.length).toFixed(2)}`).join(' '));
}
console.log('slow frames near start:', r.filter((x) => x[1] > (+process.env.SLOW || 12) && x[0] > firstRace - 1500 && x[0] < firstRace + 4000).map((x) => `${x[0] - firstRace}ms dt=${x[1]} ${x[8]}`).join('\n'));
console.log('spike frames detail:', r.filter((x) => x[1] > 40 && x[2] === 'racing').slice(0, 6).map((x) => `${x[0] - firstRace}ms ${x[8]}`).join(' | '));
// dt-normalised vertical accel of the rendered model
const va = []; for (let i = 2; i < race.length; i++) { const z = race[i - 2], a = race[i - 1], b = race[i]; const v1 = (a[4] - z[4]) / (a[1] / 1000), v2 = (b[4] - a[4]) / (b[1] / 1000); va.push((v2 - v1) / ((a[1] + b[1]) / 2000)); }
console.log(`model vertical accel rms ${Math.sqrt(va.reduce((s, v) => s + v * v, 0) / va.length).toFixed(2)} m/s2 p95 ${pct(va.map(Math.abs), 0.95).toFixed(1)}`);
const sj = (k) => { const a = []; for (let i = 2; i < race.length; i++) a.push(Math.abs(race[i][k] - 2 * race[i - 1][k] + race[i - 2][k])); return a; };
console.log(`screen-space car jitter (NDC 2nd diff x1000): x mean ${(sj(9).reduce((s, v) => s + v, 0) / sj(9).length * 1000).toFixed(2)} p95 ${(pct(sj(9), 0.95) * 1000).toFixed(2)} | y mean ${(sj(10).reduce((s, v) => s + v, 0) / sj(10).length * 1000).toFixed(2)} p95 ${(pct(sj(10), 0.95) * 1000).toFixed(2)} max ${(Math.max(...sj(10)) * 1000).toFixed(1)} | cam-height-rel 2nd diff p95 ${(pct(sj(11), 0.95) * 1000).toFixed(1)}mm max ${(Math.max(...sj(11)) * 1000).toFixed(1)}mm`);
console.log('marks', JSON.stringify(res.marks), 'longtasks', JSON.stringify(res.lt.map(([s, d]) => [s, d])).slice(0, 600));
// smoothness: per-frame displacement / (speed*dt) ratio; and vertical jitter (2nd diff of y)
let ratios = [], yj = [];
for (let i = 2; i < race.length; i++) {
  const a = race[i - 1], b = race[i], z = race[i - 2];
  const d = Math.hypot(b[3] - a[3], b[5] - a[5]), exp = b[6] * b[1] / 1000;
  if (exp > 0.05) ratios.push(d / exp);
  yj.push(Math.abs(b[4] - 2 * a[4] + z[4]));
}
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
console.log(`motion ratio mean ${(ratios.reduce((s, v) => s + v, 0) / ratios.length).toFixed(3)} sd ${sd(ratios).toFixed(3)} p5 ${pct(ratios, 0.05)?.toFixed(3)} p95 ${pct(ratios, 0.95)?.toFixed(3)}`);
console.log(`vertical 2nd-diff mean ${(yj.reduce((s, v) => s + v, 0) / yj.length * 1000).toFixed(2)}mm p95 ${(pct(yj, 0.95) * 1000).toFixed(2)}mm max ${(Math.max(...yj) * 1000).toFixed(1)}mm`);
console.log(errs.slice(0, 5).join('\n') || 'no errors');
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(res));
await browser.close();
