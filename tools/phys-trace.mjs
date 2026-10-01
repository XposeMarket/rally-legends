import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { carById } from '../js/cars.js';
const road = []; for (let i = 0; i < 1500; i++) road.push([0, 0, -i * 4]);
const g = { x0: -600, z0: -6100, step: 50, nx: 30, nz: 130 }; g.h = new Array(g.nx * g.nz).fill(0);
const st = new Stage({ id: 't', name: 't', surface: process.argv[3] || 'tarmac', env: 'nordic_summer', width: 400, road, grid: g });
const car = new Car(carById(process.argv[2] || 'mini'), st, {}); car.placeAtS(10);
const dt = 1 / 60; for (let i = 0; i < 30; i++) car.update(dt);
car.input.throttle = 1; let t = 0;
const brakeAt = +process.argv[4] || 99;
while (t < 14) {
  if (t > brakeAt) { car.input.throttle = 0; car.input.brake = 1; }
  car.update(dt); t += dt;
  if (Math.round(t * 60) % 15 === 0) {
    const W = car.wheels;
    console.log(`t=${t.toFixed(2)} kmh=${car.speedKmh.toFixed(0)} g=${car.gear} rpm=${car.engine.rpm.toFixed(0)} clutch=${car.engine.clutch.toFixed(2)} sr=${W.map(w => w.slipRatio.toFixed(2)).join('/')} Fx=${W.map(w => w.Fx.toFixed(0)).join('/')} Fz=${W.map(w => w.Fz.toFixed(0)).join('/')} drv=${W.map(w => w.driveT.toFixed(0)).join('/')} yaw=${car.angVel.y.toFixed(2)} slide=${car.slideAngle.toFixed(2)}`);
  }
}
