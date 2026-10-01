// world.js — builds the visible environment of a stage: sky, lights, fog, terrain (road corridor + far DEM),
// road surface, instanced roadside scenery, stage furniture, weather particles. Also exposes world.colliders.
import * as THREE from './vendor/three.module.js';

// ---------------------------------------------------------------- quality tiers
const QUALITY = {
  low:  { lat: 40, far: 2, dens: 0.25, budget: 3000,  shadows: false, fog: 0.6, flakes: 500,  lights: 0, ribs: 1 },
  med:  { lat: 55, far: 1, dens: 0.55, budget: 6500,  shadows: false, fog: 0.8, flakes: 1400, lights: 0, ribs: 1 },
  high: { lat: 60, far: 1, dens: 1.0,  budget: 12000, shadows: true,  fog: 1.0, flakes: 3000, lights: 4, ribs: 1 },
};

// ---------------------------------------------------------------- env looks
const ENV = {
  alpine_night:  { sky: [0x050a1c, 0x1a2848, 0x0a0f1e], fog: 0x0f172b, fogNear: 30, fogFar: 520, sunCol: 0x9fb4ff, sunI: 0.35, sunEl: 32, sunAz: 140, sunSize: 0.0009, hemiSky: 0x50669a, hemiGround: 0x1a2032, hemiI: 0.15, night: true, ground: [0xeef3f8, 0xd2dce8], verge: 0xc3ccd6, rock: 0x5a5852, snowy: true, tex: 'snow', wet: 0.3, weather: 'snow' },
  nordic_snow:   { sky: [0x6f9fd8, 0xe2ebf3, 0xe8eef3], fog: 0xd9e3ec, fogNear: 60, fogFar: 950, sunCol: 0xffe0b8, sunI: 1.7, sunEl: 8, sunAz: 200, sunSize: 0.0012, hemiSky: 0xd0e0ff, hemiGround: 0x7d8ca8, hemiI: 0.75, ground: [0xf6f8fb, 0xdfe7ef], verge: 0xe4eaf0, rock: 0x6a6c70, snowy: true, tex: 'snow', wet: 0.1, weather: 'snow' },
  nordic_summer: { sky: [0x3f7fcf, 0xbcd6ea, 0x9fb0a0], fog: 0xb7cbd9, fogNear: 120, fogFar: 1500, sunCol: 0xfff1d6, sunI: 2.3, sunEl: 38, sunAz: 160, sunSize: 0.0009, hemiSky: 0xbcd8ff, hemiGround: 0x4a5a30, hemiI: 0.8, ground: [0x4b6a2a, 0x6b7d3a], verge: 0x7b7656, rock: 0x77736a, tex: 'grass', wet: 0, weather: null },
  wales_overcast:{ sky: [0x6a7179, 0xa9afb4, 0x8a9096], fog: 0x99a0a5, fogNear: 35, fogFar: 620, sunCol: 0xdde3e8, sunI: 0.75, sunEl: 40, sunAz: 170, sunSize: 0.0, hemiSky: 0xc4cad0, hemiGround: 0x3d4630, hemiI: 1.05, ground: [0x4f6a2f, 0x6b6a3b], verge: 0x5b5a3e, rock: 0x6d6a64, tex: 'grass', wet: 0.8, weather: 'rain', clouds: 1 },
  savanna:       { sky: [0x6c9ccc, 0xead4aa, 0xc9a678], fog: 0xd6bf98, fogNear: 70, fogFar: 1100, sunCol: 0xffdfae, sunI: 2.4, sunEl: 30, sunAz: 240, sunSize: 0.0011, hemiSky: 0xe0d6c0, hemiGround: 0x7a4a28, hemiI: 0.7, ground: [0xb8915a, 0x9c6a3a], verge: 0xa0522d, rock: 0x8a6a50, tex: 'dirt', wet: 0, weather: 'dust' },
  mediterranean: { sky: [0x3d7fd6, 0xd2e4ef, 0xc8c0a8], fog: 0xc6d6e2, fogNear: 120, fogFar: 1500, sunCol: 0xfff2d8, sunI: 2.5, sunEl: 50, sunAz: 190, sunSize: 0.0009, hemiSky: 0xcfe4ff, hemiGround: 0x6c5c40, hemiI: 0.75, ground: [0x8a8458, 0xa89a72], verge: 0xb8a58a, rock: 0x9b9184, tex: 'rock', wet: 0, weather: null },
  corsica:       { sky: [0x3a7ad0, 0xc8dcea, 0x90a080], fog: 0xb5c9d6, fogNear: 100, fogFar: 1300, sunCol: 0xfff0d2, sunI: 2.2, sunEl: 45, sunAz: 150, sunSize: 0.0009, hemiSky: 0xc6dcff, hemiGround: 0x3c4a28, hemiI: 0.8, ground: [0x4a6430, 0x6a7440], verge: 0x857a5c, rock: 0x8a857c, tex: 'grass', wet: 0.1, weather: null },
  city_dusk:     { sky: [0x2b2452, 0xf08a52, 0x3a2a40], fog: 0x6e4c5c, fogNear: 80, fogFar: 900, sunCol: 0xffa060, sunI: 1.0, sunEl: 5, sunAz: 260, sunSize: 0.0016, hemiSky: 0x8a7aa8, hemiGround: 0x3a3030, hemiI: 0.6, ground: [0x7a7468, 0x8a8070], verge: 0x8a8478, rock: 0x8f877a, tex: 'rock', wet: 0.15, weather: null, dusk: true },
  rockies:       { sky: [0x2f6cc8, 0xc4dcef, 0xa0a8a8], fog: 0xbcd0e0, fogNear: 150, fogFar: 1800, sunCol: 0xfff4e0, sunI: 2.4, sunEl: 42, sunAz: 200, sunSize: 0.0009, hemiSky: 0xcce0ff, hemiGround: 0x5a5040, hemiI: 0.75, ground: [0x6a6846, 0x8a7a5a], verge: 0x9a8a70, rock: 0x8a8580, highSnow: 0.78, tex: 'rock', wet: 0, weather: null },
};

// ---------------------------------------------------------------- small math helpers
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function strSeed(s) { let h = 2166136261; for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619); return h >>> 0; }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; return h(i) * (1 - u) + h(i + 1) * u; }
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return (h(ix, iz) * (1 - ux) + h(ix + 1, iz) * ux) * (1 - uz) + (h(ix, iz + 1) * (1 - ux) + h(ix + 1, iz + 1) * ux) * uz;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

