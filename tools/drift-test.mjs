// Drift authority test: node tools/drift-test.mjs [car] [surface]
// 1) power-on oversteer: 70 km/h, full steer + full throttle for 2.5 s -> peak / mean slide angle, rpm, boost
// 2) flick + countersteer: steer right 0.6 s, then full left + throttle -> time for yaw rate to reverse
import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { carById, CARS } from '../js/cars.js';
const surface = process.argv[3] || 'gravel';
function mk() {
  const road = []; for (let i = 0; i < 1500; i++) road.push([0, 0, -i * 4]);
  const g = { x0: -1200, z0: -6100, step: 50, nx: 50, nz: 130 }; g.h = new Array(g.nx * g.nz).fill(0);
  const st = new Stage({ id: 't', name: 't', surface, env: 'nordic_summer', width: 1000, road, grid: g });
  st.hasSnowbanks = false; return st;
}
const dt = 1 / 60;
const ids = process.argv[2] && process.argv[2] !== 'all' ? [process.argv[2]] : CARS.map((c) => c.id);
for (const id of ids) {
  const deg = (r) => (r * 180 / Math.PI).toFixed(0);
  // test 1
  let car = new Car(carById(id), mk(), {}); car.placeAtS(10);
  for (let i = 0; i < 30; i++) car.update(dt);
  car.input.throttle = 1; while (car.speedKmh < 70) car.update(dt);
  car.input.steer = 1; let peak = 0, sum = 0, n = 0, rpmS = 0, boostS = 0, gears = new Set();
  for (let t = 0; t < 2.5; t += dt) { car.update(dt); const a = Math.abs(car.slideAngle); peak = Math.max(peak, a); if (t > 0.8) { sum += a; n++; rpmS += car.engine.rpm; boostS += car.engine.boost || 0; gears.add(car.gear); } }
  const r1 = `slide peak ${deg(peak)}° mean ${deg(sum / n)}° rpm ${(rpmS / n).toFixed(0)}/${car.spec.engine.redline} boost ${(boostS / n).toFixed(2)} gears ${[...gears].join(',')} kmh ${car.speedKmh.toFixed(0)}`;
  // test 2
  car = new Car(carById(id), mk(), {}); car.placeAtS(10);
  for (let i = 0; i < 30; i++) car.update(dt);
  car.input.throttle = 1; while (car.speedKmh < 80) car.update(dt);
  car.input.throttle = 0.4; car.input.steer = -1; for (let t = 0; t < 0.6; t += dt) car.update(dt);
  const yaw0 = car.angVel.y;
  car.input.steer = 1; car.input.throttle = 1; let tRev = null, maxRev = 0;
  for (let t = 0; t < 2; t += dt) { car.update(dt); const y = car.angVel.y * Math.sign(-yaw0); maxRev = Math.max(maxRev, y); if (tRev === null && y > 0.3) tRev = t; }
  console.log(`${car.spec.short.padEnd(16)} ${r1} | flick yaw0 ${yaw0.toFixed(2)} reverse(>0.3rad/s) ${tRev === null ? 'NEVER' : tRev.toFixed(2) + 's'} maxRev ${maxRev.toFixed(2)}`);
}

// 3) held drift: initiate with handbrake flick, then countersteer -0.35 and throttle T. Throttle authority = how much T changes the angle.
console.log('--- held drift (angle after 1.5s: thr 0.4 vs 1.0; shifts during drift)');
for (const id of ids) {
  const res = [];
  for (const thr of [0.4, 1.0]) {
    const car = new Car(carById(id), mk(), {}); car.placeAtS(10);
    for (let i = 0; i < 30; i++) car.update(dt);
    car.input.throttle = 1; while (car.speedKmh < 65) car.update(dt);
    car.input.steer = 1; car.input.throttle = 0.6; car.input.handbrake = 1;
    for (let t = 0; t < 0.45; t += dt) car.update(dt);
    car.input.handbrake = 0; car.input.steer = -0.35; car.input.throttle = thr;
    let shifts = 0, lastG = car.gear, angs = [];
    for (let t = 0; t < 1.5; t += dt) { car.update(dt); if (car.gear !== lastG) { shifts++; lastG = car.gear; } angs.push(car.slideAngle); }
    res.push(`thr${thr}: ${(car.slideAngle * 57.3).toFixed(0)}° (min ${(Math.min(...angs.map(Math.abs)) * 57.3).toFixed(0)} max ${(Math.max(...angs.map(Math.abs)) * 57.3).toFixed(0)}) shifts ${shifts} kmh ${car.speedKmh.toFixed(0)} rpm ${car.engine.rpm.toFixed(0)}`);
  }
  console.log(`${carById(id).short.padEnd(16)} ${res.join(' | ')}`);
}
