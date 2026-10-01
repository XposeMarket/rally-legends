// Stage loader + spatial queries. Coordinates: x = east (m), y = up (m), z = south (m).
// Road is a polyline of points ~4 m apart baked from real OpenStreetMap roads (see tools/bake.mjs).

export const SURFACES = {
  //            mu = peak friction coef (with the right tyre for the event), roll = rolling resistance coef,
  //            drag = extra speed-proportional drag (deep stuff), bump = high-freq ground noise (m), fx = particle kind
  tarmac:   { mu: 1.10, roll: 0.012, drag: 0.00, bump: 0.000, fx: 'smoke',  sound: 'tarmac', color: 0x3a3a3c },
  slush:    { mu: 0.55, roll: 0.030, drag: 0.02, bump: 0.004, fx: 'slush',  sound: 'snow',   color: 0x9aa3a8 },
  ice:      { mu: 0.28, roll: 0.012, drag: 0.00, bump: 0.000, fx: 'ice',    sound: 'tarmac', color: 0xc9d7e0 },
  snow:     { mu: 0.62, roll: 0.025, drag: 0.02, bump: 0.010, fx: 'snow',   sound: 'snow',   color: 0xe8eef2 },
  gravel:   { mu: 0.78, roll: 0.025, drag: 0.01, bump: 0.018, fx: 'gravel', sound: 'gravel', color: 0x9b8a6e },
  mud:      { mu: 0.58, roll: 0.040, drag: 0.03, bump: 0.020, fx: 'mud',    sound: 'gravel', color: 0x5b4a36 },
  dirt:     { mu: 0.70, roll: 0.030, drag: 0.02, bump: 0.025, fx: 'dust',   sound: 'gravel', color: 0xa0522d },
  rocky:    { mu: 0.74, roll: 0.030, drag: 0.01, bump: 0.035, fx: 'dust',   sound: 'gravel', color: 0xb8a58a },
  grass:    { mu: 0.50, roll: 0.060, drag: 0.05, bump: 0.040, fx: 'grass',  sound: 'grass',  color: 0x4f6b32 },
  deepsnow: { mu: 0.40, roll: 0.120, drag: 0.18, bump: 0.030, fx: 'snow',   sound: 'snow',   color: 0xf2f6f8 },
  sand:     { mu: 0.50, roll: 0.090, drag: 0.10, bump: 0.030, fx: 'dust',   sound: 'gravel', color: 0xc2a476 },
  pavement: { mu: 0.95, roll: 0.015, drag: 0.00, bump: 0.010, fx: 'smoke',  sound: 'tarmac', color: 0x77736c },
};

// Per-environment defaults (world.js uses these for looks; physics uses offroad)
export const ENVS = {
  alpine_night:   { offroad: 'deepsnow', time: 'night',  weather: 'snow_light' },
  nordic_snow:    { offroad: 'deepsnow', time: 'day',    weather: 'snow' },
  nordic_summer:  { offroad: 'grass',    time: 'day',    weather: 'clear' },
  wales_overcast: { offroad: 'grass',    time: 'day',    weather: 'rain' },
  savanna:        { offroad: 'sand',     time: 'day',    weather: 'dust' },
  mediterranean:  { offroad: 'rocky',    time: 'day',    weather: 'clear' },
  corsica:        { offroad: 'grass',    time: 'day',    weather: 'clear' },
  city_dusk:      { offroad: 'pavement', time: 'dusk',   weather: 'clear' },
  rockies:        { offroad: 'rocky',    time: 'day',    weather: 'clear' },
};

