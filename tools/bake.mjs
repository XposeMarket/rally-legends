// Bakes real-world rally stages: road geometry from OSRM (OpenStreetMap) + terrain from Open-Meteo DEM (Copernicus 90m).
// Usage: node tools/bake.mjs [stageId]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../data/stages');
fs.mkdirSync(OUT, { recursive: true });

// waypoints are [lon, lat]
export const STAGES = [
  { id: 'turini', name: 'Col de Turini', event: 'Rallye Monte-Carlo', country: 'France', flag: '🇲🇨', surface: 'snowtarmac', env: 'alpine_night',
    wp: [[7.3336, 43.9936], [7.3914, 43.9775]], maxLen: 7000, width: 6.5, desc: 'The legendary night stage. Tarmac glazed with ice and snow on the climb to the col.' },
  { id: 'colins', name: "Colin's Crest", event: 'Rally Sweden', country: 'Sweden', flag: '🇸🇪', surface: 'snow', env: 'nordic_snow',
    wp: [[13.2600, 59.9900], [13.2928, 60.0050], [13.3300, 60.0200]], maxLen: 7000, width: 6.5, desc: 'Värmland forest roads packed with snow, banks to lean on, and the jump everyone came to see.' },
  { id: 'ouninpohja', name: 'Ouninpohja', event: 'Rally Finland', country: 'Finland', flag: '🇫🇮', surface: 'gravel', env: 'nordic_summer',
    wp: [[24.9300, 61.7500], [24.9709, 61.7650], [25.0100, 61.7800]], maxLen: 7000, width: 6.0, desc: 'Flat-out Finnish gravel. Blind crests, big air, and trees very close to the road.' },
  { id: 'brenig', name: 'Brenig', event: 'Wales Rally GB', country: 'Wales', flag: '🏴', surface: 'mud', env: 'wales_overcast',
    wp: [[3.5600 * -1, 53.0700], [-3.5288, 53.0922], [-3.5000, 53.1100]], maxLen: 7000, width: 5.5, desc: 'Slippery Welsh gravel around the reservoir, wet moorland and low cloud.' },
  { id: 'hellsgate', name: "Hell's Gate", event: 'Safari Rally Kenya', country: 'Kenya', flag: '🇰🇪', surface: 'dirt', env: 'savanna',
    wp: [[36.3000, -0.8700], [36.3188, -0.8896], [36.3400, -0.9100]], maxLen: 7000, width: 7.0, desc: 'Rough red dirt and fesh-fesh dust under the Rift Valley cliffs.' },
  { id: 'loutraki', name: 'Loutraki', event: 'Acropolis Rally', country: 'Greece', flag: '🇬🇷', surface: 'rocky', env: 'mediterranean',
    wp: [[22.9777, 37.9744], [22.9500, 38.0000], [22.9300, 38.0200]], maxLen: 7000, width: 6.0, desc: 'Hot, rocky mountain gravel above the Gulf of Corinth. Hard on tyres and nerves.' },
  { id: 'vizzavona', name: 'Vizzavona', event: 'Tour de Corse', country: 'Corsica', flag: '🇫🇷', surface: 'tarmac', env: 'corsica',
    wp: [[9.1100, 42.1500], [9.1337, 42.1286], [9.1600, 42.1100]], maxLen: 7000, width: 6.0, desc: 'Ten thousand corners. Narrow mountain tarmac with a wall on one side and a drop on the other.' },
  { id: 'monaco', name: 'Monte-Carlo Streets', event: 'City Super Special', country: 'Monaco', flag: '🇲🇨', surface: 'city', env: 'city_dusk',
    wp: [[7.4155, 43.7298], [7.4268, 43.7386], [7.4385, 43.7462]], maxLen: 5000, width: 8.0, minR: 7, desc: 'Street stage through the principality: kerbs, barriers, buildings and harbour views.' },
  { id: 'pikes', name: 'Pikes Peak', event: 'Race to the Clouds', country: 'USA', flag: '🇺🇸', surface: 'tarmacgravel', env: 'rockies',
    wp: [[-105.0430, 38.9225], [-105.0600, 38.8900]], maxLen: 8000, width: 7.0, desc: 'The Pikes Peak Highway: switchbacks climbing toward 14,000 feet.' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'RallyLegends-bake/1.0' } });
      if (r.status === 429) { await sleep(3000 * (i + 1)); if (i === tries - 1) throw new Error('rate limited'); continue; }
      if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200));
      return await r.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(800 * (i + 1)); }
  }
}

