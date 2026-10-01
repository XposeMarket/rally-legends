import { Stage } from '../js/stage.js';
import { Car } from '../js/physics.js';
import { carById } from '../js/cars.js';
const id = process.argv[2] || 'impreza';
function mk(){const road=[];for(let i=0;i<1500;i++)road.push([0,0,-i*4]);const g={x0:-1200,z0:-6100,step:50,nx:50,nz:130};g.h=new Array(g.nx*g.nz).fill(0);const st=new Stage({id:'t',name:'t',surface:'gravel',env:'nordic_summer',width:1000,road,grid:g});st.hasSnowbanks=false;return st;}
const dt=1/60;
for (const thr of [0,1]) {
  const car=new Car(carById(id),mk(),{});car.placeAtS(10);for(let i=0;i<30;i++)car.update(dt);
  car.input.throttle=1;while(car.speedKmh<60)car.update(dt);
  car.input.steer=1;car.input.throttle=0.5;car.input.handbrake=1;for(let t=0;t<0.4;t+=dt)car.update(dt);
  car.input.handbrake=0;car.input.throttle=1;let t=0;while(Math.abs(car.slideAngle)<0.45&&t<2){car.update(dt);t+=dt;}
  const sg=Math.sign(car.slideAngle);car.input.steer=sg*0.6;car.input.throttle=thr;
  console.log('thr',thr);
  for(let k=0;k<60;k++){car.update(dt);if(k%6===5){const W=car.wheels;console.log(` ang=${(car.slideAngle*sg*57.3).toFixed(0)} yaw=${(car.angVel.y*sg).toFixed(2)} g=${car.gear} rpm=${car.engine.rpm.toFixed(0)} cl=${car.engine.clutch.toFixed(2)} kmh=${car.speedKmh.toFixed(0)} sr=${W.map(w=>w.slipRatio.toFixed(2)).join('/')} slip=${W.map(w=>w.slip.toFixed(1)).join('/')} drv=${W.map(w=>w.driveT.toFixed(0)).join('/')} Fy=${W.map(w=>w.Fy.toFixed(0)).join('/')} Fz=${W.map(w=>w.Fz.toFixed(0)).join('/')}`);}}
}
