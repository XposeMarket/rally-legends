// Body-motion smoothness on a real stage (headless physics, 120 Hz like the game).
// node tools/jitter.mjs <stage> <carId>
import fs from 'node:fs';
import * as THREE from '../js/vendor/three.module.js';
import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { carById, CARS } from '../js/cars.js';
const [, , id = 'ouninpohja', carId] = process.argv;
const data = JSON.parse(fs.readFileSync(`data/stages/${id}.json`, 'utf8'));
const st = new Stage(data);
const spec = carId ? carById(carId) : CARS[0];
const compound = data.surface === 'snow' || data.surface === 'snowtarmac' ? 'snow' : (data.surface === 'tarmac' || data.surface === 'city') ? 'tarmac' : 'gravel';
const car = new Car(spec, st, { compound, assists: { autoGear: true, steerAssist: 0.5 }, colliders: [], substeps: 2 });
car.placeAtS(st.startS + 5, 0);
const DT = 1 / 120;
const rows = [];
const fwd = new THREE.Vector3(), up = new THREE.Vector3();
let prevVy = 0, prevPitch = 0, prevRoll = 0;
for (let n = 0; n < 120 * 25; n++) {
  const q = car.roadQ, p = st.pointAtS(q.s + 8 + car.speed * 0.6), qq = car.quat;
  const fx = -2 * (qq.x * qq.z + qq.w * qq.y), fz = -(1 - 2 * (qq.x * qq.x + qq.y * qq.y));
  const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
  let k = 0; for (let s = q.s; s < q.s + 30 + car.speed * 2.2; s += 4) k = Math.max(k, Math.abs(st.curv[st.indexAtS(s).i]));
  const vmax = Math.sqrt(0.7 * 9.81 / Math.max(k, 1e-3));
  car.input.steer = Math.max(-1, Math.min(1, Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) * 2.2));
  car.input.throttle = car.speed < vmax ? 1 : 0; car.input.brake = car.speed > vmax * 1.1 ? 1 : 0; car.input.handbrake = 0;
  car.update(DT);
  if (car.needsRecover) { car.needsRecover = false; car.recover?.(); }
  fwd.set(0, 0, -1).applyQuaternion(car.quat); up.set(0, 1, 0).applyQuaternion(car.quat);
  const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y))), right = new THREE.Vector3(1, 0, 0).applyQuaternion(car.quat), roll = Math.asin(Math.max(-1, Math.min(1, right.y)));
  const ay = (car.vel.y - prevVy) / DT; prevVy = car.vel.y;
  const pr = (pitch - prevPitch) / DT, rr = (roll - prevRoll) / DT; prevPitch = pitch; prevRoll = roll;
  if (n > 240) rows.push({ ay, pr, rr, spd: car.speed, wheelsAir: car.wheels.filter((w) => !w.contact).length });
}
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const pct = (a, p) => { const s = a.map(Math.abs).sort((x, y) => x - y); return s[Math.floor(s.length * p)]; };
const ay = rows.map((r) => r.ay), pr = rows.map((r) => r.pr), rr = rows.map((r) => r.rr);
// high-frequency content: diff of consecutive samples (jerk-ish)
const hf = (a) => rms(a.slice(1).map((v, i) => v - a[i]));
console.log(`${id} ${spec.name} avg ${(rows.reduce((s, r) => s + r.spd, 0) / rows.length * 3.6).toFixed(0)}km/h | vertAcc rms ${rms(ay).toFixed(2)} p99 ${pct(ay, 0.99).toFixed(1)} hf ${hf(ay).toFixed(2)} | pitchRate rms ${rms(pr).toFixed(3)} hf ${hf(pr).toFixed(3)} | rollRate rms ${rms(rr).toFixed(3)} hf ${hf(rr).toFixed(3)} | airborne-wheel frames ${rows.filter((r) => r.wheelsAir > 0).length}/${rows.length}`);
