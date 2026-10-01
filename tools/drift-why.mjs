// Per-wheel trace during a countersteered recovery: node tools/drift-why.mjs [car] [surface] [kmh] [thr]
import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { carById } from '../js/cars.js';
const id = process.argv[2] || 'impreza', surface = process.argv[3] || 'gravel', kmh = +(process.argv[4] || 60), THR = +(process.argv[5] || 1);
const setup = process.env.SETUP ? JSON.parse(process.env.SETUP) : undefined;
const road = []; for (let i = 0; i < 1500; i++) road.push([0, 0, -i * 4]);
const g = { x0: -1200, z0: -6100, step: 50, nx: 50, nz: 130 }; g.h = new Array(g.nx * g.nz).fill(0);
const st = new Stage({ id: 't', name: 't', surface, env: 'nordic_summer', width: 1000, road, grid: g }); st.hasSnowbanks = false;
const car = new Car(carById(id), st, { setup }); car.placeAtS(10);
const dt = 1 / 120, D = 57.3;
for (let i = 0; i < 60; i++) car.update(dt);
car.input.throttle = 1; while (car.speedKmh < kmh) car.update(dt);
car.input.steer = 1; car.input.handbrake = 1; car.input.throttle = 0.6; let t = 0;
while (Math.abs(car.slideAngle) < 45 / D && t < 2.5) { car.update(dt); t += dt; if (t > 0.35) car.input.handbrake = 0; }
car.input.handbrake = 0;
for (t = 0; t < 2.6; t += dt) {
  car.input.steer = Math.max(-1, Math.min(1, (+process.env.K || 3) * car.slideAngle)); car.input.throttle = THR;
  car.update(dt);
  if (Math.round(t / dt) % 24 === 0) {
    const W = car.wheels, f = (x) => x.toFixed(2);
    console.log(`t${t.toFixed(2)} slide ${(car.slideAngle * D).toFixed(0)} yawr ${(car.angVel.y * D).toFixed(0)} steer ${(W[0].steer * D).toFixed(0)} kmh ${car.speedKmh.toFixed(0)} g${car.gear} rpm ${car.engine.rpm.toFixed(0)} | F sr ${f(W[0].slipRatio)} a ${(W[0].slipAngle * D).toFixed(0)} Fy ${(W[0].Fy + W[1].Fy).toFixed(0)} Fz ${(W[0].Fz + W[1].Fz).toFixed(0)} | R sr ${f(W[2].slipRatio)} a ${(W[2].slipAngle * D).toFixed(0)} Fy ${(W[2].Fy + W[3].Fy).toFixed(0)} Fx ${(W[2].Fx + W[3].Fx).toFixed(0)} Fz ${(W[2].Fz + W[3].Fz).toFixed(0)}`);
  }
}