// ---------------------------------------------------------------- procedural canvas textures
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function toTex(c, { repeat = true, srgb = true, wrapS = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapT = THREE.RepeatWrapping; t.wrapS = wrapS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; }
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, rng, cols, smin, smax, alpha = 1, x0 = 0, x1 = 1) {
  for (let k = 0; k < n; k++) {
    g.globalAlpha = alpha * (0.35 + 0.65 * rng()); g.fillStyle = cols[(rng() * cols.length) | 0];
    const s = smin + (smax - smin) * rng(); g.fillRect((x0 + (x1 - x0) * rng()) * w, rng() * h, s, s);
  }
  g.globalAlpha = 1;
}
function detailTex(kind, rng) {
  const S = 256, [c, g] = mkCanvas(S, S);
  if (kind === 'snow') {
    g.fillStyle = 'rgb(238,242,248)'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 2500, rng, ['rgb(205,214,232)', 'rgb(220,228,240)'], 1, 4, 0.6);
    speckle(g, S, S, 500, rng, ['#ffffff'], 1, 1.5, 1);
  } else if (kind === 'grass') {
    g.fillStyle = 'rgb(212,212,212)'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 7000; k++) { const l = 140 + rng() * 115 | 0; g.fillStyle = `rgb(${l},${l},${l * 0.95 | 0})`; g.fillRect(rng() * S, rng() * S, 1, 2 + rng() * 4); }
  } else if (kind === 'dirt') {
    g.fillStyle = 'rgb(218,212,205)'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 3000, rng, ['rgb(175,165,155)', 'rgb(240,234,228)', 'rgb(195,185,175)'], 1, 6, 0.6);
  } else {
    g.fillStyle = 'rgb(212,212,212)'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 2500, rng, ['rgb(160,160,160)', 'rgb(240,240,240)', 'rgb(190,190,190)'], 1, 7, 0.6);
    g.strokeStyle = 'rgba(110,110,110,0.5)';
    for (let k = 0; k < 40; k++) { g.beginPath(); let x = rng() * S, y = rng() * S; g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  }
  const t = toTex(c); return t;
}
// Road texture: u = across width (0 = left edge), v = along road; one tile = ROAD_TEX_LEN metres.
const ROAD_TEX_LEN = 20;
function roadTex(kind, rng) {
  const W = 128, H = 512, [c, g] = mkCanvas(W, H), pxm = H / ROAD_TEX_LEN;
  const fill = (col) => { g.fillStyle = col; g.fillRect(0, 0, W, H); };
  const tracks = (col, wpx = 16) => { for (const u of [0.3, 0.7]) { const gr = g.createLinearGradient(u * W - wpx, 0, u * W + wpx, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u * W - wpx, 0, wpx * 2, H); } };
  const dashes = (col, a, len = 3, period = 10, w = 3) => { g.globalAlpha = a; g.fillStyle = col; for (let v = 0; v < H; v += period * pxm) g.fillRect(W / 2 - w / 2, v, w, len * pxm); g.globalAlpha = 1; };
  switch (kind) {
    case 'gravel':
      fill('#9b8a6e'); speckle(g, W, H, 7000, rng, ['#7d6e56', '#b3a284', '#8b7a5e', '#c4b59a'], 1, 2.5, 0.8);
      tracks('rgba(72,60,44,0.45)');
      speckle(g, W, H, 1500, rng, ['#cbbd9f', '#857560', '#a99878'], 2, 4, 0.9, 0, 0.13);
      speckle(g, W, H, 1500, rng, ['#cbbd9f', '#857560', '#a99878'], 2, 4, 0.9, 0.87, 1); break;
    case 'snow':
      fill('#e3e9ee'); speckle(g, W, H, 4000, rng, ['#cdd6e0', '#f4f7fa', '#d8e0ea'], 1, 3, 0.7);
      tracks('rgba(140,158,182,0.45)', 14);
      g.fillStyle = 'rgba(255,255,255,0.55)'; for (const u of [0.3, 0.7]) for (let k = 0; k < 6; k++) g.fillRect(u * W - 6 + rng() * 12, 0, 1, H); break;
    case 'tarmac': case 'city':
      fill(kind === 'city' ? '#36363a' : '#3c3c3f'); speckle(g, W, H, 6000, rng, ['#2c2c2e', '#4a4a4d', '#555558'], 1, 2, 0.7);
      tracks('rgba(18,18,20,0.30)');
      if (kind === 'city') { dashes('#f2f2f2', 0.85, 4, 10, 3); g.fillStyle = 'rgba(240,240,240,0.85)'; g.fillRect(5, 0, 3, H); g.fillRect(W - 8, 0, 3, H); }
      else { dashes('#f0f0e8', 0.55, 4, 12, 3); speckle(g, W, H, 400, rng, ['#3c3c3f'], 2, 4, 1, 0.47, 0.53); g.fillStyle = 'rgba(230,230,220,0.35)'; g.fillRect(4, 0, 2, H); g.fillRect(W - 6, 0, 2, H); }
      break;
    case 'dirt':
      fill('#a4562f'); speckle(g, W, H, 6000, rng, ['#8a4424', '#b86a40', '#7a3a1e', '#c27a4c'], 1, 2.5, 0.8);
      tracks('rgba(88,38,18,0.38)'); speckle(g, W, H, 900, rng, ['#c48a62', '#6e3a20'], 2, 4, 0.9, 0, 0.12); speckle(g, W, H, 900, rng, ['#c48a62', '#6e3a20'], 2, 4, 0.9, 0.88, 1); break;
    case 'mud':
      fill('#5b4a36'); speckle(g, W, H, 6000, rng, ['#4a3c2c', '#6c5a44', '#3e3224'], 1, 3, 0.8);
      tracks('rgba(32,24,16,0.5)', 18);
      for (let k = 0; k < 9; k++) { const u = rng() < 0.5 ? 0.3 : 0.7, y = rng() * H; g.fillStyle = 'rgba(64,66,64,0.9)'; g.beginPath(); g.ellipse(u * W + (rng() - 0.5) * 10, y, 8 + rng() * 10, 20 + rng() * 40, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(160,170,176,0.35)'; g.beginPath(); g.ellipse(u * W - 2, y - 4, 4, 10, 0, 0, 7); g.fill(); }
      break;
    case 'rocky':
      fill('#b5a387'); speckle(g, W, H, 6000, rng, ['#9c8a6e', '#cbbb9e', '#8a7a62'], 1, 3, 0.8);
      tracks('rgba(90,76,58,0.35)'); speckle(g, W, H, 700, rng, ['#d8ccb4', '#7a6a54', '#a89878'], 3, 6, 1); break;
    default: // neutral light base, tinted by vertex colours (snowtarmac / tarmacgravel)
      fill('#cfcfcf'); speckle(g, W, H, 6000, rng, ['#b8b8b8', '#e2e2e2', '#a8a8a8'], 1, 2.5, 0.8);
      tracks('rgba(0,0,0,0.20)'); dashes('#ffffff', 0.35, 4, 12, 3);
  }
  return toTex(c, { wrapS: false });
}
function bannerTex(text, bg, fg, w = 512, h = 96) {
  const [c, g] = mkCanvas(w, h); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `bold ${h * 0.62 | 0}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
  return toTex(c, { repeat: false });
}
function chevronTex() {
  const [c, g] = mkCanvas(128, 64); g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#d01818';
  for (let k = 0; k < 3; k++) { const x = 14 + k * 38; g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 18, 6); g.lineTo(x + 36, 32); g.lineTo(x + 18, 58); g.lineTo(x, 58); g.lineTo(x + 18, 32); g.closePath(); g.fill(); }
  return toTex(c, { repeat: false });
}
function stripeTex(a, b) { const [c, g] = mkCanvas(64, 4); for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? b : a; g.fillRect(k * 16, 0, 16, 4); } return toTex(c); }
function facadeTex(rng, floors, cols) {
  const W = 256, H = 256, [c, g] = mkCanvas(W, H), [c2, g2] = mkCanvas(W, H);
  g.fillStyle = '#f2ece2'; g.fillRect(0, 0, W, H); g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H);
  speckle(g, W, H, 1500, rng, ['#e2dbd0', '#fffaf2'], 1, 3, 0.5);
  const fh = H / floors, cw = W / cols;
  for (let f = 0; f < floors; f++) for (let k = 0; k < cols; k++) {
    const x = k * cw + cw * 0.25, y = f * fh + fh * 0.22, w = cw * 0.5, h = fh * 0.55;
    g.fillStyle = '#4a4e58'; g.fillRect(x, y, w, h); g.fillStyle = '#7a5a3a'; g.fillRect(x - 3, y, 3, h); g.fillRect(x + w, y, 3, h);
    if (rng() < 0.45) { const l = 0.6 + rng() * 0.4; g2.fillStyle = `rgba(255,${190 + rng() * 50 | 0},${110 + rng() * 60 | 0},${l})`; g2.fillRect(x, y, w, h); g.fillStyle = '#e8c890'; g.fillRect(x, y, w, h); }
  }
  g.fillStyle = '#c8bca8'; g.fillRect(0, 0, 6, 6); // top-left corner = plain wall for roofs
  return [toTex(c), toTex(c2)];
}
function spriteTex(kind) {
  const S = 64, [c, g] = mkCanvas(S, S);
  if (kind === 'streak') { const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(220,230,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(S / 2 - 1, 0, 2, S); }
  else { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(kind === 'glow' ? 0.15 : 0.4, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
  return toTex(c, { repeat: false });
}

// ---------------------------------------------------------------- sky dome
function buildSky(E, sunDir) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(E.sky[0]) }, horizon: { value: new THREE.Color(E.sky[1]) }, bottom: { value: new THREE.Color(E.sky[2]) },
      fogCol: { value: new THREE.Color(E.fog) }, sunDir: { value: sunDir.clone() }, sunCol: { value: new THREE.Color(E.night ? 0xe8eeff : E.sunCol) },
      sunSize: { value: E.night ? 0.00035 : E.sunSize }, night: { value: E.night ? 1 : 0 }, clouds: { value: E.clouds || (E.dusk ? 0.35 : 0.18) }, time: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 top, horizon, bottom, fogCol, sunDir, sunCol; uniform float sunSize, night, clouds, time; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int k=0;k<4;k++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.35));
        float sd = dot(d, normalize(sunDir));
        col += sunCol * pow(max(sd, 0.0), 8.0) * (night > 0.5 ? 0.08 : 0.35);
        float disk = smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.55, sd);
        if (night > 0.5 && h > 0.0) {
          vec2 sp = floor(d.xz / (d.y + 0.6) * 260.0); float st = h21(sp);
          col += vec3(0.85,0.9,1.0) * step(0.9965, st) * (0.5 + 0.5 * sin(time * 2.0 + st * 80.0)) * smoothstep(0.02, 0.25, h);
          // moon with a little shading
          col = mix(col, sunCol * (0.85 + 0.15 * vn(d.xz * 900.0)), disk);
        } else col += sunCol * disk * 3.0;
        if (h > 0.0 && clouds > 0.0) {
          vec2 cp = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.01, 0.0);
          float c = smoothstep(0.45 - clouds * 0.35, 0.95, fbm(cp));
          vec3 cc = night > 0.5 ? vec3(0.07,0.09,0.15) : mix(horizon * 1.05, vec3(1.0), 0.35) * (0.75 + 0.25 * pow(max(sd,0.0),4.0));
          col = mix(col, cc, c * smoothstep(0.0, 0.18, h) * min(1.0, clouds * 2.2));
        }
        col = mix(fogCol, col, smoothstep(-0.03, 0.14, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -1000; m.frustumCulled = false; m.name = 'sky';
  return m;
}

// ---------------------------------------------------------------- terrain colouring
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
function makeColorer(stage, E) {
  const g0 = new THREE.Color(E.ground[0]), g1 = new THREE.Color(E.ground[1]), rock = new THREE.Color(E.rock), verge = new THREE.Color(E.verge);
  const snowW = new THREE.Color(0xf4f7fb), shade = new THREE.Color(0.78, 0.85, 1.0), dry = new THREE.Color(0x9c8a5a);
  const hw = stage.halfW, ve = stage.vergeW;
  let hmin = Infinity, hmax = -Infinity; for (let i = 0; i < stage.grid.h.length; i++) { const v = stage.grid.h[i]; if (v < hmin) hmin = v; if (v > hmax) hmax = v; }
  const hr = Math.max(1, hmax - hmin);
  const rockA = E.snowy ? 0.42 : 0.26, rockB = E.snowy ? 0.66 : 0.5;
  return { hmin, hmax, rel: (h) => (h - hmin) / hr, color(out, x, z, h, ny, alat) {
    const n = noise2(x * 0.018, z * 0.018) * 0.65 + noise2(x * 0.09, z * 0.09) * 0.35;
    out.copy(g0).lerp(g1, n);
    if (!E.snowy && E.tex === 'grass') out.lerp(dry, smooth(0.6, 0.9, noise2(x * 0.006 + 9, z * 0.006)) * 0.35);
    const slope = 1 - ny;
    out.lerp(rock, smooth(rockA, rockB, slope + (n - 0.5) * 0.12));
    if (E.highSnow) { const r = (h - hmin) / hr + (n - 0.5) * 0.08; out.lerp(snowW, smooth(E.highSnow - 0.04, E.highSnow + 0.04, r) * (1 - smooth(0.45, 0.7, slope))); }
    out.lerp(verge, (1 - smooth(hw + ve + 0.3, hw + ve + 4.5, alat)) * 0.85);
    if (E.snowy) { _c3.setRGB(1, 1, 1).lerp(shade, clamp01(slope * 1.6 + (1 - n) * 0.25)); out.multiply(_c3); }
    const ao = 0.88 + 0.12 * noise2(x * 0.3, z * 0.3); out.multiplyScalar(ao);
    return out;
  } };
}

// ---------------------------------------------------------------- corridor terrain (high-res ribbon following the road)
function corridorOffsets(stage, Q) {
  const hw = stage.halfW, ve = stage.vergeW, e = hw + ve;
  const pos = [0, hw * 0.5, hw, e, e + 1.2, e + 2.3, e + 3.5, e + 5, e + 7, e + 9.5, e + 12.5, e + 16.5];
  for (const o of [22, 28, 35, 43, 51, 60]) if (o > pos[pos.length - 1] + 3 && o <= Q.lat) pos.push(o);
  if (pos[pos.length - 1] < Q.lat) pos.push(Q.lat);
  return pos.filter((o) => o <= Math.max(Q.lat, e + 16.5));
}
function buildCorridor(stage, E, Q, colorer, mat) {
  const N = stage.N, offs = corridorOffsets(stage, Q);
  const cols = []; for (let k = offs.length - 1; k > 0; k--) cols.push(-offs[k]); cols.push(...offs);
  const C = cols.length + 2; // + skirts
  const pos = new Float32Array(N * C * 3), uv = new Float32Array(N * C * 2), alat = new Float32Array(N * C);
  // inside-of-curve clamp so hairpins don't fold the ribbon
  const kmax = new Float32Array(N);
  for (let i = 0; i < N; i++) { let best = 0; for (let j = Math.max(0, i - 8); j <= Math.min(N - 1, i + 8); j++) if (Math.abs(stage.curv[j]) > Math.abs(best)) best = stage.curv[j]; kmax[i] = best; }
  const maxOut = offs[offs.length - 1];
  for (let i = 0; i < N; i++) {
    const x0 = stage.px[i], z0 = stage.pz[i], rx = -stage.tz[i], rz = stage.tx[i], k = kmax[i];
    const lim = Math.abs(k) > 1e-4 ? Math.max(stage.halfW + stage.vergeW + 3, 0.85 / Math.abs(k)) : 1e9;
    let v = i * C;
    for (let c = 0; c < C; c++, v++) {
      const cc = Math.min(cols.length - 1, Math.max(0, c - 1));
      let o = cols[cc];
      if (o * k > 0 && Math.abs(o) > lim) o = Math.sign(o) * lim; // k>0 turning right -> inside is right (+)
      const x = x0 + rx * o, z = z0 + rz * o;
      let h = stage.heightAt(x, z, i);
      alat[v] = Math.abs(stage._q.lat);
      if (c === 0 || c === C - 1) h -= 2.5; // skirt
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z; uv[v * 2] = x / 8; uv[v * 2 + 1] = z / 8;
    }
  }
  const idx = new Uint32Array((N - 1) * (C - 1) * 6); let p = 0;
  for (let i = 0; i < N - 1; i++) for (let c = 0; c < C - 1; c++) {
    const a = i * C + c, b = a + 1, d = a + C, e = d + 1;
    idx[p++] = a; idx[p++] = d; idx[p++] = b; idx[p++] = b; idx[p++] = d; idx[p++] = e;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  // ensure upward normals (winding may flip on left/right depending on tangent)
  const nrm = geo.attributes.normal.array;
  if (nrm[(Math.floor(C / 2)) * 3 + 1] < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } geo.computeVertexNormals(); }
  const col = new Float32Array(N * C * 3);
  for (let v = 0; v < N * C; v++) { colorer.color(_c1, pos[v * 3], pos[v * 3 + 2], pos[v * 3 + 1], nrm[v * 3 + 1], alat[v]); col[v * 3] = _c1.r; col[v * 3 + 1] = _c1.g; col[v * 3 + 2] = _c1.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = 'corridor';
  return m;
}

// ---------------------------------------------------------------- far terrain from DEM grid
function buildFarTerrain(stage, E, Q, colorer, mat) {
  const g = stage.grid, st = Q.far, nx = Math.floor((g.nx - 1) / st) + 1, nz = Math.floor((g.nz - 1) / st) + 1, step = g.step * st;
  const dist = new Float32Array(nx * nz).fill(1e9), ry = new Float32Array(nx * nz);
  const R = Q.lat + step * 1.5, rc = Math.ceil(R / step);
  for (let i = 0; i < stage.N; i += 2) {
    const fx = (stage.px[i] - g.x0) / step, fz = (stage.pz[i] - g.z0) / step, cx = Math.round(fx), cz = Math.round(fz);
    for (let z = Math.max(0, cz - rc); z <= Math.min(nz - 1, cz + rc); z++) for (let x = Math.max(0, cx - rc); x <= Math.min(nx - 1, cx + rc); x++) {
      const d = Math.hypot(x - fx, z - fz) * step, k = z * nx + x;
      if (d < dist[k]) { dist[k] = d; ry[k] = stage.py[i]; }
    }
  }
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const k = z * nx + x, wx = g.x0 + x * step, wz = g.z0 + z * step;
    let h = stage.terrainRaw(wx, wz) + (noise2(wx * 0.08, wz * 0.08) - 0.5) * 1.2 + (noise2(wx * 0.5, wz * 0.5) - 0.5) * 0.15;
    const d = dist[k];
    if (d < stage.halfW + stage.vergeW + 20) h = Math.min(h, ry[k]) - 3;
    else if (d < Q.lat - step * 0.5) h -= 1.5; else if (d < Q.lat + step) h -= 0.6; else h -= 0.3;
    pos[k * 3] = wx; pos[k * 3 + 1] = h; pos[k * 3 + 2] = wz; uv[k * 2] = wx / 8; uv[k * 2 + 1] = wz / 8;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let p = 0;
  for (let z = 0; z < nz - 1; z++) for (let x = 0; x < nx - 1; x++) { const a = z * nx + x, b = a + 1, c = a + nx, d = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal.array, col = new Float32Array(nx * nz * 3);
  for (let k = 0; k < nx * nz; k++) { colorer.color(_c1, pos[k * 3], pos[k * 3 + 2], pos[k * 3 + 1], nrm[k * 3 + 1], dist[k]); col[k * 3] = _c1.r; col[k * 3 + 1] = _c1.g; col[k * 3 + 2] = _c1.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = false; m.name = 'farTerrain';
  return m;
}

// ---------------------------------------------------------------- road surface ribbon
const SURF_TINT = { tarmac: [0.27, 0.27, 0.29], slush: [0.6, 0.64, 0.68], ice: [0.78, 0.86, 0.95], snow: [1.0, 1.0, 1.02], gravel: [0.82, 0.7, 0.54] };
function buildRoad(stage, E, rng) {
  const base = stage.meta.surface, N = stage.N, hw = stage.halfW;
  const kind = base === 'snowtarmac' || base === 'tarmacgravel' ? 'neutral' : base;
  const tex = roadTex(kind, rng);
  const tinted = kind === 'neutral';
  const us = [0, 0.08, 0.3, 0.5, 0.7, 0.92, 1];
  const C = us.length, pos = new Float32Array(N * C * 3), uv = new Float32Array(N * C * 2), col = new Float32Array(N * C * 3);
  for (let i = 0; i < N; i++) {
    const rx = -stage.tz[i], rz = stage.tx[i], s = stage.s[i];
    for (let c = 0; c < C; c++) {
      const v = i * C + c, lat = (us[c] * 2 - 1) * (hw + 0.05);
      const x = stage.px[i] + rx * lat, z = stage.pz[i] + rz * lat;
      pos[v * 3] = x; pos[v * 3 + 1] = stage.heightAt(x, z, i) + 0.025; pos[v * 3 + 2] = z;
      uv[v * 2] = us[c]; uv[v * 2 + 1] = s / ROAD_TEX_LEN;
      let t = [1, 1, 1];
      if (tinted) t = SURF_TINT[stage.surfaceAt(s, lat * 0.98)] || t;
      const n = 0.92 + 0.16 * noise1(s * 0.05 + c);
      col[v * 3] = t[0] * n; col[v * 3 + 1] = t[1] * n; col[v * 3 + 2] = t[2] * n;
    }
  }
  const idx = new Uint32Array((N - 1) * (C - 1) * 6); let p = 0;
  for (let i = 0; i < N - 1; i++) for (let c = 0; c < C - 1; c++) { const a = i * C + c, b = a + 1, d = a + C, e = d + 1; idx[p++] = a; idx[p++] = d; idx[p++] = b; idx[p++] = b; idx[p++] = d; idx[p++] = e; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  if (geo.attributes.normal.array[4] < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } geo.computeVertexNormals(); }
  geo.computeBoundingSphere();
  const wet = E.wet || 0;
  const rough = { tarmac: 0.75, city: 0.7, snow: 0.55, neutral: 0.6, mud: 0.5 }[kind] ?? 0.92;
  const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: Math.max(0.25, rough - wet * 0.35), metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = 'road';
  return m;
}
// city sidewalk / kerb strips (flat ribbon from road edge outwards)
function buildSidewalks(stage) {
  const N = stage.N, hw = stage.halfW, lats = [hw, hw + 0.25, hw + 0.25, hw + 3.2];
  const parts = [];
  for (const side of [-1, 1]) {
    const C = 4, pos = new Float32Array(N * C * 3), col = new Float32Array(N * C * 3);
    for (let i = 0; i < N; i++) {
      const rx = -stage.tz[i], rz = stage.tx[i], kerb = ((stage.s[i] / 1.5) | 0) % 2;
      for (let c = 0; c < C; c++) {
        const v = i * C + c, lat = side * lats[c], x = stage.px[i] + rx * lat, z = stage.pz[i] + rz * lat;
        pos[v * 3] = x; pos[v * 3 + 1] = stage.heightAt(x, z, i) + (c === 0 ? 0.03 : 0.12); pos[v * 3 + 2] = z;
        const cc = c < 2 ? (kerb ? [0.75, 0.1, 0.1] : [0.9, 0.9, 0.9]) : [0.55, 0.52, 0.48];
        col[v * 3] = cc[0]; col[v * 3 + 1] = cc[1]; col[v * 3 + 2] = cc[2];
      }
    }
    const idx = []; for (let i = 0; i < N - 1; i++) for (let c = 0; c < C - 1; c++) { if (c === 1) continue; const a = i * C + c, b = a + 1, d = a + C, e = d + 1; if (side > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    parts.push(geo);
  }
  return parts;
}

// ---------------------------------------------------------------- tiny low-poly prototype builder (merged, vertex coloured)
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function part(geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(_m4.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  const n = g.attributes.position.count, c = new Float32Array(n * 3), cc = new THREE.Color(color);
  for (let k = 0; k < n; k++) { c[k * 3] = cc.r; c[k * 3 + 1] = cc.g; c[k * 3 + 2] = cc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function merge(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o * 3); col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; p.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
const G = {
  cone: (r = 1, h = 1, s = 7) => new THREE.ConeGeometry(r, h, s, 1),
  cyl: (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s, 1),
  box: () => new THREE.BoxGeometry(1, 1, 1),
  ico: (d = 0) => new THREE.IcosahedronGeometry(1, d),
  dodec: () => new THREE.DodecahedronGeometry(1, 0),
};
function jitterGeo(g, amt, seed) { const r = mulberry(seed), p = g.attributes.position; const cache = new Map(); for (let k = 0; k < p.count; k++) { const key = p.getX(k).toFixed(3) + p.getY(k).toFixed(3) + p.getZ(k).toFixed(3); let d = cache.get(key); if (!d) cache.set(key, d = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]); p.setXYZ(k, p.getX(k) + d[0], p.getY(k) + d[1], p.getZ(k) + d[2]); } g.computeVertexNormals(); return g; }
// All prototypes are built at ~real size with origin at ground level.
function makeProtos(E) {
  const snowy = E.snowy, P = {};
  const trunk = 0x5a4030, pineC = snowy ? [0x24402e, 0x2c4a34] : [0x1f3d22, 0x2a4b26];
  const pine = (snow) => { const a = [part(G.cyl(0.18, 0.3, 4), trunk, 0, 2, 0)]; const L = [[3.2, 5, 3.2], [2.6, 4.5, 6.2], [1.9, 4, 9], [1.1, 3.2, 11.6]];
    L.forEach(([r, h, y], k) => { a.push(part(G.cone(r, h, 7), pineC[k % 2], 0, y, 0, 1, 1, 1, 0, k * 0.4)); if (snow) a.push(part(G.cone(r * 0.82, h * 0.42, 7), 0xf2f6fb, 0, y + h * 0.3, 0, 1, 1, 1, 0, k * 0.4 + 0.2)); }); return merge(a); };
  P.pine = { geo: pine(false), r: 0.3 }; P.snowpine = { geo: pine(true), r: 0.3 };
  P.spruce = { geo: merge([part(G.cyl(0.15, 0.25, 3), trunk, 0, 1.5, 0), part(G.cone(2.2, 13, 8), 0x1d3a26, 0, 8, 0), part(G.cone(1.6, 5, 8), 0x234630, 0, 4.5, 0)]), r: 0.25 };
  P.birch = { geo: merge([part(G.cyl(0.12, 0.18, 9), 0xe8e4dc, 0, 4.5, 0), part(jitterGeo(G.ico(1), 0.25, 3), 0x6c8f32, 0, 8.5, 0, 2.4, 3.4, 2.4), part(jitterGeo(G.ico(1), 0.25, 4), 0x7fa03a, 0.8, 7, 0.4, 1.6, 2, 1.6)]), r: 0.2 };
  P.broad = { geo: merge([part(G.cyl(0.25, 0.45, 5), 0x4a3828, 0, 2.5, 0), part(jitterGeo(G.ico(1), 0.3, 5), 0x3f6a26, 0, 7, 0, 4.2, 3.6, 4.2), part(jitterGeo(G.ico(1), 0.3, 6), 0x4c7a2c, 1.5, 8.5, -1, 2.6, 2.2, 2.6)]), r: 0.45 };
  P.acacia = { geo: merge([part(G.cyl(0.14, 0.25, 4.5), 0x5a4232, 0, 2.25, 0, 1, 1, 1, 0.08, 0, 0.06), part(G.cyl(0.1, 0.15, 2.5), 0x5a4232, 0.7, 4.6, 0, 1, 1, 1, 0, 0, -0.6), part(G.cyl(4.2, 3.2, 1.1, 9), 0x5e7a2c, 0.4, 5.6, 0), part(G.cyl(2.6, 2.2, 0.7, 7), 0x6d8a34, 1.2, 6.2, 0.6)]), r: 0.25 };
  P.olive = { geo: merge([part(G.cyl(0.25, 0.4, 2), 0x6a5a48, 0, 1, 0, 1, 1, 1, 0.15, 0, 0), part(jitterGeo(G.ico(1), 0.35, 7), 0x7d8a5e, 0, 3.3, 0, 2.6, 1.8, 2.6), part(jitterGeo(G.ico(1), 0.3, 8), 0x8a9468, 1, 3.8, 0.6, 1.5, 1.2, 1.5)]), r: 0.4 };
  P.cypress = { geo: merge([part(G.cyl(0.15, 0.2, 1), 0x4a3a2a, 0, 0.5, 0), part(G.ico(1), 0x23401f, 0, 6, 0, 1.3, 6, 1.3)]), r: 0.3 };
  P.palm = { geo: merge([part(G.cyl(0.18, 0.28, 10), 0x8a7458, 0, 5, 0, 1, 1, 1, 0.05, 0, 0), ...[0, 1, 2, 3, 4, 5, 6].map((k) => part(G.box(), 0x3d6b2a, Math.cos(k * 0.9) * 2, 9.8, Math.sin(k * 0.9) * 2, 4.4, 0.08, 0.9, 0, -k * 0.9, -0.35))]), r: 0.25 };
  const bushCol = { wales_overcast: 0x6a7a20, savanna: 0x7a7a3a, mediterranean: 0x5c6a3a, corsica: 0x4a6232, rockies: 0x5a6a40, nordic_summer: 0x3c5a26 }[E.key] || 0x4a5a30;
  P.bush = { geo: merge([part(jitterGeo(G.ico(1), 0.35, 9), bushCol, 0, 0.5, 0, 1.3, 0.9, 1.3), part(jitterGeo(G.ico(0), 0.3, 10), E.key === 'wales_overcast' ? 0xc8b020 : bushCol, 0.7, 0.6, 0.3, 0.8, 0.7, 0.8)]), r: 0 };
  P.rock = { geo: merge([part(jitterGeo(G.dodec(), 0.45, 11), E.rock, 0, 0.3, 0, 1.2, 0.8, 1)]), r: 0.9 };
  P.boulder = { geo: merge([part(jitterGeo(G.ico(1), 0.6, 12), E.rock, 0, 0.6, 0, 2.6, 1.8, 2.2), part(jitterGeo(G.dodec(), 0.5, 13), E.rock, 1.8, 0.2, 1, 1.2, 1, 1.1)]), r: 2.2 };
  P.snowpatch = { geo: merge([part(jitterGeo(G.ico(1), 0.3, 14), 0xf2f6fa, 0, -0.6, 0, 7, 1, 5)]), r: 0 };
  P.cottage = { geo: merge([part(G.box(), 0x8e2a1e, 0, 2, 0, 8, 4, 6), part(G.cyl(0, 4.7, 2.6, 4), 0x2e2a28, 0, 5.3, 0, 1.25, 1, 0.95, 0, Math.PI / 4, 0), part(G.box(), 0xf2efe8, 0, 1.6, 3.02, 1.2, 1.4, 0.05), part(G.box(), 0xf2efe8, 2.5, 1.6, 3.02, 1.2, 1.4, 0.05), part(G.box(), 0xf2efe8, 4.02, 2, 0, 0.05, 4, 6.1)]), r: 5 };
  P.haybale = { geo: merge([part(G.cyl(0.75, 0.75, 1.2, 10), 0xd8c070, 0, 0.75, 0, 1, 1, 1, Math.PI / 2, 0, 0)]), r: 0.8 };
  P.sheep = { geo: merge([part(G.box(), 0xe8e4da, 0, 0.7, 0, 1.1, 0.6, 0.6), part(G.box(), 0x2a2622, 0.65, 0.85, 0, 0.3, 0.3, 0.3), ...[[0.35, 0.22], [0.35, -0.22], [-0.35, 0.22], [-0.35, -0.22]].map(([a, b]) => part(G.box(), 0x2a2622, a, 0.2, b, 0.1, 0.4, 0.1))]), r: 0 };
  P.wall = { geo: merge([part(jitterGeo(new THREE.BoxGeometry(1, 1, 1, 3, 1, 1), 0.08, 15), E.key === 'alpine_night' || E.key === 'corsica' ? 0x8a8478 : 0x6e6a60, 0, 0.45, 0, 4.1, 0.9, 0.55)]), r: 0.35 };
  P.armco = { geo: merge([part(G.box(), 0xa8acb0, 0, 0.55, 0, 4.05, 0.32, 0.08), ...[-1.8, 0.2].map((x) => part(G.box(), 0x6a6e72, x, 0.35, 0.08, 0.12, 0.7, 0.12))]), r: 0.3 };
  P.concrete = { geo: merge([part(G.box(), 0xd8d8d4, 0, 0.5, 0, 4.05, 1.0, 0.6), part(G.box(), 0xc02020, 0, 0.9, 0, 4.06, 0.2, 0.61)]), r: 0.35 };
  P.pole = { geo: merge([0, 1, 2, 3].map((k) => part(G.cyl(0.05, 0.05, 0.4, 5), k % 2 ? 0xffffff : 0xd01818, 0, 0.2 + k * 0.4, 0))), r: 0.1 };
  P.tyres = { geo: merge([0, 1, 2].flatMap((k) => [part(G.cyl(0.38, 0.38, 0.26, 10), k % 2 ? 0xf0f0f0 : 0xc81818, -0.4, 0.13 + k * 0.26, 0), part(G.cyl(0.38, 0.38, 0.26, 10), k % 2 ? 0xc81818 : 0xf0f0f0, 0.4, 0.13 + k * 0.26, 0)])), r: 0.45 };
  P.person = { geo: merge([part(G.box(), 0x2a2f3a, 0, 0.42, 0, 0.32, 0.84, 0.22), part(G.box(), 0xffffff, 0, 1.15, 0, 0.42, 0.64, 0.26), part(G.ico(0), 0xe0b090, 0, 1.62, 0, 0.13, 0.15, 0.13)]), r: 0 };
  P.car = { geo: merge([part(G.box(), 0xffffff, 0, 0.6, 0, 4.2, 0.7, 1.8), part(G.box(), 0x202428, -0.2, 1.2, 0, 2.2, 0.55, 1.6), ...[[1.3, 0.85], [1.3, -0.85], [-1.3, 0.85], [-1.3, -0.85]].map(([a, b]) => part(G.cyl(0.32, 0.32, 0.22, 8), 0x111111, a, 0.32, b, 1, 1, 1, Math.PI / 2, 0, 0))]), r: 1.2 };
  P.lamppost = { geo: merge([part(G.cyl(0.08, 0.12, 8, 6), 0x2a2c30, 0, 4, 0), part(G.box(), 0x2a2c30, 0.9, 7.9, 0, 1.8, 0.1, 0.1)]), r: 0.15 };
  P.rockwall = { geo: merge([part(jitterGeo(new THREE.BoxGeometry(1, 1, 1, 3, 3, 1), 0.25, 16), E.rock, 0, 2.5, 0, 8.5, 6, 2.5)]), r: 1.2 };
  return P;
}

// ---------------------------------------------------------------- vegetation tables per env
const FLORA = {
  alpine_night:  { snowpine: 5, pine: 1.5, rock: 1.5, boulder: 0.4 },
  nordic_snow:   { snowpine: 7, spruce: 1.5, rock: 0.3 },
  nordic_summer: { pine: 4, spruce: 3, birch: 3, rock: 0.4, bush: 1 },
  wales_overcast:{ spruce: 3, bush: 3.5, rock: 0.6, broad: 0.5 },
  savanna:       { acacia: 2, bush: 4, rock: 2.2, boulder: 0.6 },
  mediterranean: { olive: 2, cypress: 0.8, bush: 5, rock: 2.4, boulder: 0.9 },
  corsica:       { broad: 5, pine: 1.5, bush: 2, rock: 1, cypress: 0.3 },
  rockies:       { pine: 5, spruce: 2, boulder: 1.5, rock: 2, bush: 1 },
  city_dusk:     {},
};
const DENSITY = { alpine_night: 0.8, nordic_snow: 1, nordic_summer: 1, wales_overcast: 0.7, savanna: 0.45, mediterranean: 0.6, corsica: 0.9, rockies: 0.55, city_dusk: 0 };
const TALL = new Set(['pine', 'snowpine', 'spruce', 'birch', 'broad', 'acacia', 'olive', 'cypress', 'palm']);

function placeScenery(stage, E, Q, P, rng, colorer) {
  const env = E.key, N = stage.N, hw = stage.halfW, ve = stage.vergeW, edge = hw + ve;
  const inst = new Map(), colliders = [], flares = [], lamps = [], tapes = [], CHUNK = 900;
  const colNear = hw + 12;
  const add = (key, i, x, y, z, ry, s = 1, col = -1, sy = s, sz = s) => {
    const k = key + '|' + Math.floor(stage.s[Math.min(N - 1, Math.max(0, i))] / CHUNK);
    let a = inst.get(k); if (!a) inst.set(k, a = { key, d: [] });
    a.d.push(x, y, z, ry, s, sy, sz, col);
  };
  const collide = (x, z, r, dist) => { if (r > 0 && dist - r < colNear) colliders.push({ x: +x.toFixed(2), z: +z.toFixed(2), r: +r.toFixed(2) }); };
  const along = (i) => Math.atan2(-stage.tz[i], stage.tx[i]);
  const ground = (x, z, i) => stage.heightAt(x, z, i);
  // generic "put a thing at road index i, lateral lat" with clearance test
  const put = (key, i, lat, clear, { ry = rng() * 6.283, s = 1, sy = s, col = -1, sink = 0.15, r } = {}) => {
    const x = stage.px[i] - stage.tz[i] * lat, z = stage.pz[i] + stage.tx[i] * lat;
    const q = stage.nearest(x, z, i), d = q.dist, qi = q.i;
    if (d < clear) return false;
    const y = ground(x, z, qi) - sink;
    add(key, i, x, y, z, ry, s, col, sy);
    collide(x, z, (r ?? P[key].r) * s, d);
    return true;
  };
  // segment-aligned chain objects (walls/barriers ~4 m long), with circle chain colliders
  const chain = (key, i, lat, len = 4) => {
    const x = stage.px[i] - stage.tz[i] * lat, z = stage.pz[i] + stage.tx[i] * lat;
    const q = stage.nearest(x, z, i); if (q.dist < Math.min(Math.abs(lat), edge) - 0.3) return;
    const y = ground(x, z, q.i) - 0.05, d = q.dist;
    add(key, i, x, y, z, along(i), 1);
    const r = P[key].r; if (d - r < colNear) for (let k = -1; k <= 1; k++) collide(x + stage.tx[i] * k * len * 0.33, z + stage.tz[i] * k * len * 0.33, Math.max(r, 0.55), d);
  };
  const maxLat = { low: 200, med: 280, high: 350 }[Q.name];
  const flora = FLORA[env] || {}, keys = Object.keys(flora), tot = keys.reduce((a, k) => a + flora[k], 0);
  // ---------- forest / scatter
  const nVeg = Math.round(Q.budget * 0.68 * (DENSITY[env] ?? 0.6));
  let placed = 0, tries = 0;
  while (placed < nVeg && tries < nVeg * 4 && tot > 0) {
    tries++;
    const i = (rng() * N) | 0, side = rng() < 0.5 ? -1 : 1, u = rng();
    const lat = side * (edge + 2.5 + (maxLat - edge) * u * u);
    const x = stage.px[i] - stage.tz[i] * lat, z = stage.pz[i] + stage.tx[i] * lat;
    const patch = noise2(x * 0.012, z * 0.012);
    let pick = rng() * tot, key = keys[0]; for (const k of keys) { pick -= flora[k]; if (pick <= 0) { key = k; break; } }
    const tall = TALL.has(key);
    if (tall && patch < (env === 'wales_overcast' ? 0.55 : env === 'savanna' ? 0.4 : 0.28)) continue;
    const clear = edge + (tall ? 3.5 : 2);
    const q = stage.nearest(x, z, i), d = q.dist; if (d < clear) continue;
    const y = ground(x, z, q.i), rel = colorer.rel(y);
    if (env === 'rockies' && tall && rel > 0.7) { key = rel > 0.8 && rng() < 0.4 ? 'snowpatch' : 'rock'; }
    const s = key === 'rock' ? 0.6 + rng() * 1.6 : key === 'boulder' ? 0.7 + rng() * 0.8 : 0.75 + rng() * 0.55;
    const col = tall ? new THREE.Color().setHSL(0, 0, 0.85 + rng() * 0.3).getHex() : -1;
    add(key, i, x, y - (tall ? 0.25 : 0.2 * s), z, rng() * 6.283, s, col, tall ? s * (0.85 + rng() * 0.35) : s * (0.7 + rng() * 0.5));
    collide(x, z, P[key].r * s, d);
    placed++;
  }
  if (env === 'rockies') for (let k = 0; k < Q.budget * 0.02; k++) { const i = (rng() * N) | 0; if (colorer.rel(stage.py[i]) > 0.65) put('snowpatch', i, (rng() < 0.5 ? -1 : 1) * (edge + 6 + rng() * 60), edge + 5, { s: 0.6 + rng(), sink: 0 }); }
  // ---------- env structures
  const nordic = env === 'nordic_snow' || env === 'nordic_summer';
  if (nordic || env === 'wales_overcast') {
    const nc = Math.round(10 * Q.dens) + 2;
    for (let k = 0; k < nc; k++) { const i = (rng() * N) | 0, side = rng() < 0.5 ? -1 : 1; if (nordic) put('cottage', i, side * (edge + 20 + rng() * 60), edge + 15, { ry: along(i) + (rng() < 0.5 ? 0 : 1.5708), sink: 0.3 }); }
    for (let k = 0; k < 30 * Q.dens; k++) { const i = (rng() * N) | 0, side = rng() < 0.5 ? -1 : 1; put('haybale', i, side * (edge + 8 + rng() * 40), edge + 6, { s: 0.9 + rng() * 0.2, sink: 0.1 }); }
  }
  if (env === 'wales_overcast') {
    for (let k = 0; k < 40 * Q.dens; k++) { const i = (rng() * N) | 0, lat = (rng() < 0.5 ? -1 : 1) * (edge + 15 + rng() * 120); const n = 3 + (rng() * 8 | 0); for (let j = 0; j < n; j++) put('sheep', Math.min(N - 1, i + (rng() * 6 | 0)), lat + (rng() - 0.5) * 12, edge + 8, { s: 0.9 + rng() * 0.2, sink: 0 }); }
    // dry-stone walls following the road at field boundaries
    for (let st = 0; st < N; st += 80 + (rng() * 80 | 0)) { const side = rng() < 0.5 ? -1 : 1, lat = side * (edge + 6 + rng() * 10), len = 20 + (rng() * 40 | 0); for (let j = st; j < Math.min(N, st + len); j++) chain('wall', j, lat); }
  }
  if (env === 'mediterranean' || env === 'corsica' || env === 'alpine_night') {
    // guard walls on the drop side, rock walls on the uphill side
    const key = env === 'alpine_night' ? 'wall' : 'wall';
    for (let i = 0; i < N; i++) {
      const ry0 = stage.py[i], lx = stage.px[i] - stage.tz[i] * (edge + 10), lz = stage.pz[i] + stage.tx[i] * (edge + 10), rxp = stage.px[i] + stage.tz[i] * (edge + 10), rzp = stage.pz[i] - stage.tx[i] * (edge + 10);
      const dl = stage.terrainRaw(lx, lz) - ry0, dr = stage.terrainRaw(rxp, rzp) - ry0; // lat + = (-tz, tx) direction
      if (env !== 'mediterranean' || i % 3 === 0) { if (dl < -3) chain(key, i, edge + 0.4); if (dr < -3) chain(key, i, -(edge + 0.4)); }
      if (env === 'alpine_night' && i % 2 === 0) { if (dl > 6) chain('rockwall', i, edge + 4.5, 8); if (dr > 6) chain('rockwall', i, -(edge + 4.5), 8); }
    }
  }
  // ---------- city (Monaco)
  if (env === 'city_dusk') {
    const sides = [-1, 1];
    for (const side of sides) {
      let s = 0;
      while (s < stage.length) {
        const w = 10 + rng() * 14, h = 12 + rng() * 28, dep = 10 + rng() * 8;
        const p = stage.pointAtS(s + w / 2), i = p.i, k = Math.abs(stage.curv[i]);
        const lat = side * (hw + 4.2 + dep / 2);
        // reject if any corner would reach the road
        const cs = [[-w / 2, -dep / 2], [w / 2, -dep / 2], [-w / 2, dep / 2], [w / 2, dep / 2], [0, -dep / 2]];
        let ok = k < 0.08;
        for (const [a, b] of cs) { if (!ok) break; const x = p.x + p.tx * a + p.rx * (lat + b), z = p.z + p.tz * a + p.rz * (lat + b); if (stage.nearest(x, z, i).dist < hw + 3.6) ok = false; }
        if (ok) {
          const x = p.x + p.rx * lat, z = p.z + p.rz * lat, y = ground(p.x + p.rx * (hw + 3), p.z + p.rz * (hw + 3), i) - 0.5;
          add('building', i, x, y, z, along(i), w, PASTEL[(rng() * PASTEL.length) | 0], h, dep);
          for (let a = -w / 2; a <= w / 2; a += 3) { const cx = p.x + p.tx * a + p.rx * side * (hw + 4.8), cz = p.z + p.tz * a + p.rz * side * (hw + 4.8); collide(cx, cz, 0.8, stage.nearest(cx, cz, i).dist); }
        }
        s += w + (ok ? 0.5 + rng() * 2 : 4);
      }
    }
    for (let i = 0; i < N; i++) {
      const tight = Math.abs(stage.curv[i]) > 1 / 30;
      for (const side of sides) chain(tight ? 'concrete' : 'armco', i, side * (hw + 0.45));
      if (tight && i % 2 === 0) { const out = stage.curv[i] > 0 ? -1 : 1; put('tyres', i, out * (hw + 1.3), hw + 0.9, { ry: along(i), sink: 0 }); }
    }
    for (let s = 10, k = 0; s < stage.length; s += 32, k++) { const i = stage.indexAtS(s).i, side = k % 2 ? 1 : -1; if (put('lamppost', i, side * (hw + 2.4), hw + 2, { ry: Math.atan2(side * stage.tx[i], side * stage.tz[i]), sink: 0 })) { const x = stage.px[i] - stage.tz[i] * side * (hw + 0.6), z = stage.pz[i] + stage.tx[i] * side * (hw + 0.6); lamps.push(x, ground(x, z, i) + 7.8, z, s); } }
    for (let k = 0; k < 60 * Q.dens + 10; k++) { const i = (rng() * N) | 0; put('palm', i, (rng() < 0.5 ? -1 : 1) * (hw + 1.8 + rng()), hw + 1.5, { s: 0.8 + rng() * 0.4, sink: 0 }); }
    for (let k = 0; k < 40 * Q.dens + 6; k++) { const i = (rng() * N) | 0; put('car', i, (rng() < 0.5 ? -1 : 1) * (hw + 2.0), hw + 1.6, { ry: along(i), col: CARCOL[(rng() * CARCOL.length) | 0], sink: 0 }); }
  }
  // ---------- all stages: marker poles, chevrons, hairpin furniture, spectators
  for (let s = 0, k = 0; s < stage.length; s += 50, k++) {
    const i = stage.indexAtS(s).i;
    if (env !== 'city_dusk') put('pole', i, (k % 2 ? 1 : -1) * (edge + 0.6), edge + 0.3, { ry: 0, sink: 0 });
  }
  const chev = [];
  for (let i = 2, last = -99; i < N - 2; i++) {
    const c = stage.curv[i]; if (Math.abs(c) < 1 / 25 || stage.s[i] - last < 14) continue;
    last = stage.s[i];
    const out = c > 0 ? -1 : 1, lat = out * (edge + 1.4);
    const x = stage.px[i] - stage.tz[i] * lat, z = stage.pz[i] + stage.tx[i] * lat;
    if (stage.nearest(x, z, i).dist < edge + 0.8) continue;
    // board faces back toward approaching traffic & road centre
    const fx = -stage.tx[i] * 0.8 - (-stage.tz[i] * out) * 0.6, fz = -stage.tz[i] * 0.8 - stage.tx[i] * out * 0.6;
    chev.push(x, ground(x, z, i), z, Math.atan2(fx, fz), c > 0 ? 1 : -1);
    collide(x, z, 0.3, stage.nearest(x, z, i).dist);
  }
  // hairpins: local maxima of |curv| above 1/15
  const pins = [];
  for (let i = 3; i < N - 3; i++) { const a = Math.abs(stage.curv[i]); if (a > 1 / 15 && a >= Math.abs(stage.curv[i - 1]) && a >= Math.abs(stage.curv[i + 1]) && (!pins.length || stage.s[i] - stage.s[pins[pins.length - 1]] > 120)) pins.push(i); }
  for (const i of pins) {
    const out = stage.curv[i] > 0 ? -1 : 1;
    for (let j = -4; j <= 4; j++) { const ii = Math.min(N - 1, Math.max(0, i + j)); put(env === 'city_dusk' ? 'tyres' : (j & 1 ? 'haybale' : 'tyres'), ii, out * (edge + 1.8), edge + 1.2, { ry: along(ii) + 1.5708, sink: 0 }); }
  }
  // spectator spots: hairpins first, then random, plus start & finish
  const spots = pins.slice(0, 8).map((i) => [i, stage.curv[i] > 0 ? 1 : -1]); // inside of hairpin = safer viewing
  for (let k = 0; k < 5; k++) spots.push([(rng() * (N - 40) + 20) | 0, rng() < 0.5 ? -1 : 1]);
  spots.push([stage.indexAtS(stage.startS + 12).i, 1], [stage.indexAtS(stage.finishS + 10).i, -1]);
  const crowdN = Math.round((env === 'city_dusk' ? 40 : 28) * (0.4 + Q.dens * 0.6));
  for (const [i0, side] of spots) {
    const base = edge + (env === 'city_dusk' ? 2.2 : 4.5);
    for (let k = 0; k < crowdN; k++) {
      const i = Math.min(N - 1, Math.max(0, i0 + ((rng() - 0.5) * 14 | 0)));
      const ok = put('person', i, side * (base + rng() * 5), base - 0.5, { s: 0.9 + rng() * 0.2, col: SHIRT[(rng() * SHIRT.length) | 0], sink: 0, ry: along(i) + (side > 0 ? 1.5708 : -1.5708) + (rng() - 0.5) });
      if (ok && E.night && rng() < 0.12) { const x = stage.px[i] - stage.tz[i] * side * (base + 0.3), z = stage.pz[i] + stage.tx[i] * side * (base + 0.3); flares.push(x, ground(x, z, i) + 1.6, z); }
    }
    tapes.push([i0 - 9, i0 + 9, side * (base - 1.2)]);
  }
  return { inst, colliders, flares, lamps, tapes, chev };
}
const PASTEL = [0xf2d6b0, 0xf4c7a1, 0xe9b8a0, 0xf6e3b4, 0xd9c7a8, 0xf0d0c8, 0xe8d8c0, 0xc8d8c8, 0xf4e8d8, 0xe0b090];
const CARCOL = [0xc81818, 0x1a3a8a, 0xf0f0f0, 0x202020, 0x8a8a8a, 0xd8b030, 0x2a6a3a];
const SHIRT = [0xd02020, 0x2050c0, 0xf0c020, 0x20a040, 0xf07020, 0xffffff, 0x303030, 0x8020a0, 0x30b0d0, 0xe85090];

// ---------------------------------------------------------------- instanced meshes from placement data
function buildingMaterial(rng) {
  const [map, emi] = facadeTex(rng, 4, 4);
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.85 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec2 bsc = vec2(abs(normal.x) > 0.5 ? length(instanceMatrix[2].xyz) : length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz)) / 12.0;
        vec2 buv = abs(normal.y) > 0.5 ? vec2(0.01, 0.99) : uv * bsc;
        vMapUv = buv; vEmissiveMapUv = buv;
      #endif`);
  };
  return mat;
}
function buildInstances(group, data, P, Q, E, mats, rng, disposables) {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0); disposables.push(boxGeo);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const meshes = [];
  for (const { key, d } of data.inst.values()) {
    const n = d.length / 8; if (!n) continue;
    const isB = key === 'building';
    const geo = isB ? boxGeo : P[key].geo;
    const mat = isB ? (mats.building ||= buildingMaterial(rng)) : key === 'person' ? mats.person : mats.prop;
    const im = new THREE.InstancedMesh(geo, mat, n);
    let hasCol = false;
    for (let k = 0; k < n; k++) {
      const o = k * 8;
      p.set(d[o], d[o + 1], d[o + 2]); q.setFromAxisAngle(up, d[o + 3]); s.set(d[o + 4], d[o + 5], isB ? d[o + 6] : d[o + 4]);
      if (!isB && d[o + 6] !== d[o + 4]) s.z = d[o + 6];
      im.setMatrixAt(k, m.compose(p, q, s));
      const col = d[o + 7];
      if (col >= 0) hasCol = true;
      im.setColorAt(k, col >= 0 ? c.setHex(col) : c.setRGB(1, 1, 1));
    }
    if (!hasCol) im.instanceColor = null;
    im.computeBoundingSphere();
    im.castShadow = Q.shadows && (TALL.has(key) || isB || key === 'cottage' || key === 'rockwall');
    im.receiveShadow = Q.shadows && (isB || key === 'cottage');
    im.userData.full = n; im.userData.veg = TALL.has(key) || key === 'bush' || key === 'rock';
    im.name = 'inst:' + key;
    group.add(im); meshes.push(im);
  }
  return meshes;
}

