// Rally particle + skid mark effects. Pooled Points (custom shader, soft sprites) and ring-buffer skid ribbons.
import * as THREE from './vendor/three.module.js';

const SURF = {
  //            dust color   dust amt  chunk color  chunk amt  dust size  life  linger  skid color  skid alpha  skid width
  tarmac:   { dust: 0xeeeeee, d: 0,   chunk: 0x333333, c: 0,   size: 2.2, life: 2.2, smoke: true, skid: 0x0a0a0a, sa: 0.55, sw: 1.0 },
  pavement: { dust: 0xeeeeee, d: 0,   chunk: 0x333333, c: 0,   size: 2.2, life: 2.2, smoke: true, skid: 0x0a0a0a, sa: 0.5, sw: 1.0 },
  ice:      { dust: 0xf4f8ff, d: 0.3, chunk: 0xe8f0ff, c: 0.2, size: 1.4, life: 1.2, smoke: true, skid: 0xdfe8f2, sa: 0.35, sw: 0.9 },
  slush:    { dust: 0xd8dde0, d: 0.5, chunk: 0x8a8f92, c: 1.0, size: 1.2, life: 1.0, skid: 0x4a4f52, sa: 0.5, sw: 1.0 },
  snow:     { dust: 0xffffff, d: 1.6, chunk: 0xf2f6ff, c: 0.6, size: 2.6, life: 2.0, skid: 0xb8c4d4, sa: 0.55, sw: 1.1 },
  deepsnow: { dust: 0xffffff, d: 2.2, chunk: 0xf2f6ff, c: 1.0, size: 3.0, life: 2.4, skid: 0xa8b6c8, sa: 0.65, sw: 1.25 },
  gravel:   { dust: 0xa88b66, d: 1.0, chunk: 0x6b5a48, c: 1.2, size: 3.0, life: 3.0, skid: 0x4e4234, sa: 0.5, sw: 1.15 },
  dirt:     { dust: 0xb48a5c, d: 1.4, chunk: 0x6a4b30, c: 0.7, size: 3.6, life: 4.0, skid: 0x4a3524, sa: 0.5, sw: 1.15 },
  rocky:    { dust: 0xa89880, d: 0.8, chunk: 0x77706a, c: 1.4, size: 2.8, life: 3.0, skid: 0x4a4540, sa: 0.4, sw: 1.0 },
  sand:     { dust: 0xd8b98a, d: 1.8, chunk: 0xb89a6a, c: 0.5, size: 3.8, life: 4.0, skid: 0x8a7050, sa: 0.5, sw: 1.2 },
  mud:      { dust: 0x6a5238, d: 0.3, chunk: 0x3a2a1a, c: 1.8, size: 1.6, life: 1.2, skid: 0x24180e, sa: 0.7, sw: 1.3 },
  grass:    { dust: 0x9a8a5a, d: 0.3, chunk: 0x3f6a22, c: 1.2, chunk2: 0x5a4024, size: 1.6, life: 1.4, skid: 0x2a3a14, sa: 0.45, sw: 1.1 },
};
const tmpC = new THREE.Color();

function softSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

