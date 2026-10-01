// Car setup ("tuning"): per-car, persisted adjustments applied on top of the base spec in js/cars.js.
// Every parameter is expressed as a value the player understands (%, degrees, front-bias %) and mapped
// to the physics spec in applySetup(). The base spec is never mutated.
export const SETUP_PARAMS = [
  { group: 'Tyres', items: [
    { id: 'gripF', label: 'Front grip', min: 80, max: 125, step: 1, unit: '%', def: 100, hint: 'More = sharper turn-in, more nose bite' },
    { id: 'gripR', label: 'Rear grip', min: 80, max: 125, step: 1, unit: '%', def: 100, hint: 'More = stabler, catches slides sooner. Less = loose rear' },
  ] },
  { group: 'Steering', items: [
    { id: 'steerLock', label: 'Steering angle', min: 22, max: 45, step: 1, unit: '°', def: null, hint: 'Max front wheel angle. More = bigger countersteer' },
    { id: 'steerRate', label: 'Steering speed', min: 60, max: 180, step: 5, unit: '%', def: 100, hint: 'How fast the wheels reach full lock' },
  ] },
  { group: 'Drivetrain', items: [
    { id: 'centerFront', label: 'Torque to front', min: 10, max: 60, step: 1, unit: '%', def: null, awdOnly: true, hint: 'Less = more rear-drive, easier power oversteer' },
    { id: 'lsd', label: 'Rear diff lock', min: 0, max: 100, step: 5, unit: '%', def: null, hint: 'More = both rear wheels push together, harder slides' },
    { id: 'power', label: 'Engine power', min: 80, max: 130, step: 1, unit: '%', def: 100, hint: 'Torque multiplier' },
    { id: 'finalDrive', label: 'Gearing', min: 85, max: 115, step: 1, unit: '%', def: 100, hint: 'More = shorter gears, quicker acceleration, lower top speed' },
  ] },
  { group: 'Brakes', items: [
    { id: 'brakeBias', label: 'Brake bias front', min: 45, max: 75, step: 1, unit: '%', def: null, hint: 'Less = rear locks first, rotates the car on entry' },
    { id: 'handbrake', label: 'Handbrake power', min: 50, max: 150, step: 5, unit: '%', def: 100, hint: 'Strength of the hydraulic handbrake' },
  ] },
  { group: 'Chassis', items: [
    { id: 'springs', label: 'Spring stiffness', min: 70, max: 140, step: 5, unit: '%', def: 100, hint: 'Softer = more grip on rough roads, more body roll' },
    { id: 'arbBal', label: 'Anti-roll balance', min: -50, max: 50, step: 5, unit: '', def: 0, hint: '+ = stiffer front (understeer), - = stiffer rear (oversteer)' },
  ] },
];
const ALL = SETUP_PARAMS.flatMap((g) => g.items);

// defaults that come from the car itself
export function baseSetup(spec) {
  const o = {};
  for (const p of ALL) o[p.id] = p.def;
  o.steerLock = Math.round(spec.steerLock * 57.2958);
  o.centerFront = Math.round((spec.diff.centerFront || 0) * 100);
  o.lsd = Math.round(spec.diff.rear === 'lsd' ? Math.min(100, (spec.diff.lsdRatio || 0) * 150 + (spec.diff.lsdPreload || 0) / 10) : 0);
  o.brakeBias = Math.round(spec.brakes.bias * 100);
  return o;
}
export function paramsFor(spec) { return SETUP_PARAMS.map((g) => ({ group: g.group, items: g.items.filter((p) => !(p.awdOnly && spec.drivetrain !== 'AWD')) })); }

// presets (deltas over the car default)
export const PRESETS = {
  default: { label: 'Default' },
  grip: { label: 'Grip', gripF: 108, gripR: 112, steerRate: 100, lsd: -15, arbBal: 10, brakeBias: +2 },
  drift: { label: 'Drift', gripF: 110, gripR: 96, steerLock: +8, steerRate: 140, centerFront: -15, lsd: +30, arbBal: -25, brakeBias: -6, handbrake: 130 },
  loose: { label: 'Tail-happy', gripF: 104, gripR: 90, steerLock: +5, steerRate: 125, centerFront: -20, lsd: +40, arbBal: -40 },
};
export function presetSetup(spec, id) {
  const b = baseSetup(spec), p = PRESETS[id];
  if (!p || id === 'default') return b;
  const rel = new Set(['steerLock', 'centerFront', 'lsd', 'brakeBias']); // deltas over car default
  for (const [k, v] of Object.entries(p)) if (k !== 'label' && k in b) b[k] = rel.has(k) ? b[k] + v : v;
  return clampSetup(spec, b);
}
export function clampSetup(spec, s) {
  const b = baseSetup(spec), o = {};
  for (const p of ALL) { const v = Number.isFinite(+s?.[p.id]) ? +s[p.id] : b[p.id]; o[p.id] = Math.min(p.max, Math.max(p.min, v)); }
  if (spec.drivetrain !== 'AWD') o.centerFront = b.centerFront;
  return o;
}
export function isDefault(spec, s) { const b = baseSetup(spec); return ALL.every((p) => Math.abs((s?.[p.id] ?? b[p.id]) - b[p.id]) < 1e-6); }

// returns a new spec with the setup applied (deep-enough copy of the touched sub-objects)
export function applySetup(spec, setup) {
  if (!setup) return spec;
  const s = clampSetup(spec, setup), b = baseSetup(spec);
  const o = { ...spec, tyre: { ...spec.tyre }, diff: { ...spec.diff }, brakes: { ...spec.brakes }, susp: { ...spec.susp }, engine: { ...spec.engine } };
  o.tyre.gripF = (spec.tyre.gripF ?? 1) * s.gripF / 100;
  o.tyre.gripR = (spec.tyre.gripR ?? 1) * s.gripR / 100;
  o.steerLock = s.steerLock / 57.2958;
  o.steerRate = s.steerRate / 100;
  if (spec.drivetrain === 'AWD') o.diff.centerFront = s.centerFront / 100;
  if (s.lsd !== b.lsd) {
    o.diff.rear = s.lsd > 0 ? 'lsd' : 'open';
    if (b.lsd > 0 && spec.diff.rear === 'lsd') { // scale the car's own diff
      const k = s.lsd / b.lsd; o.diff.lsdRatio = Math.min(0.8, spec.diff.lsdRatio * k); o.diff.lsdPreload = Math.min(450, spec.diff.lsdPreload * k);
    } else { const f = s.lsd / 100; o.diff.lsdRatio = 0.1 + 0.6 * f; o.diff.lsdPreload = 40 + 360 * f; }
  }
  o.engine.curve = spec.engine.curve.map(([r, t]) => [r, t * s.power / 100]);
  o.finalDrive = spec.finalDrive * s.finalDrive / 100;
  o.brakes.bias = s.brakeBias / 100;
  o.brakes.handbrake = spec.brakes.handbrake * s.handbrake / 100;
  const k = s.springs / 100;
  o.susp.k = spec.susp.k * k; o.susp.bump = spec.susp.bump * Math.sqrt(k); o.susp.rebound = spec.susp.rebound * Math.sqrt(k);
  const ab = s.arbBal / 100;
  o.susp.arbF = spec.susp.arbF * (1 + ab); o.susp.arbR = spec.susp.arbR * (1 - ab);
  return o;
}
