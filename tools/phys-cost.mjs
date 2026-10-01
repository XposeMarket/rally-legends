// Physics cost per fixed step on a real stage: node tools/phys-cost.mjs <stage>
import fs from 'node:fs';
import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { CARS } from '../js/cars.js';
const id = process.argv[2] || 'ouninpohja';
const data = JSON.parse(fs.readFileSync(`data/stages/${id}.json`, 'utf8'));
const st = new Stage(data);
let nN = 0, nH = 0, nNorm = 0;
const oN = st.nearest.bind(st), oH = st.heightAt.bind(st), oNo = st.normalAt.bind(st);
st.nearest = (...a) => { nN++; return oN(...a); };
st.heightAt = (...a) => { nH++; return oH(...a); };
st.normalAt = (...a) => { nNorm++; return oNo(...a); };
const car = new Car(CARS[3], st, { compound: 'gravel', assists: { autoGear: true, steerAssist: 0.5 }, colliders: [], substeps: 2 });
car.placeAtS(st.startS + 5, 0);
const DT = 1 / 120;
const drive = (n, thr) => { for (let k = 0; k < n; k++) {
  const q = car.roadQ, p = st.pointAtS(q.s + 8 + car.speed * 0.6), qq = car.quat;
  const fx = -2 * (qq.x * qq.z + qq.w * qq.y), fz = -(1 - 2 * (qq.x * qq.x + qq.y * qq.y));
  const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
  car.input.steer = Math.max(-1, Math.min(1, Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) * 2.2));
  car.input.throttle = thr; car.input.brake = 0; car.input.handbrake = 0;
  car.update(DT);
} };
for (const [label, thr] of [['standstill', 0], ['moving', 0.7]]) {
  drive(240, thr); nN = nH = nNorm = 0;
  const t = process.hrtime.bigint(); drive(1200, thr); const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`${label}: ${(ms / 1200 * 1000).toFixed(1)}us/step (${(car.speed * 3.6).toFixed(0)}km/h) nearest/step ${(nN / 1200).toFixed(1)} heightAt/step ${(nH / 1200).toFixed(1)} normalAt/step ${(nNorm / 1200).toFixed(1)}`);
}
