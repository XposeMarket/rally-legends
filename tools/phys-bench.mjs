// Flat synthetic benchmarks: 0-100, top speed, braking 100-0, steady-state cornering g on a skidpad.
import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { CARS } from '../js/cars.js';

function flatStage(surface, shape = 'straight') {
  const road = [];
  if (shape === 'straight') for (let i = 0; i < 1500; i++) road.push([0, 0, -i * 4]);
  else { const R = 60; for (let i = 0; i < 400; i++) { const a = i * 4 / R; road.push([R * Math.cos(a) - R, 0, -R * Math.sin(a)]); } }
  const g = { x0: -600, z0: -6100, step: 50, nx: 30, nz: 130 }; g.h = new Array(g.nx * g.nz).fill(0);
  return new Stage({ id: 't', name: 't', surface, env: 'nordic_summer', width: 400, road, grid: g });
}
const surfs = process.argv[2] ? process.argv[2].split(',') : ['tarmac', 'gravel', 'snow'];
for (const surface of surfs) {
  console.log(`--- ${surface}`);
  for (const spec of CARS) {
    const st = flatStage(surface === 'snow' ? 'snow' : surface === 'tarmac' ? 'tarmac' : 'gravel');
    st.hasSnowbanks = false;
    const car = new Car(spec, st, {}); car.placeAtS(10);
    const dt = 1 / 60; let t = 0, t100 = null, vmax = 0;
    for (let i = 0; i < 30; i++) car.update(dt);
    car.input.throttle = 1;
    while (t < 40) { car.update(dt); t += dt; if (t100 === null && car.speedKmh >= 100) t100 = t; vmax = Math.max(vmax, car.speedKmh); }
    // braking from current to 0 measured from 100
    car.input.throttle = 0; car.input.brake = 1; let bd = null, d0 = null;
    while (car.speedKmh > 1 && t < 80) { car.update(dt); t += dt; if (d0 === null && car.speedKmh <= 100) d0 = car.roadQ.s; }
    bd = d0 !== null ? car.roadQ.s - d0 : NaN;
    // skidpad R=60: drive a bot at increasing speed, measure max lateral g while staying within 3 m
    const sk = flatStage(surface === 'snow' ? 'snow' : surface === 'tarmac' ? 'tarmac' : 'gravel', 'circle');
    sk.hasSnowbanks = false;
    const c2 = new Car(spec, sk, {}); c2.placeAtS(5); let latG = 0;
    for (let i = 0; i < 30; i++) c2.update(dt);
    for (let k = 0, tt = 0; tt < 40; k++, tt += dt) {
      const p = sk.pointAtS(c2.roadQ.s + 6 + c2.speed * 0.3), q = c2.quat;
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
      const dx = p.x - c2.pos.x, dz = p.z - c2.pos.z;
      c2.input.steer = Math.max(-1, Math.min(1, Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) * 3 - c2.roadQ.lat * 0.08));
      const target = 3 + tt * 0.6; c2.input.throttle = c2.speed < target ? 0.7 : 0; c2.input.brake = 0;
      c2.update(dt);
      if (Math.abs(c2.roadQ.lat) < 2.5 && tt > 3) latG = Math.max(latG, c2.speed * c2.speed / 60 / 9.81);
    }
    console.log(`${spec.short.padEnd(16)} 0-100 ${t100 ? t100.toFixed(2) : '  -  '}s  vmax ${vmax.toFixed(0)}  brake100 ${bd.toFixed(0)}m  skidpad ${latG.toFixed(2)}g`);
  }
}
