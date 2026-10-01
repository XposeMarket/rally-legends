// Headless physics test: node tools/phys-test.mjs [stage] [car] [seconds]
import fs from 'node:fs';
import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { CARS, carById } from '../js/cars.js';

const sid = process.argv[2] || 'ouninpohja', cid = process.argv[3] || 'impreza', secs = +process.argv[4] || 60;
const stage = new Stage(JSON.parse(fs.readFileSync(`data/stages/${sid}.json`, 'utf8')));
const car = new Car(carById(cid), stage, {});
car.placeAtS(stage.startS);
const dt = 1 / 60;
let t = 0, maxKmh = 0, t100 = null, lastLog = -1, recovers = 0, offroad = 0;
const t0 = performance.now();
// settle
for (let i = 0; i < 60; i++) car.update(dt);
const y0 = car.pos.y;
while (t < secs) {
  // simple driver: look-ahead pure pursuit + corner speed limit
  const q = car.roadQ;
  const look = 8 + car.speed * 0.6;
  const p = stage.pointAtS(q.s + look);
  const fwd = { x: 0, z: -1 };
  const qq = car.quat;
  // body forward in world
  const fx = -2 * (qq.x * qq.z + qq.w * qq.y), fz = -(1 - 2 * (qq.x * qq.x + qq.y * qq.y));
  const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
  const cross = fx * dz - fz * dx, dot = fx * dx + fz * dz;
  const ang = Math.atan2(cross, dot); // + = target to the right? (x east, z south): right of forward
  car.input.steer = Math.max(-1, Math.min(1, ang * 2.2));
  // max curvature ahead
  let k = 0; for (let s = q.s; s < q.s + 30 + car.speed * 2.2; s += 4) { const ii = stage.indexAtS(s).i; k = Math.max(k, Math.abs(stage.curv[ii])); }
  const vmax = Math.sqrt(0.75 * 9.81 / Math.max(k, 1e-3));
  car.input.throttle = car.speed < vmax ? 1 : 0;
  car.input.brake = car.speed > vmax * 1.1 ? 1 : 0;
  car.update(dt);
  t += dt;
  if (Math.abs(car.roadQ.lat) > stage.halfW + 1) offroad += dt;
  if (car.speedKmh > maxKmh) maxKmh = car.speedKmh;
  if (t100 === null && car.speedKmh >= 100) t100 = t;
  if (car.needsRecover) { recovers++; car.needsRecover = false; car.recover(); }
  const every = +process.env.EVERY || 5;
  if (Math.floor(t / every) !== lastLog) {
    lastLog = Math.floor(t / every);
    const e = new (car.pos.constructor)(); 
    const up = { x: 2 * (qq.x * qq.y - qq.w * qq.z), y: 1 - 2 * (qq.x * qq.x + qq.z * qq.z) };
    const rgt = { y: 2 * (qq.x * qq.y + qq.w * qq.z) };
    const fy = 2 * (qq.y * qq.z - qq.w * qq.x);
    process.stdout.write(`roll=${(Math.asin(Math.max(-1,Math.min(1,rgt.y)))*57.3).toFixed(1)} pitch=${(Math.asin(Math.max(-1,Math.min(1,-fy)))*57.3).toFixed(1)} yawRate=${car.angVel.y.toFixed(2)} k=${k.toFixed(3)} vmax=${(vmax*3.6).toFixed(0)} steer=${car.input.steer.toFixed(2)} Fy=${car.wheels.map(w=>w.Fy.toFixed(0)).join('/')} comp=${car.wheels.map(w=>w.comp.toFixed(2)).join('/')}\n   `);
    const tl = car.telemetry();
    console.log(`t=${t.toFixed(0).padStart(3)} s=${car.roadQ.s.toFixed(0).padStart(5)} kmh=${car.speedKmh.toFixed(0).padStart(3)} g=${car.gear} rpm=${car.engine.rpm.toFixed(0)} lat=${car.roadQ.lat.toFixed(1)} slip=${tl.maxSlip.toFixed(2)} surf=${tl.surface} gnd=${car.wheelsOnGround} Fz=${car.wheels.map(w=>w.Fz.toFixed(0)).join('/')} dmg=${car.damage.total.toFixed(2)}`);
  }
  if (car.roadQ.s > stage.finishS) { console.log('FINISHED at', t.toFixed(1)); break; }
}
const ms = performance.now() - t0;
console.log(`settle dy=${(y0).toFixed(2)} 0-100=${t100?.toFixed(2)} max=${maxKmh.toFixed(0)} km/h recovers=${recovers} offroad=${offroad.toFixed(1)}s dist=${car.roadQ.s.toFixed(0)} m  cpu=${(ms / (t / dt)).toFixed(3)} ms/frame`);