// One pool = one Points object. kind: 'alpha' (normal blend) or 'add' (additive)
class Pool {
  constructor(scene, max, tex, additive) {
    this.max = max; this.n = 0; this.head = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.age = new Float32Array(max); this.grow = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max); this.s0 = new Float32Array(max); this.fl = new Float32Array(max); this.curFloor = -1e9;
    this.age.fill(1e9); this.life.fill(1);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('color', this.aCol); geo.setAttribute('alpha', this.aAlpha); geo.setAttribute('size', this.aSize);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 }, maxPx: { value: 256 } },
      // near-camera fade + screen-size cap: big smoke puffs right in front of the lens are what kill the GPU
      // (hundreds of full-screen overdraw layers), and they look bad anyway
      vertexShader: `attribute float alpha; attribute float size; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale; uniform float maxPx;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); float d = -mv.z; vC = color;
        vA = alpha * smoothstep(0.9, 4.0, d); gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.004 ? clamp(size * scale / max(d, 0.1), 1.0, maxPx) : 0.0; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, a); 
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  spawn(px, py, pz, vx, vy, vz, color, size, grow, life, alpha, drag, grav) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    tmpC.set(color); const j = 0.92 + Math.random() * 0.16;
    this.col[i3] = tmpC.r * j; this.col[i3 + 1] = tmpC.g * j; this.col[i3 + 2] = tmpC.b * j;
    this.s0[i] = size; this.size[i] = size; this.grow[i] = grow; this.life[i] = life; this.age[i] = 0;
    this.a0[i] = alpha; this.alpha[i] = alpha; this.drag[i] = drag; this.grav[i] = grav; this.fl[i] = this.curFloor;
  }
  update(dt) {
    const { pos, vel, age, life, alpha, size } = this;
    for (let i = 0; i < this.max; i++) {
      if (age[i] >= life[i]) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      age[i] += dt; const t = age[i] / life[i];
      if (t >= 1) { alpha[i] = 0; continue; }
      const i3 = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      vel[i3] *= dr; vel[i3 + 1] = vel[i3 + 1] * dr - this.grav[i] * dt; vel[i3 + 2] *= dr;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (this.grav[i] > 2 && pos[i3 + 1] < this.fl[i]) { pos[i3 + 1] = this.fl[i]; vel[i3 + 1] *= -0.25; vel[i3] *= 0.5; vel[i3 + 2] *= 0.5; }
      size[i] = this.s0[i] * (1 + this.grow[i] * t);
      const fadeIn = Math.min(1, t * 8);
      alpha[i] = this.a0[i] * fadeIn * (1 - t) * (1 - t * 0.3);
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aAlpha.needsUpdate = this.aSize.needsUpdate = true;
  }
  clear() { this.age.fill(1e9); this.alpha.fill(0); this.aAlpha.needsUpdate = true; }
  dispose() { this.points.removeFromParent(); this.points.geometry.dispose(); this.mat.dispose(); }
}

// ---------- skid ribbons ----------
class Skids {
  constructor(scene, maxSeg) {
    this.max = maxSeg; this.head = 0;
    this.pos = new Float32Array(maxSeg * 4 * 3); this.col = new Float32Array(maxSeg * 4 * 4);
    const idx = new Uint32Array(maxSeg * 6);
    for (let s = 0; s < maxSeg; s++) { const v = s * 4, o = s * 6; idx[o] = v; idx[o + 1] = v + 2; idx[o + 2] = v + 1; idx[o + 3] = v + 1; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('color', this.aCol); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    // per-wheel last edge
    this.last = [0, 1, 2, 3].map(() => ({ has: false, l: new THREE.Vector3(), r: new THREE.Vector3(), p: new THREE.Vector3(), a: 0 }));
    this.dirty = false; this.minR = 0; this.maxR = 0;
  }
  add(i, pos, normal, width, color, alpha) {
    const L = this.last[i];
    // side vector = normal x travel dir
    if (!L.has) { L.p.copy(pos); L.has = true; L.a = 0; L.fresh = true; return; }
    const dx = pos.x - L.p.x, dy = pos.y - L.p.y, dz = pos.z - L.p.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 0.09) return; // segment every ~30 cm
    if (d2 > 9) { L.p.copy(pos); L.fresh = true; return; } // teleport -> break
    const inv = 1 / Math.sqrt(d2), tx = dx * inv, ty = dy * inv, tz = dz * inv;
    const n = normal || UP;
    let sx = n.y * tz - n.z * ty, sy = n.z * tx - n.x * tz, sz = n.x * ty - n.y * tx;
    const sl = Math.hypot(sx, sy, sz) || 1; const hw = width * 0.5 / sl; sx *= hw; sy *= hw; sz *= hw;
    const lift = 0.03;
    const lx = pos.x - sx + n.x * lift, ly = pos.y - sy + n.y * lift, lz = pos.z - sz + n.z * lift;
    const rx = pos.x + sx + n.x * lift, ry = pos.y + sy + n.y * lift, rz = pos.z + sz + n.z * lift;
    if (L.fresh) { L.l.set(L.p.x - sx + n.x * lift, L.p.y - sy + n.y * lift, L.p.z - sz + n.z * lift); L.r.set(L.p.x + sx + n.x * lift, L.p.y + sy + n.y * lift, L.p.z + sz + n.z * lift); L.fresh = false; L.a = 0; }
    const s = this.head; this.head = (this.head + 1) % this.max;
    const p = this.pos, b = s * 12;
    p[b] = L.l.x; p[b + 1] = L.l.y; p[b + 2] = L.l.z; p[b + 3] = L.r.x; p[b + 4] = L.r.y; p[b + 5] = L.r.z;
    p[b + 6] = lx; p[b + 7] = ly; p[b + 8] = lz; p[b + 9] = rx; p[b + 10] = ry; p[b + 11] = rz;
    tmpC.set(color);
    const c = this.col, cb = s * 16;
    for (let k = 0; k < 4; k++) { c[cb + k * 4] = tmpC.r; c[cb + k * 4 + 1] = tmpC.g; c[cb + k * 4 + 2] = tmpC.b; c[cb + k * 4 + 3] = k < 2 ? L.a : alpha; }
    L.a = alpha; L.l.set(lx, ly, lz); L.r.set(rx, ry, rz); L.p.copy(pos);
    this.dirty = true;
  }
  brk(i) { const L = this.last[i]; L.has = false; }
  flush() { if (this.dirty) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.dirty = false; } }
  clear() { this.pos.fill(0); this.col.fill(0); this.dirty = true; this.flush(); this.last.forEach((L) => (L.has = false)); }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

export class RallyFX {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene; this.hi = quality !== 'low';
    this.qf = quality === 'high' ? 1 : quality === 'med' ? 0.55 : 0.35; // emission scale per quality tier
    const total = quality === 'high' ? 4000 : quality === 'med' ? 2200 : 1200;
    this.tex = softSprite();
    this.chunkTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(8, 4); g.lineTo(26, 9); g.lineTo(28, 24); g.lineTo(12, 28); g.lineTo(4, 16); g.fill(); return new THREE.CanvasTexture(c); })();
    this.dust = new Pool(scene, Math.floor(total * 0.55), this.tex, false);
    this.chunks = new Pool(scene, Math.floor(total * 0.3), this.chunkTex, false);
    this.glow = new Pool(scene, Math.floor(total * 0.15), this.tex, true);
    this.skids = new Skids(scene, this.hi ? 1500 : 700);
    this.acc = new Float32Array(4 * 3); // per wheel emission accumulators [dust, chunk, smoke]
    this.skidAcc = 0;
  }
  _emitN(slot, rate, dt) { this.acc[slot] += rate * dt; const n = Math.floor(this.acc[slot]); this.acc[slot] -= n; return Math.min(n, 40); }
  emitWheel(i, pos, vel, slip, surface, speed, dt) {
    const S = SURF[surface] || SURF.gravel;
    const q = this.qf;
    const energy = Math.min(3, Math.max(0, slip) * Math.min(speed, 40) / 10 + Math.min(speed, 40) / 40 * 0.4); // roost ~ slip*speed
    const vx = vel ? vel.x : 0, vy = vel ? vel.y : 0, vz = vel ? vel.z : 0;
    const vl = Math.hypot(vx, vz) || 1, bx = -vx / vl, bz = -vz / vl; // backward direction
    this.dust.curFloor = this.chunks.curFloor = pos.y;
    if (S.smoke) {
      if (slip > 0.3) {
        const n = this._emitN(i * 3 + 2, Math.min(1.2, slip - 0.3) * 16 * q, dt);
        for (let k = 0; k < n; k++) this.dust.spawn(pos.x + rnd(-0.15, 0.15), pos.y + 0.15, pos.z + rnd(-0.15, 0.15), vx * 0.25 + rnd(-0.6, 0.6), rnd(0.4, 1.2), vz * 0.25 + rnd(-0.6, 0.6), S.dust, rnd(0.6, 0.95), 2.6, S.life * rnd(0.6, 1.0), 0.36, 1.2, -0.25);
      }
      if (!S.d) return;
    }
    // dust / powder cloud
    const dRate = S.d * energy * 28 * q;
    let n = this._emitN(i * 3, dRate, dt);
    for (let k = 0; k < n; k++) {
      const up = rnd(0.5, 2.0) * (surface === 'snow' || surface === 'deepsnow' ? 1.4 : 1);
      this.dust.spawn(pos.x + rnd(-0.2, 0.2), pos.y + rnd(0.1, 0.35), pos.z + rnd(-0.2, 0.2),
        vx * 0.35 + bx * rnd(1, 3) * energy + rnd(-0.8, 0.8), up, vz * 0.35 + bz * rnd(1, 3) * energy + rnd(-0.8, 0.8),
        S.dust, S.size * rnd(0.4, 0.7), 2.4, S.life * rnd(0.6, 1.3), surface === 'snow' || surface === 'deepsnow' ? 0.5 : 0.3, 1.0, -0.05);
    }
    // chunks: stones / clods / snow lumps thrown backward & up
    const cRate = S.c * Math.max(0, slip * Math.min(speed, 35) / 8 + speed / 60) * 30 * q;
    n = this._emitN(i * 3 + 1, cRate, dt);
    for (let k = 0; k < n; k++) {
      const v = rnd(2, 6) * (0.5 + Math.min(1.5, energy));
      const col = S.chunk2 && Math.random() < 0.4 ? S.chunk2 : S.chunk;
      this.chunks.spawn(pos.x + rnd(-0.1, 0.1), pos.y + 0.05, pos.z + rnd(-0.1, 0.1),
        vx * 0.5 + bx * v + rnd(-1.2, 1.2), rnd(1.5, 4.5) * (surface === 'mud' ? 1.2 : 1), vz * 0.5 + bz * v + rnd(-1.2, 1.2),
        col, surface === 'mud' ? rnd(0.06, 0.14) : rnd(0.03, 0.08), 0, rnd(0.7, 1.4), 1.0, 0.2, 9.8);
    }
  }
  skid(i, pos, normal, slip, surface, dt) {
    const S = SURF[surface] || SURF.gravel;
    const loose = !S.smoke;
    // on loose surfaces always leave a track (ruts); on tarmac only when sliding
    const a = loose ? Math.min(1, 0.25 + slip * 0.8) * S.sa : Math.min(1, Math.max(0, (slip - 0.15) * 1.6)) * S.sa;
    if (a < 0.02) { this.skids.brk(i); return; }
    this.skids.add(i, pos, normal, 0.22 * S.sw, S.skid, a);
  }
  skidBreak(i) { this.skids.brk(i); }
  impact(pos, strength = 0.5, surface = 'tarmac') {
    const S = SURF[surface] || SURF.gravel;
    const q = this.hi ? 1 : 0.5;
    this.chunks.curFloor = pos.y - 0.5; this.dust.curFloor = -1e9;
    if (S.smoke || surface === 'rocky') { // sparks
      const n = Math.floor((20 + 60 * strength) * q);
      for (let k = 0; k < n; k++) this.glow.spawn(pos.x, pos.y, pos.z, rnd(-5, 5) * strength, rnd(1, 6) * strength, rnd(-5, 5) * strength, k % 3 ? 0xffb040 : 0xfff0a0, rnd(0.04, 0.09), -0.5, rnd(0.25, 0.7), 1.0, 0.5, 9.8);
      this.glow.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0xffc070, 1.2 * strength + 0.3, 0.5, 0.12, 1, 0, 0);
    }
    const nd = Math.floor((8 + 30 * strength) * q);
    for (let k = 0; k < nd; k++) this.dust.spawn(pos.x + rnd(-0.4, 0.4), pos.y + rnd(0, 0.4), pos.z + rnd(-0.4, 0.4), rnd(-2, 2), rnd(0.3, 2), rnd(-2, 2), S.smoke ? 0xbbbbbb : S.dust, rnd(0.8, 1.6), 2.5, rnd(1.2, 2.5), 0.45, 1.2, -0.05);
    const nc = Math.floor((10 + 40 * strength) * q);
    for (let k = 0; k < nc; k++) this.chunks.spawn(pos.x, pos.y + 0.1, pos.z, rnd(-4, 4) * strength, rnd(2, 6) * strength, rnd(-4, 4) * strength, S.smoke ? 0x2a2a2a : S.chunk, rnd(0.04, 0.12), 0, rnd(0.8, 1.6), 1, 0.2, 9.8);
  }
  splash(pos, strength = 0.5) {
    const q = this.hi ? 1 : 0.5;
    this.chunks.curFloor = pos.y - 0.3; this.dust.curFloor = -1e9;
    const n = Math.floor((40 + 120 * strength) * q);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = rnd(1, 4) * (0.5 + strength);
      this.chunks.spawn(pos.x + Math.cos(a) * 0.3, pos.y + 0.05, pos.z + Math.sin(a) * 0.3, Math.cos(a) * r, rnd(2.5, 7) * (0.5 + strength), Math.sin(a) * r, 0xcfdde6, rnd(0.05, 0.11), 0, rnd(0.6, 1.2), 0.8, 0.3, 9.8);
    }
    const m = Math.floor((10 + 30 * strength) * q);
    for (let k = 0; k < m; k++) this.dust.spawn(pos.x + rnd(-0.6, 0.6), pos.y + rnd(0.2, 1), pos.z + rnd(-0.6, 0.6), rnd(-1.5, 1.5), rnd(1, 3), rnd(-1.5, 1.5), 0xe8f0f4, rnd(0.8, 1.6), 1.6, rnd(0.6, 1.2), 0.5, 1.5, 2.0);
  }
  backfire(pos, dir) {
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 1;
    this.dust.curFloor = -1e9;
    for (let k = 0; k < 6; k++) { const s = rnd(2, 6); this.glow.spawn(pos.x, pos.y, pos.z, dx * s + rnd(-0.5, 0.5), dy * s + rnd(-0.3, 0.5), dz * s + rnd(-0.5, 0.5), k < 2 ? 0xfff0a0 : 0xff7020, rnd(0.25, 0.5), 1.0, rnd(0.06, 0.14), 1, 3, 0); }
    for (let k = 0; k < (this.hi ? 6 : 3); k++) this.dust.spawn(pos.x, pos.y, pos.z, dx * 2 + rnd(-0.4, 0.4), rnd(0.2, 0.8), dz * 2 + rnd(-0.4, 0.4), 0x555555, rnd(0.3, 0.5), 3, rnd(0.6, 1.0), 0.35, 1.5, -0.3);
  }
  update(dt, camera) {
    dt = Math.min(dt, 0.1);
    if (camera && camera.isPerspectiveCamera) {
      const h = (window.innerHeight || 720) * (window.devicePixelRatio || 1) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      this.dust.mat.uniforms.scale.value = this.chunks.mat.uniforms.scale.value = this.glow.mat.uniforms.scale.value = h;
      const maxPx = Math.max(96, (window.innerHeight || 720) * (window.devicePixelRatio || 1) * 0.3);
      this.dust.mat.uniforms.maxPx.value = this.chunks.mat.uniforms.maxPx.value = this.glow.mat.uniforms.maxPx.value = maxPx;
    }
    this.dust.update(dt); this.chunks.update(dt); this.glow.update(dt); this.skids.flush();
  }
  clear() { this.dust.clear(); this.chunks.clear(); this.glow.clear(); this.skids.clear(); this.acc.fill(0); }
  dispose() { this.dust.dispose(); this.chunks.dispose(); this.glow.dispose(); this.skids.dispose(); this.tex.dispose(); this.chunkTex.dispose(); }
}
