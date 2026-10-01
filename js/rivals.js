// Rival field + reference stage time from a grip-limited speed profile over the real road.
const SURF_MU = { snowtarmac: 0.62, snow: 0.72, gravel: 0.78, mud: 0.62, dirt: 0.72, rocky: 0.74, tarmac: 1.05, city: 1.0, tarmacgravel: 0.9 };

export function referenceTime(stage) {
  const mu = SURF_MU[stage.meta.surface] || 0.8, g = 9.81;
  const N = stage.N, S = stage.s;
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let k = 0; for (let j = -3; j <= 3; j++) k += Math.abs(stage.curv[Math.min(N - 1, Math.max(0, i + j))]); k /= 7;
    v[i] = Math.min(53, Math.sqrt(mu * g / Math.max(k, 1e-4)));
  }
  const aAcc = 5.5 * Math.min(1, mu + 0.1), aDec = 8.5 * mu;
  for (let i = 1; i < N; i++) { const ds = S[i] - S[i - 1]; const slope = (stage.py[i] - stage.py[i - 1]) / Math.max(ds, 1e-3); v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * Math.max(0.6, aAcc - slope * g) * ds)); }
  for (let i = N - 2; i >= 0; i--) { const ds = S[i + 1] - S[i]; v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * aDec * ds)); }
  v[0] = Math.max(v[0], 2);
  let t = 0; for (let i = 1; i < N; i++) { if (S[i] < stage.startS || S[i] > stage.finishS) continue; t += (S[i] - S[i - 1]) / Math.max(1, (v[i] + v[i - 1]) / 2); }
  return t;
}

export const DIFFICULTY = {
  rookie: { label: 'Rookie', factor: 1.32 }, amateur: { label: 'Amateur', factor: 1.18 },
  pro: { label: 'Pro', factor: 1.07 }, legend: { label: 'Legend', factor: 1.0 },
};

const NAMES = [
  ['K. Rovanperä', 'FIN'], ['S. Ogier', 'FRA'], ['T. Neuville', 'BEL'], ['O. Tänak', 'EST'], ['E. Evans', 'GBR'],
  ['A. Mikkelsen', 'NOR'], ['D. Sordo', 'ESP'], ['C. Breen', 'IRL'], ['T. Katsuta', 'JPN'], ['A. Fourmaux', 'FRA'],
  ['G. Munster', 'LUX'], ['S. Pajari', 'FIN'],
];
// deterministic RNG from string
function rng(seed) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Returns rivals [{name, nat, car, time(ms), skill}] for a stage. Skills persist per name across a championship.
export function rivalField(stageMeta, difficulty = 'amateur', carIds = [], count = 9) {
  const f = DIFFICULTY[difficulty]?.factor || 1.18;
  const r = rng(stageMeta.id + difficulty);
  const ref = stageMeta.refTime || 300000;
  const out = [];
  for (let i = 0; i < count; i++) {
    const [name, nat] = NAMES[i];
    const skill = 1 + i * 0.012; // fixed driver order with per-stage noise
    const noise = 1 + (r() - 0.5) * 0.035 + (r() < 0.08 ? 0.05 + r() * 0.1 : 0); // occasional mistake
    out.push({ name, nat, car: carIds.length ? carIds[Math.floor(r() * carIds.length)] : '', time: Math.round(ref * f * skill * noise) });
  }
  return out.sort((a, b) => a.time - b.time);
}

export function fmtTime(ms, plus = false) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const sgn = ms < 0 ? '-' : plus ? '+' : '';
  ms = Math.abs(ms);
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, t = Math.floor(ms % 1000);
  return `${sgn}${m}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
}
