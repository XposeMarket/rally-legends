// Recovery authority: get the car well sideways (handbrake flick + throttle), then a "player" countersteers
// with gain K (steer = -K * slide, clamped) at the given throttle. A drivable rally car must catch the slide:
// reports time to get back under 10 deg, peak angle, whether it spun (>100 deg) and speed retained.
// node tools/drift-recover.mjs [car|all] [surface] [gain=3] [throttle=1] [entryDeg=45]
import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { carById, CARS } from '../js/cars.js';
import { presetSetup } from '../js/tuning.js';
const surface = process.argv[3] || 'gravel', K = +(process.argv[4] || 3), THR = +(process.argv[5] || 1), ENTRY = +(process.argv[6] || 45) / 57.3;
const setup = process.env.SETUP ? JSON.parse(process.env.SETUP) : undefined;
function mk() {
  const road = []; for (let i = 0; i < 1500; i++) road.push([0, 0, -i * 4]);
  const g = { x0: -1200, z0: -6100, step: 50, nx: 50, nz: 130 }; g.h = new Array(g.nx * g.nz).fill(0);
  const st = new Stage({ id: 't', name: 't', surface, env: 'nordic_summer', width: 1000, road, grid: g });
  st.hasSnowbanks = false; return st;
}
const dt = 1 / 120, D = 57.3;
const ids = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : CARS.map((c) => c.id);
const res = [];
for (const id of ids) {
  const out = [];
  for (const kmh of [60, 100]) {
    const car = new Car(carById(id), mk(), { setup: process.env.PRESET ? presetSetup(carById(id), process.env.PRESET) : setup, assists: { autoGear: true, steerAssist: +(process.env.ASSIST ?? 0.5) } }); car.placeAtS(10);
    for (let i = 0; i < 60; i++) car.update(dt);
    car.input.throttle = 1; let t = 0;
    while (car.speedKmh < kmh && t < 30) { car.update(dt); t += dt; }
    car.input.steer = 1; car.input.handbrake = 1; car.input.throttle = 0.6; t = 0;
    while (Math.abs(car.slideAngle) < ENTRY && t < 2.5) { car.update(dt); t += dt; if (t > 0.35) car.input.handbrake = 0; }
    car.input.handbrake = 0;
    const entry = Math.abs(car.slideAngle); const v0 = car.speedKmh;
    let peak = entry, rec = null, spun = false; t = 0;
    for (; t < 4; t += dt) {
      const sl = car.slideAngle;
      car.input.steer = Math.max(-1, Math.min(1, K * sl + (+process.env.KD || 0.35) * car.angVel.y)) /* +K = countersteer, KD unwinds as the car yaws back */; car.input.throttle = THR;
      car.update(dt);
      const a = Math.abs(car.slideAngle); peak = Math.max(peak, a);
      if (a > 100 / D) { spun = true; break; }
      if (rec === null && a < 10 / D) rec = t;
    }
    out.push(`${kmh}: in ${(entry * D).toFixed(0)} pk ${(peak * D).toFixed(0)} ${spun ? 'SPUN' : rec === null ? 'STUCK' : 'rec ' + rec.toFixed(2) + 's'} ${v0.toFixed(0)}->${car.speedKmh.toFixed(0)}`);
    res.push({ id, kmh, spun, rec });
  }
  console.log(`${carById(id).short.padEnd(15)} ${out.join(' | ')}`);
}
const ok = res.filter((r) => !r.spun && r.rec !== null);
console.log(`caught ${ok.length}/${res.length}  mean rec ${(ok.reduce((a, r) => a + r.rec, 0) / Math.max(1, ok.length)).toFixed(2)}s`);