const R = 6378137;
function projector(lon0, lat0) {
  const k = Math.cos(lat0 * Math.PI / 180);
  return {
    fwd: (lon, lat) => [(lon - lon0) * Math.PI / 180 * R * k, -(lat - lat0) * Math.PI / 180 * R], // x east, z south (three.js: -z north)
    inv: (x, z) => [lon0 + x / (R * k) * 180 / Math.PI, lat0 - z / R * 180 / Math.PI],
  };
}

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const d = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= d) { out.push([ax + (bx - ax) * t / d, az + (bz - az) * t / d]); t += step; }
    carry = d - (t - step);
  }
  return out;
}
function smooth2D(pts, passes) {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const q = p.map((v) => v.slice());
    for (let i = 1; i < p.length - 1; i++) { q[i][0] = (p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4; q[i][1] = (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4; }
    p = q;
  }
  return p;
}
// remove near-hairpin reversals / duplicated out-and-back spurs that OSRM can produce at via points
function removeSpurs(pts) {
  let changed = true, p = pts;
  while (changed) {
    changed = false;
    for (let i = 2; i < p.length - 2; i++) {
      const a = p[i - 1], b = p[i], c = p[i + 1];
      const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
      if (l1 < 0.01 || l2 < 0.01) { p = p.slice(0, i).concat(p.slice(i + 1)); changed = true; break; }
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
      if (cos < -0.97) { // U-turn on a point: spur. cut back until paths diverge
        let j = 1; while (i - j > 0 && i + j < p.length - 1 && Math.hypot(p[i - j][0] - p[i + j][0], p[i - j][1] - p[i + j][1]) < 4) j++;
        p = p.slice(0, i - j + 1).concat(p.slice(i + j)); changed = true; break;
      }
    }
  }
  return p;
}

// AWS Open Data terrain tiles (Terrarium encoding), zoom 14 (~7-9 m/px at these latitudes)
const ZOOM = 14, TILE_DIR = path.resolve(OUT, '../../tools/.tiles');
fs.mkdirSync(TILE_DIR, { recursive: true });
const tileCache = new Map();
async function tile(x, y) {
  const key = `${x}_${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const f = path.join(TILE_DIR, `${ZOOM}_${key}.png`);
  if (!fs.existsSync(f)) {
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`);
        if (!r.ok) throw new Error('tile ' + r.status);
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
        break;
      } catch (e) { if (i === 4) throw e; await sleep(500 * (i + 1)); }
    }
  }
  const png = PNG.sync.read(fs.readFileSync(f));
  const h = new Float32Array(256 * 256);
  for (let i = 0; i < 256 * 256; i++) h[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1] + png.data[i * 4 + 2] / 256 - 32768;
  tileCache.set(key, h);
  return h;
}
async function heightAt(lon, lat) {
  const n = 2 ** ZOOM;
  const fx = (lon + 180) / 360 * n * 256;
  const lr = lat * Math.PI / 180;
  const fy = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n * 256;
  const px = fx - 0.5, py = fy - 0.5;
  const x0 = Math.floor(px), y0 = Math.floor(py), tx = px - x0, ty = py - y0;
  const s = async (X, Y) => { const t = await tile(Math.floor(X / 256), Math.floor(Y / 256)); return t[(Y & 255) * 256 + (X & 255)]; };
  const a = await s(x0, y0), b = await s(x0 + 1, y0), c = await s(x0, y0 + 1), d = await s(x0 + 1, y0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
// Widen corners tighter than Rmin (OSRM hairpins after smoothing can be ~3 m radius; a car needs ~9 m+)
function radiusAt(p, i) {
  const a = p[i - 2], b = p[i], c = p[i + 2];
  const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const ds = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
  return ds / Math.max(1e-6, Math.abs(d));
}
function limitRadius(pts, Rmin) {
  let p = pts.map((v) => v.slice());
  for (let it = 0; it < 3000; it++) {
    const bad = new Set();
    for (let i = 2; i < p.length - 2; i++) if (radiusAt(p, i) < Rmin) for (let k = -4; k <= 4; k++) bad.add(i + k);
    if (!bad.size) break;
    const q = p.map((v) => v.slice());
    for (const i of bad) if (i > 0 && i < p.length - 1) { q[i][0] = (p[i - 1][0] + p[i][0] * 2 + p[i + 1][0]) / 4; q[i][1] = (p[i - 1][1] + p[i][1] * 2 + p[i + 1][1]) / 4; }
    p = it % 20 === 19 ? resample(q, 4) : q;
  }
  return p;
}

async function elevations(coords) { // coords [[lon,lat]] -> heights
  const out = new Array(coords.length);
  for (let i = 0; i < coords.length; i++) out[i] = await heightAt(coords[i][0], coords[i][1]);
  return out;
}

async function bake(st) {
  console.log(`\n== ${st.id}`);
  const wp = st.wp.map((w) => w.map((v) => v.toFixed(5)).join(',')).join(';');
  const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${wp}?overview=full&geometries=geojson&continue_straight=true`);
  const coords = j.routes[0].geometry.coordinates;
  const lon0 = coords[0][0], lat0 = coords[0][1];
  const P = projector(lon0, lat0);
  let pts = coords.map(([lo, la]) => P.fwd(lo, la));
  pts = removeSpurs(resample(pts, 2));
  // trim to max length
  let len = 0, cut = pts.length;
  for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (len > st.maxLen) { cut = i; break; } }
  pts = pts.slice(0, cut);
  pts = smooth2D(resample(pts, 4), 6);
  pts = resample(pts, 4);
  pts = limitRadius(pts, st.minR || 9);
  pts = resample(pts, 4);
  let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  console.log(`  road ${pts.length} pts, ${(total / 1000).toFixed(2)} km (osrm ${(j.routes[0].distance / 1000).toFixed(1)} km)`);

  // terrain grid over bbox + margin
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  const M = 700;
  minx -= M; maxx += M; minz -= M; maxz += M;
  let step = 20;
  while (((maxx - minx) / step + 1) * ((maxz - minz) / step + 1) > 36000) step += 2;
  const nx = Math.ceil((maxx - minx) / step) + 1, nz = Math.ceil((maxz - minz) / step) + 1;
  const gcoords = [];
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) gcoords.push(P.inv(minx + ix * step, minz + iz * step));
  console.log(`  grid ${nx}x${nz} @${step}m (${gcoords.length} samples)`);
  const gh = await elevations(gcoords);
  // road elevation sampled every 5th point (20m), interpolated + smoothed
  const ridx = []; for (let i = 0; i < pts.length; i += 2) ridx.push(i); if (ridx[ridx.length - 1] !== pts.length - 1) ridx.push(pts.length - 1);
  const rh = await elevations(ridx.map((i) => P.inv(pts[i][0], pts[i][1])));
  let ry = new Array(pts.length);
  for (let k = 0; k < ridx.length - 1; k++) { const a = ridx[k], b = ridx[k + 1]; for (let i = a; i <= b; i++) ry[i] = rh[k] + (rh[k + 1] - rh[k]) * (i - a) / (b - a); }
  // gaussian smoothing of road height (~40m sigma) - DEM noise otherwise makes steps
  const sig = 5, W = 15, sm = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) { let s = 0, w = 0; for (let k = -W; k <= W; k++) { const j2 = Math.min(pts.length - 1, Math.max(0, i + k)); const g = Math.exp(-(k * k) / (2 * sig * sig)); s += ry[j2] * g; w += g; } sm[i] = s / w; }
  // DEM at a road cut into a cliff reads the cliff: limit grade to what real roads have (~16%), alternating passes
  const maxG = st.maxGrade || 0.16, ds = 4;
  for (let it = 0; it < 600; it++) {
    for (let i = 1; i < sm.length; i++) { const d = sm[i] - sm[i - 1]; if (Math.abs(d) > maxG * ds) { const m = (sm[i] + sm[i - 1]) / 2, c = Math.sign(d) * maxG * ds / 2; sm[i - 1] = m - c; sm[i] = m + c; } }
    for (let i = sm.length - 1; i > 0; i--) { const d = sm[i] - sm[i - 1]; if (Math.abs(d) > maxG * ds) { const m = (sm[i] + sm[i - 1]) / 2, c = Math.sign(d) * maxG * ds / 2; sm[i - 1] = m - c; sm[i] = m + c; } }
  }
  { const tmp = sm.slice(); for (let i = 0; i < sm.length; i++) { let s = 0, w = 0; for (let k = -6; k <= 6; k++) { const j2 = Math.min(sm.length - 1, Math.max(0, i + k)); const g = Math.exp(-(k * k) / 18); s += tmp[j2] * g; w += g; } sm[i] = s / w; } }
  if (process.env.DEBUG_SELF) {
    for (let i = 0; i < pts.length; i += 10) for (let j = i + 40; j < pts.length; j += 10) if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < 12) console.log('  self-near', i * 4, j * 4);
  }
  const base = Math.min(...gh);
  const data = {
    id: st.id, name: st.name, event: st.event, country: st.country, flag: st.flag, surface: st.surface, env: st.env, desc: st.desc, width: st.width,
    origin: { lon: lon0, lat: lat0, alt: +base.toFixed(1) },
    length: Math.round(total),
    road: pts.map(([x, z], i) => [+x.toFixed(2), +(sm[i] - base).toFixed(2), +z.toFixed(2)]),
    grid: { x0: +minx.toFixed(1), z0: +minz.toFixed(1), step, nx, nz, h: gh.map((h) => +(h - base).toFixed(1)) },
    source: 'Road geometry © OpenStreetMap contributors via OSRM. Elevation: Copernicus DEM GLO-90 via Open-Meteo.',
  };
  fs.writeFileSync(path.join(OUT, st.id + '.json'), JSON.stringify(data));
  console.log(`  climb range ${(Math.max(...sm) - Math.min(...sm)).toFixed(0)} m, file ${(fs.statSync(path.join(OUT, st.id + '.json')).size / 1024).toFixed(0)} KB`);
  return { id: st.id, name: st.name, event: st.event, country: st.country, flag: st.flag, surface: st.surface, env: st.env, desc: st.desc, length: data.length };
}

const only = process.argv[2];
const idxPath = path.join(OUT, 'index.json');
const index = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : [];
for (const st of STAGES) {
  if (only && st.id !== only) continue;
  try {
    const meta = await bake(st);
    const k = index.findIndex((e) => e.id === st.id);
    if (k >= 0) index[k] = meta; else index.push(meta);
  } catch (e) { console.error(`  FAILED ${st.id}: ${e.message}`); }
}
index.sort((a, b) => STAGES.findIndex((s) => s.id === a.id) - STAGES.findIndex((s) => s.id === b.id));
fs.writeFileSync(idxPath, JSON.stringify(index, null, 1));
console.log('\nindex:', index.map((e) => `${e.id} ${(e.length / 1000).toFixed(1)}km`).join(', '));
