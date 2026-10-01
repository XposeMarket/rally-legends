// Throttle-authority test: get the car into a slide (handbrake flick), then hold a fixed countersteer
// (steer toward the slide) and a fixed throttle. Reports slide angle over time. Good rally physics:
// more throttle = holds/increases angle, lift = car straightens.
// node tools/drift-hold.mjs [car|all] [surface] [counter=0.3]
globalThis.RLA = process.env.RLA ? +process.env.RLA : undefined; globalThis.RLB = process.env.RLB ? +process.env.RLB : undefined;
import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { carById, CARS } from '../js/cars.js';
const surface = process.argv[3] || 'gravel', counter = +(process.argv[4] || 0.3);
function mk() {
  const road = []; for (let i = 0; i < 1500; i++) road.push([0, 0, -i * 4]);
  const g = { x0: -1200, z0: -6100, step: 50, nx: 50, nz: 130 }; g.h = new Array(g.nx * g.nz).fill(0);
  const st = new Stage({ id: 't', name: 't', surface, env: 'nordic_summer', width: 1000, road, grid: g });
  st.hasSnowbanks = false; return st;
}
const dt = 1 / 60, D = 57.3;
const ids = process.argv[2] && process.argv[2] !== 'all' ? [process.argv[2]] : CARS.map((c) => c.id);
for (const id of ids) {
  const out = [];
  for (const thr of [0, 0.5, 1.0]) {
    const car = new Car(carById(id), mk(), {}); car.placeAtS(10);
    for (let i = 0; i < 30; i++) car.update(dt);
    car.input.throttle = 1; while (car.speedKmh < 60) car.update(dt);
    car.input.steer = 1; car.input.throttle = 0.5; car.input.handbrake = 1;
    let t = 0; for (; t < 0.4; t += dt) car.update(dt);
    car.input.handbrake = 0; car.input.throttle = 1;
    while (Math.abs(car.slideAngle) < 0.45 && t < 2) { car.update(dt); t += dt; }
    const a0 = car.slideAngle, sg = Math.sign(a0);
    car.input.steer = sg * counter; car.input.throttle = thr;
    const tr = [];
    for (let k = 0; k < 120; k++) { car.update(dt); if (k % 20 === 19) tr.push((car.slideAngle * sg * D).toFixed(0)); }
    out.push(`thr${thr}: ${(a0 * sg * D).toFixed(0)}°?${tr.join('/')} g${car.gear} ${car.speedKmh.toFixed(0)}kmh`);
  }
  console.log(`${carById(id).short.padEnd(15)} ${out.join(' | ')}`);
}