// ---------------------------------------------------------------- stage furniture: arches, boards, chevrons, tape, flares
function buildFurniture(group, stage, E, data, mats, colliders, disposables) {
  const hw = stage.halfW, edge = hw + stage.vergeW;
  const texs = [];
  const board = (text, bg, fg, s, lat, h, w, bh, archSpan) => {
    const pnt = stage.pointAtS(s), i = pnt.i, tex = bannerTex(text, bg, fg); texs.push(tex);
    const yaw = Math.atan2(-pnt.tx, -pnt.tz); // board normal faces oncoming traffic
    const g = new THREE.Group();
    const bx = pnt.x + pnt.rx * lat, bz = pnt.z + pnt.rz * lat;
    const by = stage.heightAt(bx, bz, i);
    g.position.set(bx, by, bz); g.rotation.y = yaw;
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: E.night || E.dusk ? 0xffffff : 0x000000, emissiveMap: E.night || E.dusk ? tex : null, emissiveIntensity: 0.35 });
    disposables.push(face);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, bh, 0.15), [mats.post, mats.post, mats.post, mats.post, face, face]);
    panel.position.y = h; panel.castShadow = true; g.add(panel);
    const legs = archSpan ? [-archSpan, archSpan] : [-w * 0.35, w * 0.35];
    for (const lx of legs) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(archSpan ? 0.6 : 0.12, h + bh / 2, archSpan ? 0.6 : 0.12), mats.post);
      leg.position.set(lx, (h + bh / 2) / 2, 0); leg.castShadow = true; g.add(leg);
      const wx = bx - pnt.tz * 0 + Math.cos(yaw) * lx, wz = bz - Math.sin(yaw) * lx;
      colliders.push({ x: +wx.toFixed(2), z: +wz.toFixed(2), r: archSpan ? 0.5 : 0.15 });
    }
    group.add(g);
  };
  const span = hw + 1.6;
  board('START', '#1a3a9a', '#ffffff', stage.startS, 0, 5.2, span * 2 + 0.6, 1.4, span);
  board('FINISH', '#c81818', '#ffffff', stage.finishS, 0, 5.2, span * 2 + 0.6, 1.4, span);
  board('FLYING FINISH', '#f0c020', '#111111', Math.max(stage.startS + 50, stage.finishS - 100), edge + 1.5, 2.2, 3.2, 0.7, 0);
  stage.splitS.forEach((ss, k) => board('SPLIT ' + (k + 1), '#ffffff', '#c81818', ss, -(edge + 1.5), 2.2, 2.6, 0.7, 0));
  // timing beam lines across the road at start/finish
  for (const ss of [stage.startS, stage.finishS]) {
    const pnt = stage.pointAtS(ss), line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 0.5), mats.line);
    line.rotation.set(-Math.PI / 2, 0, 0); line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.atan2(-pnt.tx, -pnt.tz));
    line.position.set(pnt.x, stage.heightAt(pnt.x, pnt.z, pnt.i) + 0.04, pnt.z); group.add(line);
  }
  // chevrons (instanced quads on posts)
  const nC = data.chev.length / 5;
  if (nC) {
    const cg = new THREE.PlaneGeometry(1.6, 0.8); cg.translate(0, 1.5, 0); disposables.push(cg);
    const ct = chevronTex(); texs.push(ct);
    const cm = new THREE.MeshStandardMaterial({ map: ct, side: THREE.DoubleSide, roughness: 0.5, emissive: 0xffffff, emissiveMap: ct, emissiveIntensity: E.night ? 0.25 : 0.05 }); disposables.push(cm);
    const im = new THREE.InstancedMesh(cg, cm, nC), post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.2, 0.08).translate(0, 0.6, 0), mats.post, nC);
    disposables.push(post.geometry);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < nC; k++) { const o = k * 5; p.set(data.chev[o], data.chev[o + 1], data.chev[o + 2]); q.setFromAxisAngle(up, data.chev[o + 3]); im.setMatrixAt(k, m.compose(p, q, s.set(data.chev[o + 4], 1, 1))); post.setMatrixAt(k, m.compose(p, q, s.set(1, 1, 1))); }
    im.computeBoundingSphere(); post.computeBoundingSphere(); group.add(im, post);
  }
  // spectator tape: stripe ribbon on stakes along each crowd area
  const tp = [], tuv = [], tidx = [];
  for (const [a, b, lat] of data.tapes) {
    const base = tp.length / 3; let n = 0;
    for (let i = Math.max(0, a); i <= Math.min(stage.N - 1, b); i++, n++) {
      const x = stage.px[i] - stage.tz[i] * lat, z = stage.pz[i] + stage.tx[i] * lat, y = stage.heightAt(x, z, i);
      tp.push(x, y + 0.85, z, x, y + 0.95, z); tuv.push(stage.s[i] / 4, 0, stage.s[i] / 4, 1);
      if (n) { const v = base + (n - 1) * 2; tidx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
    }
  }
  if (tidx.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2)); g.setIndex(tidx); g.computeVertexNormals();
    const tt = stripeTex('#d81818', '#f4f4f4'); texs.push(tt);
    const tm = new THREE.MeshBasicMaterial({ map: tt, side: THREE.DoubleSide, fog: true }); disposables.push(tm);
    group.add(new THREE.Mesh(g, tm));
  }
  disposables.push(...texs);
}
function glowPoints(arr, color, size, tex) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeBoundingSphere();
  const m = new THREE.PointsMaterial({ color, size, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true });
  return new THREE.Points(g, m);
}