// cheap deterministic 1D value noise
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise1(x) { const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return (h(ix, iz) * (1 - ux) + h(ix + 1, iz) * ux) * (1 - uz) + (h(ix, iz + 1) * (1 - ux) + h(ix + 1, iz + 1) * ux) * uz;
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Stage {
  constructor(data) {
    this.meta = { id: data.id, name: data.name, event: data.event, country: data.country, flag: data.flag, surface: data.surface, env: data.env, desc: data.desc, source: data.source, origin: data.origin };
    this.env = ENVS[data.env] || ENVS.nordic_summer;
    this.width = data.width;
    this.halfW = data.width / 2;
    const N = data.road.length;
    this.N = N;
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.px[i] = data.road[i][0]; this.py[i] = data.road[i][1]; this.pz[i] = data.road[i][2]; }
    // cumulative distance, tangents (xz), right vectors, curvature
    this.s = new Float32Array(N); this.tx = new Float32Array(N); this.tz = new Float32Array(N); this.curv = new Float32Array(N);
    for (let i = 1; i < N; i++) this.s[i] = this.s[i - 1] + Math.hypot(this.px[i] - this.px[i - 1], this.pz[i] - this.pz[i - 1]);
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a], l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
      let d = Math.atan2(this.tz[b], this.tx[b]) - Math.atan2(this.tz[a], this.tx[a]);
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const ds = this.s[b] - this.s[a] || 1;
      this.curv[i] = d / ds; // signed 1/m ; >0 = turning right (clockwise seen from above, since z is south)
    }
    this.length = this.s[N - 1];
    // start / finish / splits (distance along road)
    this.startS = 30;
    this.finishS = this.length - 25;
    this.splitS = [this.length / 3, this.length * 2 / 3];
    // terrain grid
    const g = data.grid;
    this.grid = { x0: g.x0, z0: g.z0, step: g.step, nx: g.nx, nz: g.nz, h: Float32Array.from(g.h) };
    this.bounds = { minX: g.x0, minZ: g.z0, maxX: g.x0 + (g.nx - 1) * g.step, maxZ: g.z0 + (g.nz - 1) * g.step };
    // spatial hash of segments
    this.cell = 40;
    this.hash = new Map();
    for (let i = 0; i < N - 1; i++) {
      const minx = Math.min(this.px[i], this.px[i + 1]), maxx = Math.max(this.px[i], this.px[i + 1]);
      const minz = Math.min(this.pz[i], this.pz[i + 1]), maxz = Math.max(this.pz[i], this.pz[i + 1]);
      for (let cx = Math.floor(minx / this.cell); cx <= Math.floor(maxx / this.cell); cx++)
        for (let cz = Math.floor(minz / this.cell); cz <= Math.floor(maxz / this.cell); cz++) {
          const k = cx * 73856093 ^ cz * 19349663;
          let arr = this.hash.get(k); if (!arr) this.hash.set(k, arr = []); arr.push(i);
        }
    }
    this.blendW = 14;       // shoulder blend width beyond verge (m)
    this.vergeW = 1.2;      // flat verge beyond tarmac edge (m)
    this.hasSnowbanks = data.surface === 'snow' || data.surface === 'snowtarmac';
    this._q = { i: 0, t: 0, s: 0, lat: 0, dist: 0, roadY: 0 };
  }

  // Road centre position/tangent at distance s (interpolated)
  indexAtS(s) {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = this.N - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    const t = (s - this.s[lo]) / ((this.s[hi] - this.s[lo]) || 1);
    return { i: lo, t };
  }
  pointAtS(s, out = {}) {
    const { i, t } = this.indexAtS(s);
    const j = Math.min(this.N - 1, i + 1);
    out.x = this.px[i] + (this.px[j] - this.px[i]) * t;
    out.y = this.py[i] + (this.py[j] - this.py[i]) * t;
    out.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    let tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1; out.tx = tx / l; out.tz = tz / l;
    out.rx = -out.tz; out.rz = out.tx; // right vector
    out.heading = Math.atan2(out.tx, -out.tz); // yaw so that three.js -Z forward faces tangent: rotation.y = -heading
    out.i = i;
    return out;
  }

  _projSeg(i, x, z, q) {
    const ax = this.px[i], az = this.pz[i], bx = this.px[i + 1], bz = this.pz[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2; t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t, cz = az + dz * t;
    const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    if (d2 < q.d2) { q.d2 = d2; q.i = i; q.t = t; q.cx = cx; q.cz = cz; }
  }
  // Nearest point on road. hint = previous segment index (fast local search). Returns shared object: copy if you keep it.
  nearest(x, z, hint = -1, out = this._q) {
    const q = { d2: Infinity, i: 0, t: 0, cx: 0, cz: 0 };
    if (hint >= 0) {
      const a = Math.max(0, hint - 25), b = Math.min(this.N - 2, hint + 25);
      for (let i = a; i <= b; i++) this._projSeg(i, x, z, q);
      if (q.d2 > 30 * 30 || q.i === a && a > 0 || q.i === b && b < this.N - 2) q.d2 = Infinity; // fall back to global
    }
    if (q.d2 === Infinity) {
      const cx0 = Math.floor(x / this.cell), cz0 = Math.floor(z / this.cell);
      for (let r = 0; r <= 6 && q.d2 === Infinity; r++) {
        for (let cx = cx0 - r; cx <= cx0 + r; cx++) for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
          if (Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) !== r) continue;
          const arr = this.hash.get(cx * 73856093 ^ cz * 19349663); if (!arr) continue;
          for (const i of arr) this._projSeg(i, x, z, q);
        }
        if (q.d2 !== Infinity && r < 6) { // one more ring to be safe
          const rr = r + 1;
          for (let cx = cx0 - rr; cx <= cx0 + rr; cx++) for (let cz = cz0 - rr; cz <= cz0 + rr; cz++) {
            if (Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) !== rr) continue;
            const arr = this.hash.get(cx * 73856093 ^ cz * 19349663); if (!arr) continue;
            for (const i of arr) this._projSeg(i, x, z, q);
          }
        }
      }
      if (q.d2 === Infinity) { for (let i = 0; i < this.N - 1; i += 4) this._projSeg(i, x, z, q); }
    }
    const i = q.i, t = q.t;
    const tx = this.px[i + 1] - this.px[i], tz = this.pz[i + 1] - this.pz[i], l = Math.hypot(tx, tz) || 1;
    // lateral: + = right of travel direction. right = (-tz, tx)
    const lat = ((x - q.cx) * (-tz / l) + (z - q.cz) * (tx / l));
    out.i = i; out.t = t; out.s = this.s[i] + (this.s[i + 1] - this.s[i]) * t;
    out.lat = lat; out.dist = Math.sqrt(q.d2);
    out.roadY = this.py[i] + (this.py[i + 1] - this.py[i]) * t;
    return out;
  }

  // Raw DEM height (bilinear) with no road conforming
  terrainRaw(x, z) {
    const g = this.grid;
    let fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step;
    fx = Math.max(0, Math.min(g.nx - 1.001, fx)); fz = Math.max(0, Math.min(g.nz - 1.001, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const h = g.h, n = g.nx;
    const a = h[iz * n + ix], b = h[iz * n + ix + 1], c = h[(iz + 1) * n + ix], d = h[(iz + 1) * n + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  // Ground height used by BOTH physics and rendering. Road is flat across its width (slight crown),
  // verge blends into the real terrain, snow stages get snowbanks. hint = segment index for speed.
  heightAt(x, z, hint = -1) {
    const q = this.nearest(x, z, hint);
    const a = Math.abs(q.lat);
    const hw = this.halfW;
    const crown = -0.012 * Math.min(a, hw) * Math.min(a, hw) / hw; // ~6cm drop at the edge
    const road = q.roadY + crown;
    if (a <= hw + this.vergeW) return road + (a > hw ? -0.08 * (a - hw) : 0);
    const raw = this.terrainRaw(x, z) + (noise2(x * 0.08, z * 0.08) - 0.5) * 1.2 + (noise2(x * 0.5, z * 0.5) - 0.5) * 0.15;
    const w = smoothstep(hw + this.vergeW, hw + this.vergeW + this.blendW, a);
    // keep a shallow ditch next to the road on non-city stages
    const ditch = this.meta.surface === 'city' ? 0 : -0.45 * Math.sin(Math.PI * smoothstep(hw + this.vergeW, hw + this.vergeW + 3.5, a)) ;
    let h = (road - 0.1 * this.vergeW) * (1 - w) + raw * w + ditch * (1 - w * 0.6);
    if (this.hasSnowbanks) {
      const b0 = hw + this.vergeW + 0.4;
      const bank = smoothstep(b0, b0 + 1.3, a) * (1 - smoothstep(b0 + 2.2, b0 + 4.5, a));
      h += bank * (0.75 + 0.35 * noise1(q.s * 0.05 + (q.lat > 0 ? 50 : 0)));
    }
    return h;
  }

  // Surface under a point. Pass the result of nearest() (s, lat) to avoid another search.
  surfaceAt(s, lat) {
    const a = Math.abs(lat);
    const base = this.meta.surface;
    if (a > this.halfW + 0.6) {
      if (base === 'city') return 'pavement';
      if (base === 'snowtarmac') return a > this.halfW + this.vergeW + 0.5 ? 'deepsnow' : 'snow';
      return a > this.halfW + this.vergeW + 0.5 ? this.env.offroad : (base === 'tarmac' || base === 'tarmacgravel' ? 'gravel' : base === 'snow' ? 'snow' : 'dirt');
    }
    switch (base) {
      case 'snowtarmac': { // Monte-Carlo: dry tarmac, slush in the wheel tracks, black ice in shadowed sections
        const n = noise1(s * 0.012) * 0.7 + noise1(s * 0.05 + 11) * 0.3;
        if (n > 0.68) return 'ice';
        if (n > 0.5) return 'slush';
        if (n > 0.38 && a > this.halfW * 0.55) return 'snow';
        return 'tarmac';
      }
      case 'tarmacgravel': return noise1(s * 0.004) > 0.55 ? 'gravel' : 'tarmac';
      case 'city': return 'tarmac';
      default: return base;
    }
  }

  // Ground normal via central differences on heightAt
  normalAt(x, z, hint = -1, out = { x: 0, y: 1, z: 0 }) {
    const e = 0.35;
    const hL = this.heightAt(x - e, z, hint), hR = this.heightAt(x + e, z, hint);
    const hD = this.heightAt(x, z - e, hint), hU = this.heightAt(x, z + e, hint);
    let nx = hL - hR, ny = 2 * e, nz = hD - hU; const l = Math.hypot(nx, ny, nz);
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }
}

export async function loadStageIndex() {
  const r = await fetch('data/stages/index.json');
  return r.json();
}
export async function loadStage(id) {
  const r = await fetch(`data/stages/${id}.json`);
  if (!r.ok) throw new Error('stage ' + id + ' ' + r.status);
  return new Stage(await r.json());
}
