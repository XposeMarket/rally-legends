// Procedural rally car visuals. buildCarModel(spec) -> { group, wheels, headlights, setLights, setDamage, setDirt, exhaust, flame, dispose }
// Conventions: car faces -Z, +X right, +Y up, origin = wheelbase centre at ground (y=0).
import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const sharedTex = new Map();

function makeCanvasTex(w, h, draw, { srgb = true, wrap = false, key = null } = {}) {
  if (key && sharedTex.has(key)) return sharedTex.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (key) { t.userData.shared = true; sharedTex.set(key, t); }
  return t;
}

// ---------- shared textures ----------
function treadTex(bump) {
  return makeCanvasTex(512, 128, (g, w, h) => {
    g.fillStyle = bump ? '#000' : '#161616'; g.fillRect(0, 0, w, h);
    const cols = 30, cw = w / cols;
    for (let i = 0; i < cols; i++) {
      const x = i * cw, off = (i % 2) * 10;
      g.fillStyle = bump ? '#fff' : '#262626';
      // centre knobs (tread band is v 0.25..0.75 -> canvas y 32..96)
      g.fillRect(x + 2, 34 + off, cw - 5, 22);
      g.fillRect(x + 2, 64 + off - 6, cw - 5, 22);
      // shoulder knobs
      g.fillStyle = bump ? '#bbb' : '#202020';
      g.fillRect(x + 1, 18 - off * 0.5, cw - 4, 12);
      g.fillRect(x + 1, 98 + off * 0.5, cw - 4, 12);
    }
    if (!bump) { // sidewall lettering-ish marks
      g.fillStyle = '#2c2c2c';
      for (let i = 0; i < 12; i++) { g.fillRect(i * 43, 3, 22, 5); g.fillRect(i * 43 + 10, h - 8, 22, 5); }
    }
  }, { srgb: !bump, wrap: true, key: bump ? 'treadB' : 'treadC' });
}
function flameTex() {
  return makeCanvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.25, 'rgba(255,190,60,0.95)');
    gr.addColorStop(0.6, 'rgba(255,90,10,0.5)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { key: 'flame' });
}
function screenTex(bannerCol, cracked) {
  return makeCanvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b2630'); gr.addColorStop(1, '#0a0f13');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = hex(bannerCol); g.fillRect(0, 0, w, 44);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 44, w, 4);
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 9; i++) g.fillRect(40 + i * 50, 14, 30, 14);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(60, h); g.lineTo(180, 60); g.lineTo(230, 60); g.lineTo(110, h); g.fill();
    if (cracked) {
      g.strokeStyle = 'rgba(230,240,255,0.85)'; g.lineWidth = 1.6;
      let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const cx = w * 0.62, cy = h * 0.55;
      for (let i = 0; i < 18; i++) {
        let x = cx, y = cy; const a0 = (i / 18) * TAU; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { const a = a0 + (rnd() - 0.5) * 0.7; const l = 12 + rnd() * 30; x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); }
        g.stroke();
      }
      for (let r = 14; r < 90; r += 22) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
    }
  }, { key: 'screen' + bannerCol + (cracked ? 'c' : '') });
}
function numberTex(num, accent) {
  return makeCanvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 26); g.fill();
    g.strokeStyle = hex(accent); g.lineWidth = 8; g.stroke();
    g.fillStyle = hex(accent); g.fillRect(4, h - 38, w - 8, 30);
    g.fillStyle = '#111'; g.font = 'bold 112px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num), w / 2, h / 2 - 14);
  }, { key: 'num' + num + '_' + accent });
}

// ---------- livery painting (canvas x: 0 = rear, 1 = front; y: top = high on car) ----------
function liveryTex(spec, beltV) {
  const L = spec.livery, [s0, s1, s2] = L.stripes, style = L.style;
  return makeCanvasTex(1024, 256, (g, w, h) => {
    const Y = (v) => h - v * h; // v: fraction of body height
    g.fillStyle = hex(L.body); g.fillRect(0, 0, w, h);
    const band = (col, v0, v1, kickF = 0, kickR = 0) => {
      g.fillStyle = hex(col); g.beginPath();
      g.moveTo(0, Y(v1 + kickR)); g.lineTo(w * 0.35, Y(v1)); g.lineTo(w, Y(v1 + kickF));
      g.lineTo(w, Y(v0 + kickF)); g.lineTo(w * 0.35, Y(v0)); g.lineTo(0, Y(v0 + kickR)); g.closePath(); g.fill();
    };
    const slash = (col, x0, width, lean = 0.25) => {
      g.fillStyle = hex(col); g.beginPath();
      g.moveTo(x0, h); g.lineTo(x0 + width, h); g.lineTo(x0 + width + h * lean, 0); g.lineTo(x0 + h * lean, 0); g.fill();
    };
    const b = beltV;
    switch (style) {
      case 'martini': band(s1, b - 0.16, b - 0.06, 0, 0.1); band(s2 === undefined ? s1 : 0x6ab0e0, b - 0.06, b - 0.02, 0, 0.1); band(s0, b - 0.02, b + 0.02, 0, 0.1); break;
      case 'audi': band(s1, 0.18, 0.3); slash(s0, w * 0.55, 60, -0.35); slash(s1, w * 0.62, 30, -0.35); band(s2, 0.3, 0.33); break;
      case 'peugeot': band(s0, 0.2, 0.3, 0.02, 0.2); band(s1, 0.3, 0.35, 0.02, 0.2); band(s2, 0.35, 0.4, 0.02, 0.2); break;
      case 'subaru':
        band(s0, 0.2, 0.3, 0, 0.05); slash(s0, w * 0.08, 150, 0.6); slash(0xffffff, w * 0.08 + 150, 14, 0.6);
        g.fillStyle = hex(s0); for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w * 0.5 + i * 40, Y(b + 0.08), 9, 0, TAU); g.fill(); }
        break;
      case 'ralliart': g.fillStyle = hex(s0); g.fillRect(0, Y(b - 0.08), w, h); band(s1, b - 0.08, b - 0.04); slash(s0, w * 0.15, 40, -0.4); slash(s1, w * 0.15 + 60, 16, -0.4); break;
      case 'rothmans': band(s0, b - 0.22, b - 0.05); band(s1, b - 0.05, b - 0.02); band(s0, b - 0.02, b + 0.03); g.fillStyle = '#c9a227'; g.fillRect(0, Y(b - 0.235), w, 4); break;
      case 'alitalia':
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, Y(0.95)); g.lineTo(w, Y(0.62)); g.lineTo(w, Y(0.0)); g.lineTo(0, Y(0.0)); g.fill();
        band(s1, 0.36, 0.43, 0.08, -0.05); band(s2, 0.3, 0.36, 0.08, -0.05);
        g.fillStyle = hex(L.body); g.beginPath(); g.moveTo(0, Y(1)); g.lineTo(w, Y(0.7)); g.lineTo(w, Y(0.62)); g.lineTo(0, Y(0.95)); g.fill();
        break;
      case 'gazoo':
        g.fillStyle = hex(s1); g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.62, h); g.lineTo(w * 0.42, Y(b - 0.02)); g.lineTo(0, Y(b + 0.2)); g.fill();
        g.fillStyle = hex(s0); g.beginPath(); g.moveTo(w * 0.62, h); g.lineTo(w * 0.7, h); g.lineTo(w * 0.47, Y(b)); g.lineTo(w * 0.42, Y(b - 0.02)); g.fill();
        g.beginPath(); g.moveTo(w, Y(0.15)); g.lineTo(w * 0.8, Y(0.15)); g.lineTo(w * 0.9, Y(b)); g.lineTo(w, Y(b + 0.05)); g.fill();
        break;
      case 'mini': g.fillStyle = hex(s0); g.fillRect(0, Y(b - 0.04), w, 6); break;
      default: band(s0, b - 0.12, b - 0.05);
    }
    // sills darker, subtle panel lines
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, Y(0.14), w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(w * 0.47, Y(b + 0.35), 3, h); g.fillRect(w * 0.72, Y(b + 0.35), 3, h);
  });
}