// ---------------------------------------------------------------- weather particles (GPU-animated, wraps around camera)
function buildWeather(kind, count, tex) {
  const cfg = {
    snow: { box: 60, h: 30, fall: 1.6, drift: 0.8, size: 0.16, color: 0xffffff, op: 0.9 },
    snow_light: { box: 60, h: 30, fall: 1.2, drift: 0.6, size: 0.14, color: 0xe8eeff, op: 0.8 },
    rain: { box: 40, h: 22, fall: 14, drift: 0.2, size: 0.7, color: 0xb8c4d0, op: 0.45 },
    dust: { box: 120, h: 18, fall: -0.05, drift: 2.5, size: 5.0, color: 0xd8b888, op: 0.07 },
  }[kind];
  if (!cfg) return null;
  const pos = new Float32Array(count * 3), r = mulberry(99);
  for (let k = 0; k < pos.length; k++) pos[k] = r();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: cfg.box }, uH: { value: cfg.h }, uFall: { value: cfg.fall }, uDrift: { value: cfg.drift }, uSize: { value: cfg.size }, uColor: { value: new THREE.Color(cfg.color) }, uOp: { value: cfg.op }, uMap: { value: tex }, uScale: { value: 600 } },
    vertexShader: `uniform vec3 uCam; uniform float uTime, uBox, uH, uFall, uDrift, uSize, uScale; varying float vA;
      void main(){
        vec3 b = vec3(uBox, uH, uBox);
        vec3 p = position * b;
        float sp = 0.7 + 0.6 * fract(position.x * 91.7);
        p.y -= uTime * uFall * sp;
        p.x += sin(uTime * 0.7 + position.z * 30.0) * uDrift + uTime * uDrift * 0.3;
        p.z += cos(uTime * 0.5 + position.x * 30.0) * uDrift;
        vec3 w = mod(p - uCam, b) - 0.5 * b;
        vA = (1.0 - smoothstep(0.35, 0.5, abs(w.x) / uBox)) * (1.0 - smoothstep(0.35, 0.5, abs(w.z) / uBox)) * (1.0 - smoothstep(0.38, 0.5, abs(w.y) / uH));
        vec4 mv = modelViewMatrix * vec4(uCam + w, 1.0);
        gl_PointSize = clamp(uSize * uScale / -mv.z, 1.0, 64.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; uniform float uOp; varying float vA;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * uOp * vA); if (gl_FragColor.a < 0.01) discard; }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 10; pts.name = 'weather:' + kind;
  return pts;
}

// ================================================================= main entry
export async function buildWorld(scene, stage, { quality = 'high', renderer } = {}) {
  const t0 = performance.now();
  const envKey = ENV[stage.meta.env] ? stage.meta.env : 'nordic_summer';
  const E = { ...ENV[envKey], key: envKey };
  let Q = { ...(QUALITY[quality] || QUALITY.high), name: QUALITY[quality] ? quality : 'high' };
  const rng = mulberry(strSeed(stage.meta.id || 'stage'));
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ---- sky, fog, lights
  const el = THREE.MathUtils.degToRad(E.sunEl), az = THREE.MathUtils.degToRad(E.sunAz);
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  const sky = buildSky(E, sunDir); root.add(sky); track(sky.geometry); track(sky.material);
  const fogColor = new THREE.Color(E.fog), skyColor = new THREE.Color(E.sky[1]);
  scene.fog = new THREE.Fog(fogColor.clone(), E.fogNear * Q.fog, E.fogFar * Q.fog);
  scene.background = fogColor.clone();
  const hemi = new THREE.HemisphereLight(E.hemiSky, E.hemiGround, E.hemiI); root.add(hemi);
  const sun = new THREE.DirectionalLight(E.sunCol, E.sunI);
  sun.position.copy(sunDir).multiplyScalar(120); root.add(sun); root.add(sun.target);
  const setupShadows = () => {
    sun.castShadow = !!Q.shadows;
    if (Q.shadows) {
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera; c.left = -80; c.right = 80; c.top = 80; c.bottom = -80; c.near = 1; c.far = 400; c.updateProjectionMatrix();
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    }
  };
  setupShadows();
  if (renderer) { renderer.shadowMap.enabled = !!Q.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = E.night ? 1.15 : 1.0; }

  // ---- terrain
  const colorer = makeColorer(stage, E);
  const gTex = track(detailTex(E.snowy ? 'snow' : E.tex, rng));
  const terrainMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, map: gTex, roughness: E.snowy ? 0.8 : 0.95, metalness: 0 }));
  const corridor = buildCorridor(stage, E, Q, colorer, terrainMat); root.add(corridor); track(corridor.geometry);
  const far = buildFarTerrain(stage, E, Q, colorer, terrainMat); root.add(far); track(far.geometry);
  await new Promise((r) => setTimeout(r, 0));

  // ---- road
  const road = buildRoad(stage, E, rng); root.add(road); track(road.geometry); track(road.material); track(road.material.map);
  if (stage.meta.surface === 'city') {
    const sm = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    for (const g of buildSidewalks(stage)) { const m = new THREE.Mesh(g, sm); m.receiveShadow = true; root.add(m); track(g); }
  }

  // ---- scenery
  const P = makeProtos(E);
  for (const k in P) track(P[k].geo);
  const mats = {
    prop: track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })),
    person: track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })),
    post: track(new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.7 })),
    line: track(new THREE.MeshBasicMaterial({ color: 0xf4f4f4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
  };
  const data = placeScenery(stage, E, Q, P, rng, colorer);
  const colliders = data.colliders;
  const instGroup = new THREE.Group(); instGroup.name = 'scenery'; root.add(instGroup);
  const instMeshes = buildInstances(instGroup, data, P, Q, E, mats, rng, disposables);
  if (mats.building) { track(mats.building); track(mats.building.map); track(mats.building.emissiveMap); }
  buildFurniture(root, stage, E, data, mats, colliders, disposables);

  // ---- emissive points: flares (night), street lamps (city)
  const glowTex = track(spriteTex('glow'));
  let flarePts = null, lampPts = null;
  if (data.flares.length) { flarePts = glowPoints(data.flares, 0xff4020, 2.4, glowTex); root.add(flarePts); track(flarePts.geometry); track(flarePts.material); }
  const lampXYZ = []; for (let k = 0; k < data.lamps.length; k += 4) lampXYZ.push(data.lamps[k], data.lamps[k + 1], data.lamps[k + 2]);
  if (lampXYZ.length) { lampPts = glowPoints(lampXYZ, 0xffd090, 3.0, glowTex); root.add(lampPts); track(lampPts.geometry); track(lampPts.material); }
  // real point lights (pool), repositioned to nearest lamps/flares around the focus in update()
  const lightSrc = lampXYZ.length ? lampXYZ : data.flares;
  const pool = [];
  const nLights = Math.min(Q.lights, lightSrc.length / 3);
  for (let k = 0; k < (QUALITY.high.lights); k++) {
    const l = new THREE.PointLight(lampXYZ.length ? 0xffc080 : 0xff5020, 0, lampXYZ.length ? 28 : 16, 2);
    l.visible = k < nLights; root.add(l); pool.push(l);
  }

  // ---- weather
  const wKind = envKey === 'alpine_night' ? 'snow_light' : E.weather;
  const wTex = track(spriteTex(wKind === 'rain' ? 'streak' : 'soft'));
  let weather = buildWeather(wKind, Q.flakes, wTex);
  if (weather) { root.add(weather); track(weather.geometry); track(weather.material); }

  // ---- quality switching
  const applyQuality = (q) => {
    Q = { ...(QUALITY[q] || QUALITY.high), name: QUALITY[q] ? q : 'high' };
    const frac = Q.dens;
    for (const im of instMeshes) { im.count = im.userData.veg ? Math.max(1, Math.round(im.userData.full * frac)) : im.userData.full; im.castShadow = Q.shadows && im.userData.veg; }
    scene.fog.near = E.fogNear * Q.fog; scene.fog.far = E.fogFar * Q.fog;
    setupShadows(); if (renderer) renderer.shadowMap.enabled = !!Q.shadows;
    corridor.receiveShadow = road.receiveShadow = !!Q.shadows;
    if (weather) weather.geometry.setDrawRange(0, Math.min(Q.flakes, weather.geometry.attributes.position.count));
    for (let k = 0; k < pool.length; k++) pool[k].visible = k < Math.min(Q.lights, lightSrc.length / 3);
  };
  // built at full instance count of the requested tier; nothing to trim initially
  if (weather) weather.geometry.setDrawRange(0, Q.flakes);

  // ---- per-frame update (no allocations)
  const tmpV = new THREE.Vector3(), best = new Float32Array(8), bestD = new Float32Array(8);
  let time = 0, lightTimer = 0;
  const update = (dt, camera, focus) => {
    time += dt || 0;
    const cp = camera ? camera.position : focus;
    if (cp) { sky.position.copy(cp); }
    sky.material.uniforms.time.value = time;
    const f = focus || cp;
    if (f) {
      if (Q.shadows) {
        // snap to texel grid to avoid shimmering
        const snap = 160 / 2048; tmpV.set(Math.round(f.x / snap) * snap, f.y, Math.round(f.z / snap) * snap);
        sun.target.position.copy(tmpV); sun.position.copy(sunDir).multiplyScalar(150).add(tmpV);
        sun.target.updateMatrixWorld();
      } else { sun.target.position.copy(f); sun.position.copy(sunDir).multiplyScalar(150).add(f); }
    }
    if (weather && cp) { const u = weather.material.uniforms; u.uCam.value.copy(cp); u.uTime.value = time; if (renderer) u.uScale.value = renderer.domElement.height * 0.5 / Math.tan((camera?.fov || 60) * Math.PI / 360); }
    if (flarePts) flarePts.material.size = 2.2 + Math.sin(time * 23) * 0.3 + Math.sin(time * 7.3) * 0.3;
    // move the point-light pool to the nearest light sources (cheap linear scan, 4 Hz)
    lightTimer -= dt || 0;
    if (f && pool.length && lightTimer <= 0 && Q.lights > 0) {
      lightTimer = 0.25;
      const n = Math.min(Q.lights, lightSrc.length / 3);
      for (let k = 0; k < n; k++) { bestD[k] = 1e12; best[k] = -1; }
      for (let j = 0; j < lightSrc.length; j += 3) {
        const dx = lightSrc[j] - f.x, dz = lightSrc[j + 2] - f.z, d = dx * dx + dz * dz;
        let w = -1, wd = -1; for (let k = 0; k < n; k++) if (bestD[k] > wd) { wd = bestD[k]; w = k; }
        if (d < wd) { bestD[w] = d; best[w] = j; }
      }
      for (let k = 0; k < n; k++) { const l = pool[k], j = best[k]; if (j < 0) { l.intensity = 0; continue; } l.position.set(lightSrc[j], lightSrc[j + 1] - 0.3, lightSrc[j + 2]); l.intensity = lampXYZ.length ? 160 : 60; }
    }
    if (!lampXYZ.length && pool.length) for (let k = 0; k < pool.length; k++) if (pool[k].intensity > 0) pool[k].intensity = 50 + Math.sin(time * 19 + k * 3) * 14;
  };

  const dispose = () => {
    scene.remove(root);
    for (const d of disposables) d && d.dispose && d.dispose();
    for (const im of instMeshes) im.dispose();
    root.traverse((o) => { if (o.isMesh && o.geometry && !o.isInstancedMesh) o.geometry.dispose(); });
    if (scene.fog) scene.fog = null;
  };

  const world = {
    sun, hemi, update, setQuality: applyQuality, dispose, fogColor, skyColor,
    isNight: !!E.night, isDusk: !!E.dusk, ambientWetness: E.wet || 0, snowfall: wKind === 'snow' || wKind === 'snow_light',
    colliders, group: root, env: envKey,
    stats: { buildMs: 0, instances: instMeshes.reduce((a, m) => a + m.count, 0), colliders: colliders.length },
  };
  world.stats.buildMs = Math.round(performance.now() - t0);
  return world;
}