// ---------- geometry helpers ----------
// Shape drawn in (u = forward metres, y) -> extruded across X, centred. Front (+u) maps to -Z.
function sideGeo(shape, width, bevel = 0, segs = 2, curveSegs = 8) {
  const depth = Math.max(0.001, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: segs, curveSegments: curveSegs,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-depth / 2, 0, 0);
  return geo;
}
function roundRectShape(u0, u1, y0, y1, r) {
  const s = new THREE.Shape();
  r = Math.min(r, (u1 - u0) / 2, (y1 - y0) / 2);
  s.moveTo(u0 + r, y0); s.lineTo(u1 - r, y0); s.quadraticCurveTo(u1, y0, u1, y0 + r);
  s.lineTo(u1, y1 - r); s.quadraticCurveTo(u1, y1, u1 - r, y1); s.lineTo(u0 + r, y1);
  s.quadraticCurveTo(u0, y1, u0, y1 - r); s.lineTo(u0, y0 + r); s.quadraticCurveTo(u0, y0, u0 + r, y0);
  return s;
}
function quadGeo(a, b, c, d) { // a=BL b=BR c=TR d=TL
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

// ---------- per-car silhouettes ----------
// fo: front overhang (m). top: [f, yFrac] f=0 front .. 1 rear, y fraction of height. cab: [fWS, fRoofF, fRoofR, fRearBase] + taper.
// extras flags drive aero/details.
const PROFILES = {
  integrale: { fo: 0.72, top: [[0, 0.46], [0.03, 0.6], [0.3, 0.68], [0.82, 0.7], [1, 0.68]], cab: [0.3, 0.47, 0.88, 0.97], taper: 0.13,
    flare: 0.07, bulge: true, pods: 4, lights: 'quad', roofSpoiler: true, roofVent: true, bonnetVents: 2, flapCol: 0x111111, bumper: 0x1a1a1a, faceDrop: 0.06 },
  s1e2: { fo: 0.98, top: [[0, 0.42], [0.04, 0.55], [0.37, 0.65], [0.72, 0.68], [1, 0.66]], cab: [0.37, 0.53, 0.74, 0.9], taper: 0.12,
    flare: 0.08, pods: 4, lights: 'rect', bigWing: true, frontWings: true, bonnetVents: 3, flapCol: 0xd8201f, bumper: 0x151515, splitter: true },
  '205t16': { fo: 0.62, top: [[0, 0.44], [0.04, 0.56], [0.31, 0.64], [0.8, 0.66], [1, 0.63]], cab: [0.31, 0.5, 0.84, 0.97], taper: 0.12,
    flare: 0.06, lights: 'rect', roofSpoiler: true, roofScoop: true, sideIntake: true, flapCol: 0x1a3e8c, bumper: 0x1a1a1a },
  impreza: { fo: 0.88, top: [[0, 0.42], [0.04, 0.54], [0.31, 0.62], [0.7, 0.64], [0.79, 0.66], [1, 0.65]], cab: [0.31, 0.46, 0.68, 0.8], taper: 0.14,
    flare: 0.06, lights: 'swept', bootWing: 'impreza', roofVent: true, bonnetScoop: true, flapCol: 0xf2c800, bumper: null, splitter: true },
  evo6: { fo: 0.9, top: [[0, 0.45], [0.04, 0.55], [0.31, 0.63], [0.7, 0.64], [0.79, 0.67], [1, 0.66]], cab: [0.31, 0.47, 0.7, 0.81], taper: 0.12,
    flare: 0.05, lights: 'swept', bootWing: 'evo', roofVent: true, bonnetVents: 2, flapCol: 0xc8102e, bumper: null, splitter: true },
  rs1800: { fo: 0.75, top: [[0, 0.5], [0.02, 0.62], [0.33, 0.66], [0.78, 0.66], [1, 0.62]], cab: [0.33, 0.47, 0.69, 0.79], taper: 0.09,
    flare: 0.04, pods: 4, lights: 'squareTwin', chromeBumper: true, flapCol: 0x0b3d91, bumper: 0xc8c8c8 },
  stratos: { fo: 0.74, top: [[0, 0.36], [0.05, 0.47], [0.24, 0.64], [0.72, 0.72], [1, 0.72]], cab: [0.24, 0.44, 0.6, 0.72], taper: 0.24,
    flare: 0.06, bulge: true, pods: 4, lights: 'popup', stratosSpoiler: true, louvres: true, flapCol: 0x111111, bumper: 0x1a1a1a, screenWrap: true },
  rally1: { fo: 0.82, top: [[0, 0.38], [0.05, 0.53], [0.33, 0.64], [0.72, 0.7], [1, 0.66]], cab: [0.33, 0.5, 0.78, 0.9], taper: 0.15,
    flare: 0.09, lights: 'slit', swanWing: true, diffuser: true, canards: true, roofVent: true, bonnetVents: 2, flapCol: 0x111111, bumper: 0x111111, splitter: true },
  mini: { fo: 0.42, top: [[0, 0.5], [0.04, 0.6], [0.3, 0.63], [0.86, 0.63], [1, 0.58]], cab: [0.3, 0.37, 0.82, 0.87], taper: 0.07,
    flare: 0.03, lights: 'roundTwin', pods: 2, roofCol: 0xffffff, chromeBumper: true, flapCol: 0x111111, bumper: 0xc8c8c8 },
};

// ---------- shader patch for dirt + damage (body-ish materials) ----------
function patchMaterial(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uDamage; uniform vec3 uImpact;\nvarying vec3 vLP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLP = position;
      if (uDamage > 0.0) {
        vec3 d = normalize(position + vec3(0.0, -0.5, 0.0));
        float mask = clamp(dot(d, uImpact) * 1.3 - 0.2, 0.0, 1.0);
        float n = sin(position.x * 23.0 + position.z * 7.0) * sin(position.y * 31.0 + position.z * 13.0);
        transformed -= d * uDamage * mask * mask * (0.06 + 0.05 * n);
      }`);
    sh.fragmentShader = 'uniform float uDirt; uniform vec3 uDirtCol; uniform float uDirtH; uniform float uDamage;\nvarying vec3 vLP;\n' +
      sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float nz = sin(vLP.z * 9.0 + vLP.x * 3.0) * 0.5 + sin(vLP.z * 23.0 - vLP.y * 17.0) * 0.25 + sin(vLP.x * 31.0 + vLP.z * 41.0) * 0.12;
      float h = uDirtH * (0.35 + 0.65 * uDirt) + nz * 0.08;
      float dm = clamp(uDirt * 1.25, 0.0, 1.0) * smoothstep(h + 0.06, h - 0.08, vLP.y);
      dm = max(dm, uDirt * 0.25);
      diffuseColor.rgb = mix(diffuseColor.rgb, uDirtCol, clamp(dm, 0.0, 0.92));
      float sc = step(0.82, fract(sin(dot(floor(vLP.xz * 40.0 + vLP.y * 13.0), vec2(12.9898, 78.233))) * 43758.5453));
      diffuseColor.rgb *= 1.0 - uDamage * (0.18 + 0.12 * sc);`);
  };
  mat.customProgramCacheKey = () => 'rlbody';
  return mat;
}

// ---------- wheels ----------
function buildWheelTemplate(spec, hi, rimMat, mats) {
  const r = spec.dims.wheelR, w = spec.dims.wheelW, seg = hi ? 28 : 14;
  const rimR = r * 0.58, side = new THREE.Group();
  // tread: open cylinder, axis X
  const tread = new THREE.CylinderGeometry(r, r, w, seg, 1, true); tread.rotateZ(Math.PI / 2);
  side.add(new THREE.Mesh(tread, mats.tyre));
  // shoulders: slightly rounded rings + sidewalls
  const sh = new THREE.CylinderGeometry(r * 0.96, r, 0.025, seg, 1, true); sh.rotateZ(-Math.PI / 2);
  const sh1 = sh.clone(); sh1.translate(w / 2 + 0.0125, 0, 0); const sh2 = sh.clone(); sh2.rotateZ(Math.PI); sh2.translate(-w / 2 - 0.0125, 0, 0);
  side.add(new THREE.Mesh(sh1, mats.side), new THREE.Mesh(sh2, mats.side));
  const wall = new THREE.RingGeometry(rimR, r * 0.96, seg, 1); wall.rotateY(Math.PI / 2); // faces +X
  const wallO = wall.clone(); wallO.translate(w / 2 + 0.025, 0, 0);
  const wallI = wall.clone(); wallI.rotateY(Math.PI); wallI.translate(-w / 2 - 0.025, 0, 0);
  side.add(new THREE.Mesh(wallO, mats.side), new THREE.Mesh(wallI, mats.side));
  // rim barrel (inside) + dish + spokes on outer (+X) face
  const barrel = new THREE.CylinderGeometry(rimR, rimR, w + 0.03, seg, 1, true); barrel.rotateZ(Math.PI / 2);
  side.add(new THREE.Mesh(barrel, mats.rimDark));
  const dish = new THREE.CircleGeometry(rimR * 0.98, seg); dish.rotateY(Math.PI / 2); dish.translate(-w * 0.3, 0, 0);
  side.add(new THREE.Mesh(dish, mats.rimDark));
  // brake disc between dish and inner wall
  const disc = new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, seg); disc.rotateZ(Math.PI / 2); disc.translate(w * 0.02, 0, 0);
  side.add(new THREE.Mesh(disc, mats.disc));
  const nSp = spec.livery.style === 'mini' || spec.livery.style === 'rothmans' ? 8 : spec.livery.style === 'gazoo' ? 6 : 5;
  if (hi || true) {
    const spoke = new THREE.BoxGeometry(0.035, rimR * 0.8, 0.05); spoke.translate(w * 0.33, rimR * 0.48, 0);
    const parts = [];
    for (let i = 0; i < nSp; i++) { const s = spoke.clone(); s.rotateX((i / nSp) * TAU); parts.push(s); }
    const ring = new THREE.TorusGeometry(rimR * 0.94, 0.022, 4, seg); ring.rotateY(Math.PI / 2); ring.translate(w * 0.46, 0, 0);
    const hub = new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.26, 0.06, 10); hub.rotateZ(-Math.PI / 2); hub.translate(w * 0.36, 0, 0);
    parts.push(ring, hub);
    for (const p of parts) side.add(new THREE.Mesh(p, rimMat));
    const nut = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 6); nut.rotateZ(Math.PI / 2); nut.translate(w * 0.4, 0, 0);
    side.add(new THREE.Mesh(nut, mats.chrome));
  }
  side.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return side;
}

// ---------- main builder ----------
export function buildCarModel(spec, { quality = 'high' } = {}) {
  const hi = quality !== 'low';
  const D = spec.dims, P = PROFILES[spec.id] || PROFILES.integrale, LV = spec.livery;
  const L = D.length, H = D.height, wb = D.wheelbase, gc = D.groundClear, R = D.wheelR;
  const flare = P.flare, Wb = D.width - 2 * flare; // body width without flares
  const uF = wb / 2 + P.fo, uR = uF - L;
  const uAt = (f) => uF - f * L;
  const topY = (f) => { const t = P.top; for (let i = 1; i < t.length; i++) if (f <= t[i][0]) { const a = t[i - 1], b = t[i]; return (a[1] + (b[1] - a[1]) * (f - a[0]) / (b[0] - a[0])) * H; } return t[t.length - 1][1] * H; };
  const fOfU = (u) => (uF - u) / L;
  const group = new THREE.Group(); group.name = 'car-' + spec.id;
  const disposables = []; const own = (x) => (disposables.push(x), x);

  // uniforms shared by all body-ish materials
  const U = { uDirt: { value: 0 }, uDirtCol: { value: new THREE.Color(0x6b5a44) }, uDirtH: { value: R * 1.9 }, uDamage: { value: 0 }, uImpact: { value: new THREE.Vector3(0, 0, -1) } };
  const Phys = (o) => own(hi ? new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.08, roughness: 0.38, metalness: 0.15, ...o }) : new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15, ...o }));
  const Std = (o) => own(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...o }));
  const beltV = topY(P.cab[0] + 0.05) / H;
  const livTex = own(liveryTex(spec, beltV));
  const M = {
    body: patchMaterial(Phys({ map: livTex }), U),
    paint: patchMaterial(Phys({ color: LV.body }), U),
    roof: patchMaterial(Phys({ color: P.roofCol ?? LV.body }), U),
    accent: patchMaterial(Phys({ color: LV.stripes[0] }), U),
    accent2: patchMaterial(Phys({ color: LV.stripes[1] }), U),
    bumper: patchMaterial(P.bumper == null ? Phys({ color: LV.body }) : P.chromeBumper ? Std({ color: P.bumper, metalness: 1, roughness: 0.25 }) : Std({ color: P.bumper, roughness: 0.6 }), U),
    black: patchMaterial(Std({ color: 0x0d0d0d, roughness: 0.55 }), U),
    plastic: Std({ color: 0x161616, roughness: 0.8 }),
    flap: patchMaterial(Std({ color: P.flapCol, roughness: 0.85 }), U),
    chrome: Std({ color: 0xdddddd, metalness: 1, roughness: 0.2 }),
    carbon: Std({ color: 0x1b1b1d, roughness: 0.4, metalness: 0.3 }),
    liner: Std({ color: 0x050505, roughness: 1, side: THREE.DoubleSide }),
    glass: own(hi ? new THREE.MeshPhysicalMaterial({ color: 0x10171d, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 }) : new THREE.MeshStandardMaterial({ color: 0x10171d, roughness: 0.12, metalness: 0.4 })),
    head: Std({ color: 0xdfe6ee, emissive: 0xfff4d6, emissiveIntensity: 0.05, roughness: 0.1, metalness: 0.3 }),
    pod: Std({ color: 0xe8ecf0, emissive: 0xfff4d6, emissiveIntensity: 0.0, roughness: 0.1, metalness: 0.3 }),
    tail: Std({ color: 0x5a0808, emissive: 0xff1010, emissiveIntensity: 0.05, roughness: 0.2 }),
    rev: Std({ color: 0xbbbbbb, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 }),
    amber: Std({ color: 0xc87a10, emissive: 0xff8a00, emissiveIntensity: 0.05, roughness: 0.2 }),
    tyre: Std({ map: treadTex(false), bumpMap: hi ? treadTex(true) : null, bumpScale: 3, roughness: 0.95, color: 0xffffff }),
    side: Std({ color: 0x1a1a1a, roughness: 0.9 }),
    rimDark: Std({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }),
    disc: Std({ color: 0x77777a, roughness: 0.35, metalness: 0.9 }),
    rim: Std({ color: LV.rims, roughness: 0.3, metalness: 0.7 }),
    flame: own(new THREE.SpriteMaterial({ map: flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })),
  };
  M.screen = own(M.glass.clone()); M.screen.map = own(screenTex(LV.stripes[0], false)); M.screen.color.set(0xffffff);
  M.screenCracked = own(M.glass.clone()); M.screenCracked.map = own(screenTex(LV.stripes[0], true)); M.screenCracked.color.set(0xffffff);

  // add geometry baked into car-local space (patched shader uses object-space position)
  const tmpM = new THREE.Matrix4(), tmpE = new THREE.Euler(), tmpQ = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = group) => {
    own(geo);
    if (x || y || z || rx || ry || rz) geo.applyMatrix4(tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), ONE));
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = false; parent.add(m); return m;
  };
  const box = (sx, sy, sz, mat, x, y, z, rx, ry, rz, parent) => add(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z, rx, ry, rz, parent);
  const mirrorX = (fn) => { fn(1); fn(-1); };

  // ---------- lower body (extruded side silhouette with arch cut-outs) ----------
  const y0 = gc, bev = hi ? 0.035 : 0.025, bo = bev * 0.8;
  const cab = P.cab, yBelt = topY(cab[0]), hw = Wb / 2;
  const Ra = R + 0.05 + (P.bulge ? 0.015 : 0);
  const body = new THREE.Shape();
  body.moveTo(uR, y0 + 0.07); body.lineTo(uR + 0.07, y0);
  for (const c of [-wb / 2, wb / 2]) {
    const dx = Math.sqrt(Math.max(0.0001, Ra * Ra - (y0 - R) * (y0 - R)));
    body.lineTo(c - dx, y0);
    body.absarc(c, R, Ra, Math.atan2(y0 - R, -dx), Math.atan2(y0 - R, dx), true);
  }
  body.lineTo(uF - 0.07, y0); body.lineTo(uF, y0 + 0.07);
  for (const [f] of P.top) if (f < cab[0]) body.lineTo(uAt(f), topY(f));
  body.lineTo(uAt(cab[0]), yBelt); body.lineTo(uAt(cab[3]), yBelt);
  for (const [f] of P.top) if (f > cab[3]) body.lineTo(uAt(f), topY(f));
  body.closePath();
  const bodyGeo = sideGeo(body, Wb, bev, hi ? 3 : 1, hi ? 10 : 5);
  { // planar side UVs: u rear->front, v = height
    const p = bodyGeo.attributes.position, uv = bodyGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (-p.getZ(i) - uR) / L, p.getY(i) / H);
  }
  add(bodyGeo, [M.body, M.paint]);

  // ---------- greenhouse (tapered) + glass ----------
  const Wg = Wb * 0.965, gBev = 0.03;
  const uA0 = uAt(cab[0]), uA1 = uAt(cab[1]), uC1 = uAt(cab[2]), uC0 = uAt(cab[3]);
  const gh = new THREE.Shape();
  gh.moveTo(uA0, yBelt - 0.02); gh.lineTo(uA1, H - gBev); gh.lineTo(uC1, H - gBev); gh.lineTo(uC0, yBelt - 0.02); gh.closePath();
  const ghGeo = sideGeo(gh, Wg, gBev, hi ? 2 : 1);
  const tap = (y) => 1 - P.taper * Math.min(1, Math.max(0, (y - yBelt) / (H - yBelt)));
  { const p = ghGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * tap(p.getY(i))); ghGeo.computeVertexNormals(); }
  add(ghGeo, M.roof);
  const gw = (y) => (Wg / 2) * tap(y); // greenhouse half width at height y
  const lerp = (a, b, t) => a + (b - a) * t;
  M.glass.side = THREE.DoubleSide; M.screen.side = THREE.DoubleSide; M.screenCracked.side = THREE.DoubleSide;
  // slope screens: front (A) and rear (C)
  const slopeQuad = (ub, ut, mat, inset, front) => {
    const yb = yBelt - 0.02, yt = H - gBev; const su = ut - ub, sy = yt - yb, sl = Math.hypot(su, sy);
    const nu = (front ? 1 : -1) * Math.abs(sy) / sl, ny = Math.abs(su) / sl, off = gBev * 0.8 + 0.006;
    const pt = (t, side) => { const y = lerp(yb, yt, t); const u = lerp(ub, ut, t); return [side * (gw(y) - inset), y + ny * off, -(u + nu * off)]; };
    const t0 = 0.08, t1 = 0.93;
    return add(quadGeo(pt(t0, -1), pt(t0, 1), pt(t1, 1), pt(t1, -1)), mat);
  };
  const windscreen = slopeQuad(uA0, uA1, M.screen, 0.07, true);
  slopeQuad(uC0, uC1, M.glass, 0.09, false);
  // side windows, split by B-pillar
  const wy0 = yBelt + 0.05, wy1 = H - gBev - 0.05;
  const edgeU = (ua, ub, y) => lerp(ua, ub, (y - (yBelt - 0.02)) / (H - gBev - (yBelt - 0.02)));
  const uB = lerp(uA1, uC1, P.cab[3] > 0.9 ? 0.62 : 0.5);
  mirrorX((s) => {
    const X = (y) => s * (gw(y) + 0.004);
    const fl = edgeU(uA0, uA1, wy0) - 0.06, fh = edgeU(uA0, uA1, wy1) - 0.06;
    const rl = edgeU(uC0, uC1, wy0) + 0.06, rh = edgeU(uC0, uC1, wy1) + 0.06;
    const P3 = (u, y) => [X(y), y, -u];
    add(quadGeo(P3(uB + 0.04, wy0), P3(fl, wy0), P3(fh, wy1), P3(Math.min(uB + 0.04, fh), wy1)), M.glass);
    if (rl < uB - 0.12) add(quadGeo(P3(rl, wy0), P3(uB - 0.04, wy0), P3(Math.max(uB - 0.04, rh), wy1), P3(rh, wy1)), M.glass);
  });

  // ---------- arches: liners + flares ----------
  const archParts = [];
  for (const c of [-wb / 2, wb / 2]) {
    const ln = new THREE.CylinderGeometry(Ra - 0.01, Ra - 0.01, Wb - 0.02, hi ? 14 : 8, 1, true, -0.35, Math.PI + 0.7);
    ln.rotateZ(Math.PI / 2);
    add(ln, M.liner, 0, R, -c);
    mirrorX((s) => add(new THREE.CircleGeometry(Ra, hi ? 14 : 8, -0.2, Math.PI + 0.4), M.liner, s * (Math.min(D.trackF, D.trackR) / 2 - D.wheelW / 2 - 0.06), R, -c, 0, Math.PI / 2));
    if (flare > 0.005) {
      const Ro = Ra + 0.07 + (P.bulge ? 0.04 : 0);
      const fs = new THREE.Shape();
      fs.absarc(c, R, Ro, Math.PI + 0.22, -0.22, true);
      fs.absarc(c, R, Ra, -0.22, Math.PI + 0.22, false);
      const fw = flare + 0.07;
      mirrorX((s) => { const g = sideGeo(fs, fw, 0.012, 1, hi ? 14 : 8); archParts.push(add(g, M.paint, s * (hw + flare - fw / 2 + 0.005), 0, 0)); });
    }
  }

  // ---------- bumpers, grille, splitter ----------
  const fz = -(uF + bo), rz = -(uR - bo);
  const bh = P.chromeBumper ? 0.09 : 0.17, by = y0 + (P.chromeBumper ? 0.14 : 0.08);
  const bumpF = box(Wb + 0.03, bh, 0.12, M.bumper, 0, by, fz - 0.03);
  const bumpR = box(Wb + 0.03, bh, 0.12, M.bumper, 0, by, rz + 0.03);
  const yL = Math.max(y0 + 0.27, topY(0) - 0.1);
  if (P.splitter) box(Wb * 0.94, 0.025, 0.16, M.carbon, 0, y0 + 0.01, fz - 0.06);
  const grilleW = P.lights === 'slit' ? Wb * 0.7 : Wb * 0.42;
  box(grilleW, P.lights === 'slit' ? 0.22 : 0.11, 0.02, M.plastic, 0, P.lights === 'slit' ? y0 + 0.22 : yL, fz - 0.002);
  if (P.lights === 'swept' || P.lights === 'slit') mirrorX((s) => box(0.2, 0.08, 0.02, M.plastic, s * (hw - 0.28), y0 + 0.17, fz - 0.07));
  // towing eyes
  const eyeMat = Std({ color: 0xff5a00, roughness: 0.5 });
  add(new THREE.TorusGeometry(0.04, 0.012, 6, 12), eyeMat, hw * 0.45, y0 + 0.03, fz - 0.1);
  add(new THREE.TorusGeometry(0.04, 0.012, 6, 12), eyeMat, -hw * 0.45, y0 + 0.03, rz + 0.1);

  // ---------- lights ----------
  const lensGeoR = (r) => new THREE.CylinderGeometry(r, r, 0.03, hi ? 16 : 10).rotateX(Math.PI / 2);
  const fFace = (y) => { // z of front face at height y (approx; front top slopes back)
    const t = P.top; const yTop = t[1][1] * H; const k = Math.min(1, Math.max(0, (y - t[0][1] * H) / Math.max(0.01, yTop - t[0][1] * H)));
    return -(uF + bo) + k * (t[1][0] * L) - 0.005;
  };
  const lampY = Math.min(yL, topY(0) - 0.06), lampZ = fFace(lampY);
  const lampPos = [];
  mirrorX((s) => {
    const x = s * (hw - 0.22);
    switch (P.lights) {
      case 'quad': for (const k of [0, 1]) add(lensGeoR(0.07), M.head, s * (hw - 0.16 - k * 0.19), lampY, lampZ); lampPos.push([s * (hw - 0.25), lampY]); break;
      case 'roundTwin': add(lensGeoR(0.085), M.head, s * (hw - 0.2), lampY + 0.02, lampZ); lampPos.push([s * (hw - 0.2), lampY]); break;
      case 'squareTwin': for (const k of [0, 1]) box(0.16, 0.13, 0.03, M.head, s * (hw - 0.17 - k * 0.2), lampY, lampZ); lampPos.push([s * (hw - 0.27), lampY]); break;
      case 'popup': box(0.28, 0.07, 0.24, M.paint, x, topY(0.12) + 0.03, -(uAt(0.12)), -0.15); add(lensGeoR(0.06), M.head, x, topY(0.12) + 0.04, -(uAt(0.12)) - 0.12); lampPos.push([x, topY(0.12)]); break;
      case 'slit': box(0.36, 0.05, 0.04, M.head, s * (hw - 0.26), lampY + 0.06, lampZ + 0.02, 0, s * 0.18); lampPos.push([s * (hw - 0.26), lampY]); break;
      case 'swept': box(0.36, 0.11, 0.05, M.head, s * (hw - 0.24), lampY, lampZ + 0.03, 0, s * 0.2); lampPos.push([s * (hw - 0.24), lampY]); break;
      default: box(0.34, 0.12, 0.03, M.head, s * (hw - 0.24), lampY, lampZ); lampPos.push([s * (hw - 0.24), lampY]);
    }
    box(0.1, 0.04, 0.02, M.amber, s * (hw - 0.12), by + bh / 2 + 0.03, fz - 0.01);
    // tail lights
    const tY = Math.min(topY(1) - 0.09, y0 + 0.42), tz = -(uR - bo) + 0.012;
    box(P.lights === 'slit' ? 0.5 : 0.26, P.lights === 'slit' ? 0.05 : 0.11, 0.03, M.tail, s * (hw - (P.lights === 'slit' ? 0.3 : 0.18)), tY, tz);
    box(0.08, 0.06, 0.03, M.rev, s * (hw - 0.4), tY - 0.02, tz);
  });
  // light pods (night stages)
  const podLights = [];
  if (P.pods) {
    const n = P.pods, podZ = fz - 0.12 - (P.chromeBumper ? 0.04 : 0), podY = lampY + 0.13;
    box(Wb * 0.8, 0.03, 0.03, M.black, 0, podY - 0.1, podZ + 0.05);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * Math.min(0.32, Wb * 0.85 / n);
      add(new THREE.CylinderGeometry(0.095, 0.08, 0.11, hi ? 16 : 10).rotateX(Math.PI / 2), M.black, x, podY, podZ + 0.04);
      add(new THREE.CircleGeometry(0.083, hi ? 16 : 10), M.pod, x, podY, podZ - 0.016, 0, Math.PI);
      podLights.push([x, podY, podZ]);
    }
  }
  // Note: CircleGeometry faces +Z by default; rotated PI to face -Z (forward).

  // spotlights
  const headlights = [];
  const mkSpot = (x, y, z, angle, dist, tgtZ) => {
    const l = new THREE.SpotLight(0xfff1d8, 0, dist, angle, 0.45, 1.6);
    l.position.set(x, y, z); l.target.position.set(x * 1.4, 0, z + tgtZ);
    group.add(l, l.target); headlights.push(l); return l;
  };
  for (const [x, y] of lampPos) mkSpot(x, y, lampZ - 0.05, 0.55, 90, -22);
  if (podLights.length) {
    const p0 = podLights[0], p1 = podLights[podLights.length - 1];
    mkSpot(p0[0], p0[1], p0[2] - 0.1, 0.32, 160, -60); mkSpot(p1[0], p1[1], p1[2] - 0.1, 0.32, 160, -60);
  }

  // ---------- aero / details ----------
  const roofU = (uA1 + uC1) / 2, roofLen = uA1 - uC1;
  if (P.roofVent) box(0.22, 0.05, 0.22, M.black, 0, H + 0.01, -(uA1 - 0.25), -0.25);
  if (P.roofScoop) { box(0.36, 0.09, 0.4, M.paint, 0, H + 0.03, -(uC1 + 0.3), 0.12); box(0.3, 0.06, 0.02, M.plastic, 0, H + 0.04, -(uC1 + 0.5)); }
  if (P.roofSpoiler) box(Wg * (1 - P.taper) - 0.02, 0.03, 0.22, M.paint, 0, H - 0.02, -(uC1 - 0.08), -0.18);
  const hoodF = 0.5 * cab[0], hoodU = uAt(hoodF), hoodY = topY(hoodF);
  const hoodSlope = Math.atan2(topY(cab[0]) - topY(0.03), L * (cab[0] - 0.03));
  if (P.bonnetVents) for (let i = 0; i < P.bonnetVents; i++) mirrorX((s) => box(0.24, 0.02, 0.07, M.black, s * 0.25, hoodY + bo + 0.004 + i * 0.012, -(hoodU + 0.08 - i * 0.12), -hoodSlope));
  if (P.bonnetScoop) { box(0.42, 0.07, 0.34, M.paint, 0, hoodY + bo + 0.03, -(hoodU - 0.05), -hoodSlope); box(0.36, 0.05, 0.02, M.plastic, 0, hoodY + bo + 0.04, -(hoodU + 0.12)); }
  if (P.louvres) for (let i = 0; i < 6; i++) box(Wb * 0.6, 0.02, 0.04, M.black, 0, topY(0.85) + bo + 0.03, -uAt(0.76 + i * 0.035));
  if (P.sideIntake) mirrorX((s) => box(0.02, 0.16, 0.42, M.black, s * (hw + bo + 0.003), yBelt - 0.18, -uAt(cab[3] - 0.08)));
  // rear spoilers & wings
  const wingAt = (span, chord, y, z, mat, endplates) => {
    box(span, 0.035, chord, mat, 0, y, z, -0.08);
    if (endplates) mirrorX((s) => box(0.02, 0.2, chord + 0.08, mat, s * span / 2, y - 0.03, z + 0.02));
  };
  const rearTopY = topY(0.96), rz0 = -uAt(0.96);
  if (P.bigWing) { wingAt(Wb * 0.98, 0.34, rearTopY + 0.28, rz0, M.paint, true); mirrorX((s) => box(0.03, 0.26, 0.18, M.black, s * Wb * 0.3, rearTopY + 0.14, rz0)); }
  if (P.frontWings) mirrorX((s) => box(0.28, 0.02, 0.24, M.paint, s * (hw - 0.08), y0 + 0.2, fz - 0.14, 0.1, 0, s * 0.08));
  if (P.bootWing === 'impreza') { wingAt(Wb * 0.86, 0.22, rearTopY + 0.16, rz0 + 0.05, M.paint, true); mirrorX((s) => box(0.03, 0.15, 0.12, M.paint, s * Wb * 0.33, rearTopY + 0.07, rz0 + 0.05)); }
  if (P.bootWing === 'evo') { wingAt(Wb * 0.9, 0.2, rearTopY + 0.13, rz0 + 0.04, M.accent2, false); box(Wb * 0.9, 0.025, 0.12, M.accent2, 0, rearTopY + 0.25, rz0 + 0.02, -0.15); mirrorX((s) => box(0.035, 0.24, 0.14, M.black, s * Wb * 0.36, rearTopY + 0.12, rz0 + 0.04)); }
  if (P.stratosSpoiler) box(Wb * 0.98, 0.1, 0.06, M.paint, 0, topY(1) + 0.03, -(uR - bo) - 0.03, -0.5);
  if (P.swanWing) {
    const wy = H + 0.08, wz = -(uR + 0.15);
    wingAt(D.width * 0.97, 0.36, wy, wz, M.carbon, true);
    box(D.width * 0.97, 0.03, 0.14, M.accent, 0, wy + 0.05, wz + 0.17, -0.35);
    mirrorX((s) => { box(0.025, 0.08, 0.3, M.carbon, s * 0.35, wy + 0.05, wz - 0.02); box(0.025, H - topY(0.97) + 0.12, 0.08, M.carbon, s * 0.35, (wy + topY(0.97)) / 2, wz - 0.12, 0.35); });
  }
  if (P.diffuser) for (let i = -2; i <= 2; i++) box(0.02, 0.14, 0.32, M.carbon, i * Wb * 0.18, y0 + 0.05, rz + 0.05);
  if (P.canards) mirrorX((s) => { box(0.22, 0.02, 0.14, M.carbon, s * (hw - 0.05), y0 + 0.3, fz + 0.04, 0, 0, s * 0.25); box(0.22, 0.02, 0.14, M.carbon, s * (hw - 0.05), y0 + 0.2, fz + 0.04, 0, 0, s * 0.25); });

  // mirrors
  mirrorX((s) => {
    const mx = s * (gw(yBelt) + 0.1), mz = -(uA0 - 0.12), my = yBelt + 0.1;
    box(0.13, 0.03, 0.04, M.black, mx - s * 0.05, my - 0.04, mz + 0.02);
    box(0.13, 0.08, 0.07, M.paint, mx, my, mz);
  });
  // number panels on doors
  const doorU = (uB + uA0) / 2 + 0.05;
  const numMat = Std({ map: numberTex(LV.number, LV.stripes[0]), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  mirrorX((s) => add(new THREE.PlaneGeometry(0.5, 0.31), numMat, s * (hw + bo + 0.004), Math.max(y0 + 0.28, yBelt - 0.24), -doorU, 0, s * Math.PI / 2));
  // bonnet number roundel
  add(new THREE.PlaneGeometry(0.4, 0.25), numMat, 0, hoodY + bo + 0.012, -(hoodU + 0.05), -Math.PI / 2 - hoodSlope, 0, Math.PI);
  // mudflaps
  const flaps = [];
  for (const [c, fr] of [[wb / 2, 1], [-wb / 2, 0]]) mirrorX((s) => {
    const fh = R + 0.06 - 0.03;
    const tr = (fr ? D.trackF : D.trackR) / 2;
    flaps.push(box(D.wheelW + 0.08, fh, 0.012, M.flap, s * tr, 0.03 + fh / 2, -(c - Ra - 0.02), 0.05));
  });
  // exhaust
  const exX = spec.id === 'mini' || spec.id === 'rs1800' ? hw * 0.5 : spec.id === 'stratos' ? 0 : -hw * 0.55;
  const exhaust = new THREE.Object3D(); exhaust.position.set(exX, y0 + 0.08, rz + 0.12); group.add(exhaust);
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10, 1, true).rotateX(Math.PI / 2), M.chrome, exX, y0 + 0.08, rz + 0.04);
  M.chrome.side = THREE.DoubleSide;
  const flameSpr = new THREE.Sprite(M.flame); flameSpr.scale.set(0.45, 0.3, 1); flameSpr.position.set(0, 0, 0.18); flameSpr.visible = false; exhaust.add(flameSpr);
  const flameLight = new THREE.PointLight(0xff7a20, 0, 4, 2); flameLight.position.set(0, 0, 0.3); exhaust.add(flameLight);
  let flameT = null;
  // underbody/sump guard
  box(Wb * 0.85, 0.02, L * 0.7, M.black, 0, y0 + 0.012, 0);

  // ---------- wheels ----------
  const wheelTpl = buildWheelTemplate(spec, hi, M.rim, M);
  const wheels = [];
  const names = ['FL', 'FR', 'RL', 'RR'];
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Object3D(); w.name = 'wheel' + names[i];
    const inner = wheelTpl.clone(); // shares geometry & materials
    if (i % 2 === 0) inner.rotation.y = Math.PI; // left wheels: rim faces -X (outward). Rotation about Y keeps the axle on X and spin sign consistent.
    w.add(inner); wheels.push(w);
  }
  // collect wheel geometries for disposal (once)
  wheelTpl.traverse((o) => { if (o.isMesh) own(o.geometry); });

  // ---------- state API ----------
  const lightState = { head: false, brake: 0, reverse: false };
  function setLights({ head = lightState.head, brake = lightState.brake, reverse = lightState.reverse } = {}) {
    lightState.head = head; lightState.brake = brake; lightState.reverse = reverse;
    M.head.emissiveIntensity = head ? 3.2 : 0.05;
    M.pod.emissiveIntensity = head ? 4 : 0;
    M.tail.emissiveIntensity = (head ? 0.9 : 0.06) + brake * 3.2;
    M.rev.emissiveIntensity = reverse ? 2.5 : 0;
    for (let k = 0; k < headlights.length; k++) headlights[k].intensity = head ? (k < 2 ? 60 : 90) : 0;
  }
  const bumpF0 = bumpF.position.clone(), bumpR0 = bumpR.position.clone();
  let damage = 0;
  function setDamage(level = 0, impactDir) {
    damage = Math.min(1, Math.max(0, level));
    U.uDamage.value = damage;
    if (impactDir) { U.uImpact.value.copy(impactDir); if (U.uImpact.value.lengthSq() > 1e-6) U.uImpact.value.normalize(); }
    const iz = U.uImpact.value.z;
    const fF = damage * (iz <= 0 ? 1 : 0.35), fR = damage * (iz > 0 ? 1 : 0.35);
    bumpF.position.set(bumpF0.x + 0.03 * fF, bumpF0.y - 0.05 * fF, bumpF0.z + 0.07 * fF); bumpF.rotation.set(0.12 * fF, 0, -0.1 * fF);
    bumpR.position.set(bumpR0.x - 0.03 * fR, bumpR0.y - 0.05 * fR, bumpR0.z - 0.06 * fR); bumpR.rotation.set(-0.1 * fR, 0, 0.12 * fR);
    windscreen.material = damage > 0.5 ? M.screenCracked : M.screen;
    flaps[2].visible = damage < 0.35; flaps[1].visible = damage < 0.7; flaps[0].rotation.z = damage * 0.4;
    for (let k = 0; k < archParts.length; k++) archParts[k].position.y = (k % 3 === 0 ? -0.025 : 0) * damage;
    const bc = Math.max(0, 1 - damage * 0.3); M.head.color.setScalar(bc * 0.9);
  }
  function setDirt(amount = 0, colorHex = 0x6b5a44) {
    U.uDirt.value = Math.min(1, Math.max(0, amount));
    U.uDirtCol.value.set(colorHex);
  }
  function flame() {
    flameSpr.visible = true; flameSpr.material.rotation = Math.random() * TAU;
    const s = 0.35 + Math.random() * 0.3; flameSpr.scale.set(s * 1.4, s, 1); flameLight.intensity = 6;
    clearTimeout(flameT);
    flameT = setTimeout(() => { flameSpr.visible = false; flameLight.intensity = 0; }, 60);
  }
  function dispose() {
    clearTimeout(flameT);
    for (const d of disposables) if (d && d.dispose && !(d.userData && d.userData.shared)) d.dispose();
    for (const m of Object.values(M)) if (m && m.dispose) m.dispose();
    group.removeFromParent(); wheels.forEach((w) => w.removeFromParent());
  }
  setLights({});
  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return { group, wheels, headlights, setLights, setDamage, setDirt, exhaust, flame, dispose, quality: hi ? 'high' : 'low' };
}
