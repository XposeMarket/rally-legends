// Rally car physics: rigid body + 4 raycast suspension corners + combined-slip tyre model
// + engine / gearbox / clutch / centre & axle differentials / brakes / handbrake / aero.
// Fixed substeps (default 240 Hz). Ground = stage.heightAt (same function the renderer uses).
import * as THREE from './vendor/three.module.js';
import { SURFACES } from './stage.js';

const G = 9.81, RHO = 1.2;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix3(), _m4 = new THREE.Matrix4();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;

function torqueCurve(curve, rpm) {
  if (rpm <= curve[0][0]) return curve[0][1] * Math.max(0, rpm / curve[0][0]);
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) { const [r0, t0] = curve[i - 1], [r1, t1] = curve[i]; return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0); }
  }
  return curve[curve.length - 1][1];
}

// Normalised tyre force shape. s = combined normalised slip (1 = peak). Loose surfaces keep building
// force past the peak (the tyre digs in), tarmac/ice fall off. Returns 0..~1.
function tyreShape(s, fall) {
  if (s <= 1) return Math.sin(s * Math.PI * 0.5);
  return 1 - fall * (1 - Math.exp(-(s - 1) * 1.4));
}
// peak slip values + post-peak falloff per surface family
const TYRE = {
  tarmac: { kPeak: 0.09, aPeak: 0.13, fall: 0.28 }, pavement: { kPeak: 0.09, aPeak: 0.13, fall: 0.28 },
  ice: { kPeak: 0.06, aPeak: 0.08, fall: 0.35 }, slush: { kPeak: 0.14, aPeak: 0.18, fall: 0.15 },
  snow: { kPeak: 0.16, aPeak: 0.20, fall: 0.10 }, deepsnow: { kPeak: 0.25, aPeak: 0.28, fall: 0.05 },
  gravel: { kPeak: 0.15, aPeak: 0.19, fall: 0.10 }, dirt: { kPeak: 0.15, aPeak: 0.19, fall: 0.12 },
  rocky: { kPeak: 0.13, aPeak: 0.17, fall: 0.14 }, mud: { kPeak: 0.20, aPeak: 0.22, fall: 0.10 },
  grass: { kPeak: 0.18, aPeak: 0.20, fall: 0.18 }, sand: { kPeak: 0.25, aPeak: 0.26, fall: 0.05 },
};
// tyre compound per event surface: the grip multiplier each compound gets on each surface
export const TYRE_COMPOUNDS = {
  tarmac: { label: 'Tarmac slicks', tarmac: 1.0, pavement: 1.0, ice: 0.8, slush: 0.75, snow: 0.7, deepsnow: 0.7, gravel: 0.8, dirt: 0.8, rocky: 0.8, mud: 0.7, grass: 0.75, sand: 0.75 },
  gravel: { label: 'Gravel', tarmac: 0.88, pavement: 0.88, ice: 0.9, slush: 1.0, snow: 1.0, deepsnow: 1.0, gravel: 1.0, dirt: 1.0, rocky: 1.0, mud: 1.0, grass: 1.0, sand: 1.0 },
  snow: { label: 'Studded snow', tarmac: 0.72, pavement: 0.72, ice: 2.3, slush: 1.25, snow: 1.35, deepsnow: 1.15, gravel: 0.9, dirt: 0.9, rocky: 0.85, mud: 0.9, grass: 0.95, sand: 0.9 },
};
export function defaultCompound(stageSurface) {
  if (stageSurface === 'snow') return 'snow';
  if (stageSurface === 'snowtarmac') return 'snow';
  if (stageSurface === 'tarmac' || stageSurface === 'city') return 'tarmac';
  return 'gravel';
}

export class Car {
  constructor(spec, stage, opts = {}) {
    this.spec = spec; this.stage = stage;
    this.compound = opts.compound || defaultCompound(stage.meta.surface);
    this.assists = Object.assign({ autoGear: true, steerAssist: 0.5, tcs: false, abs: false }, opts.assists || {});
    this.sub = opts.substeps || 4;
    const d = spec.dims, m = spec.mass;
    this.mass = m;
    // inertia (box approximation, tuned for cars: mass concentrated low/centre)
    const L = d.length, W = d.width, H = d.height;
    const k = spec.inertiaScale || 1;
    this.I = new THREE.Vector3(m * (H * H + L * L) / 12 * 0.9 * k, m * (W * W + L * L) / 12 * 1.0 * k, m * (H * H + W * W) / 12 * 0.8);
    this.Iinv = new THREE.Vector3(1 / this.I.x, 1 / this.I.y, 1 / this.I.z);
    // corners. Model origin = wheelbase centre on the ground. CG relative to that:
    const wb = d.wheelbase;
    this.cgZ = wb * (0.5 - spec.weightFront); // CG ahead of wheelbase centre (negative z) when weightFront > .5
    this.cgY = d.cgHeight;
    const s = spec.susp;
    this.wheels = [];
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      const track = front ? d.trackF : d.trackR;
      const axleLoad = m * G * (front ? spec.weightFront : 1 - spec.weightFront) / 2;
      const staticComp = axleLoad / s.k;
      const zModel = front ? -wb / 2 : wb / 2;
      const w = {
        i, front, left,
        // mount relative to CG, in body frame
        mount: new THREE.Vector3((left ? -1 : 1) * track / 2, -this.cgY + d.wheelR + (s.restLen - staticComp), zModel - this.cgZ),
        R: d.wheelR, rest: s.restLen, travel: s.travel,
        len: s.restLen - staticComp, comp: staticComp, compVel: 0,
        omega: 0, spin: 0, steer: 0, Fz: axleLoad, contact: false,
        slipRatio: 0, slipAngle: 0, slip: 0, surface: 'gravel', surf: SURFACES.gravel,
        pos: new THREE.Vector3(), contactPos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
        hint: -1, driveT: 0, brakeT: 0, Fx: 0, Fy: 0, onRoad: true, lastHit: 0,
        inertia: 1.0 + d.wheelR * d.wheelR * 6,
      };
      this.wheels.push(w);
    }
    // state
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion(); this.angVel = new THREE.Vector3();
    this.engine = { rpm: spec.engine.idle, boost: 0, stall: false, clutch: 1, antilagPop: false, popTimer: 0, overheat: 0 };
    this.gear = 1; this.shiftTimer = 0; this.shiftTarget = 1; this.shiftedThisFrame = false;
    this.input = { steer: 0, throttle: 0, brake: 0, handbrake: 0, clutch: 0 };
    this.steerSmooth = 0;
    this.damage = { engine: 0, steering: 0, suspension: [0, 0, 0, 0], body: 0, total: 0 };
    this.impacts = []; // events for audio/fx: {strength, kind, pos}
    this.airTime = 0; this.suspHit = 0; this.onGround = true; this.wheelsOnGround = 4;
    this.distance = 0; this.roadQ = { i: 0, s: 0, lat: 0, dist: 0, roadY: 0 }; this.roadHint = -1;
    this.speed = 0; this.speedKmh = 0; this.slideAngle = 0; this.odometer = 0;
    this.colliders = opts.colliders || [];
    this._colGrid = null; this._buildColliderGrid();
  }

  _buildColliderGrid() {
    const g = new Map(), C = 20;
    for (const c of this.colliders) {
      const k = Math.floor(c.x / C) * 73856093 ^ Math.floor(c.z / C) * 19349663;
      let a = g.get(k); if (!a) g.set(k, a = []); a.push(c);
    }
    this._colGrid = g; this._colCell = C;
  }
  setColliders(list) { this.colliders = list || []; this._buildColliderGrid(); }

  // Place car on the road at distance s, facing along the road, at rest.
  placeAtS(s, lateral = 0) {
    const p = this.stage.pointAtS(s);
    const x = p.x + p.rx * lateral, z = p.z + p.rz * lateral;
    const yaw = Math.atan2(-p.tx, -p.tz); // body -Z forward -> world tangent
    this.quat.setFromAxisAngle(_v1.set(0, 1, 0), yaw);
    const h = this.stage.heightAt(x, z, p.i);
    this.pos.set(x, h + this.cgY + 0.02, z);
    // pitch to road slope
    const ahead = this.stage.pointAtS(s + 3), behind = this.stage.pointAtS(s - 3);
    const pitch = Math.atan2(ahead.y - behind.y, 6);
    this.quat.multiply(_q.setFromAxisAngle(_v1.set(1, 0, 0), pitch));
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    for (const w of this.wheels) { w.omega = 0; w.hint = p.i; }
    this.roadHint = p.i;
    this.gear = 1; this.shiftTimer = 0; this.engine.rpm = this.spec.engine.idle;
  }

  // Reset onto road near current position (the "recover" button). Returns seconds of penalty.
  recover() {
    const q = this.stage.nearest(this.pos.x, this.pos.z, this.roadHint);
    this.placeAtS(Math.max(this.stage.startS, q.s - 6), 0);
    return 5;
  }

  // ---------- helpers ----------
  _toWorld(v, out) { return out.copy(v).applyQuaternion(this.quat); }
  _pointVel(r, out) { return out.copy(this.angVel).cross(r).add(this.vel); }
  _applyForce(F, point, acc) { // accumulate linear force + torque (world)
    acc.f.add(F);
    _v4.subVectors(point, this.pos).cross(F);
    acc.t.add(_v4);
  }

  get gearRatio() { const s = this.spec; if (this.gear === 0) return 0; if (this.gear < 0) return -s.reverse * s.finalDrive; return s.gears[this.gear - 1] * s.finalDrive; }

  shiftUp() { if (this.gear < this.spec.gears.length && this.shiftTimer <= 0) { this.shiftTarget = this.gear + 1 === 0 ? 1 : this.gear + 1; this._beginShift(); } }
  shiftDown() { if (this.gear > -1 && this.shiftTimer <= 0) { this.shiftTarget = this.gear - 1; if (this.shiftTarget === 0 && this.gear === 1) this.shiftTarget = 0; this._beginShift(); } }
  _beginShift() { this.shiftTimer = this.spec.shiftTime; this.shiftedThisFrame = true; this._pendingGear = this.shiftTarget; this.gear = 0; }

  _autoGearbox(dt) {
    const s = this.spec, e = s.engine, inp = this.input;
    if (this.shiftTimer > 0) return;
    const fwdSpeed = -this._localVel.z;
    // reverse logic (arcade convention: hold brake at standstill -> reverse; brake input then drives)
    if (this.gear >= 1 && Math.abs(fwdSpeed) < 0.8 && inp.brake > 0.5 && inp.throttle < 0.1) {
      this._revTimer = (this._revTimer || 0) + dt; if (this._revTimer > 0.35) { this.gear = -1; this._revTimer = 0; this.shiftedThisFrame = true; }
      return;
    }
    if (this.gear === -1) {
      if (inp.throttle > 0.2 && fwdSpeed > -1.5) { this.gear = 1; this.shiftedThisFrame = true; }
      return;
    }
    this._revTimer = 0;
    if (this.gear === 0) { this.gear = 1; return; }
    // shift on road speed (with some allowance for wheelspin) so launch spin doesn't short-shift
    const groundOmega = Math.abs(fwdSpeed) / s.dims.wheelR;
    const wheelRpm = Math.min(Math.abs(this._drivenOmega), groundOmega * 1.12 + 1.5) * 60 / (2 * Math.PI);
    const rpmIn = (g) => Math.abs(wheelRpm * s.gears[g - 1] * s.finalDrive);
    const r = rpmIn(this.gear);
    this._sinceShift = (this._sinceShift || 0) + dt;
    // upshift at the redline (actual engine rpm, so a car spinning its wheels still changes up like a driver would)
    if (this.gear < s.gears.length && this.engine.rpm > e.redline * 0.985 && inp.throttle > 0.3 && this.engine.clutch >= 1 && this._sinceShift > 0.35) { this.shiftTarget = this.gear + 1; this._beginShift(); this._sinceShift = 0; return; }
    if (this.gear > 1 && this._sinceShift > 0.8) {
      const lower = rpmIn(this.gear - 1);
      const braking = inp.brake > 0.2 || inp.throttle < 0.1;
      if (lower < e.redline * (braking ? 0.86 : 0.78) && (r < e.redline * (braking ? 0.62 : 0.5))) { this.shiftTarget = this.gear - 1; this._beginShift(); this._sinceShift = 0; }
    }
  }

  // ---------- main step ----------
  update(dt) {
    this.shiftedThisFrame = false; this.engine.antilagPop = false; this.suspHit = 0; this.impacts.length = 0;
    const n = this.sub, h = dt / n;
    for (let k = 0; k < n; k++) this._substep(h);
    // road tracking
    const q = this.stage.nearest(this.pos.x, this.pos.z, this.roadHint);
    this.roadQ.i = q.i; this.roadQ.s = q.s; this.roadQ.lat = q.lat; this.roadQ.dist = q.dist; this.roadQ.roadY = q.roadY;
    this.roadHint = q.i;
    this.speed = this.vel.length(); this.speedKmh = this.speed * 3.6;
    this.odometer += this.speed * dt;
    this.onGround = this.wheelsOnGround > 0;
    this.airTime = this.onGround ? 0 : this.airTime + dt;
    // fell off the world / flipped & stopped
    const b = this.stage.bounds;
    if (this.pos.y < this.stage.terrainRaw(this.pos.x, this.pos.z) - 15 || this.pos.x < b.minX || this.pos.x > b.maxX || this.pos.z < b.minZ || this.pos.z > b.maxZ) this.needsRecover = true;
    const up = _v1.set(0, 1, 0).applyQuaternion(this.quat);
    this.flipped = up.y < 0.2 && this.speed < 2;
    this.flipTimer = this.flipped ? (this.flipTimer || 0) + dt : 0;
    if (this.flipTimer > 2.5) this.needsRecover = true;
  }

  _substep(h) {
    const s = this.spec, d = s.dims, st = this.stage, inp = this.input, e = s.engine, eng = this.engine;
    const acc = this._acc || (this._acc = { f: new THREE.Vector3(), t: new THREE.Vector3() });
    acc.f.set(0, -this.mass * G, 0); acc.t.set(0, 0, 0);
    const q = this.quat, qi = _q.copy(q).invert();
    this._localVel = (this._localVel || new THREE.Vector3()).copy(this.vel).applyQuaternion(qi);
    const fwdSpeed = -this._localVel.z, spd = this.vel.length();
    const up = (this._up || (this._up = new THREE.Vector3())).set(0, 1, 0).applyQuaternion(q);
    const fwdB = (this._fwdB || (this._fwdB = new THREE.Vector3())).set(0, 0, -1).applyQuaternion(q);

    // ---- steering (rate limited, speed sensitive, optional countersteer assist) ----
    const assist = this.assists.steerAssist;
    const slide = spd > 3 ? Math.atan2(this._localVel.x, Math.max(0.5, fwdSpeed)) : 0;
    this.slideAngle = slide;
    const speedLock = 1 / (1 + Math.max(0, fwdSpeed - 8) / (assist > 0 ? 38 : 70));
    let target = inp.steer * s.steerLock * speedLock + this.damage.steering * 0.06;
    if (assist > 0 && spd > 5) target += clamp(slide * 0.9 * assist, -0.35, 0.35) * (1 - Math.abs(inp.steer) * 0.5);
    target = clamp(target, -s.steerLock, s.steerLock);
    const rate = 2.8 + 2.5 * (1 - speedLock); // rad/s at the wheels
    this.steerSmooth += clamp(target - this.steerSmooth, -rate * h, rate * h);
    const st0 = this.steerSmooth;
    // Ackermann: inner wheel steers more
    const ack = 0.12;
    this.wheels[0].steer = st0 * (st0 > 0 ? 1 - ack : 1 + ack) * (st0 === 0 ? 1 : 1);
    this.wheels[1].steer = st0 * (st0 > 0 ? 1 + ack : 1 - ack);
    this.wheels[2].steer = this.wheels[3].steer = 0;

    // ---- engine / drivetrain ----
    if (this.shiftTimer > 0) { this.shiftTimer -= h; if (this.shiftTimer <= 0) { this.gear = this._pendingGear; this.shiftTimer = 0; } }
    const driven = this.wheels.filter((w) => (s.drivetrain === 'AWD') || (s.drivetrain === 'FWD' ? w.front : !w.front));
    // mean driven wheel angular velocity, weighted by torque share
    const cf = s.drivetrain === 'AWD' ? s.diff.centerFront : s.drivetrain === 'FWD' ? 1 : 0;
    const wf = (this.wheels[0].omega + this.wheels[1].omega) / 2, wr = (this.wheels[2].omega + this.wheels[3].omega) / 2;
    this._drivenOmega = s.drivetrain === 'AWD' ? wf * cf + wr * (1 - cf) : s.drivetrain === 'FWD' ? wf : wr;
    if (this.assists.autoGear) this._autoGearbox(h);
    let throttle = inp.throttle, brakeIn = inp.brake;
    if (this.gear === -1 && this.assists.autoGear) { throttle = inp.brake; brakeIn = inp.throttle; }
    const ratio = this.gearRatio;
    const engaged = ratio !== 0 && this.shiftTimer <= 0;
    // turbo boost model
    if (e.turbo) {
      const want = clamp(throttle * clamp((eng.rpm - 2200) / 2000, 0, 1), 0, 1);
      const lagT = e.antilag ? 0.18 : 0.45;
      const target2 = e.antilag && eng.rpm > 3000 ? Math.max(want, 0.7) : want;
      eng.boost += (target2 - eng.boost) * Math.min(1, h / lagT);
    } else eng.boost = throttle;
    const boostMul = e.turbo ? 0.5 + 0.5 * eng.boost : 1;
    const hybrid = e.hybrid && throttle > 0.5 && fwdSpeed > 3 ? 1.12 : 1;
    const limiterCut = clamp((e.limiter - eng.rpm) / 120, 0, 1); // soft-cut limiter (no torque chatter)
    let Te = torqueCurve(e.curve, eng.rpm) * throttle * boostMul * hybrid * limiterCut * (1 - 0.45 * this.damage.engine);
    Te -= e.brake * (1 - throttle) * clamp((eng.rpm - e.idle) / 1500, 0, 1); // engine braking
    const eff = 0.9;
    const Ieng = e.inertia;
    let driveTotal = 0; // torque delivered to driven wheels (sum)
    if (engaged) {
      const shaftRpm = Math.abs(this._drivenOmega * ratio) * 60 / (2 * Math.PI);
      // launch clutch slip: engine held at a launch rpm while wheels are slow
      const launchRpm = e.idle + (e.redline * 0.55 - e.idle) * throttle;
      if (shaftRpm < launchRpm && (Math.abs(this.gear) === 1 || shaftRpm < e.idle)) {
        eng.rpm += (launchRpm - eng.rpm) * Math.min(1, h * 8);
        eng.clutch = shaftRpm / Math.max(1, launchRpm);
        driveTotal = Math.max(0, Te) * ratio * eff; // slipping clutch still transmits engine torque
        this._coupledInertia = 0;
      } else {
        eng.rpm = shaftRpm; eng.clutch = 1;
        driveTotal = Te * ratio * eff;
        this._coupledInertia = Ieng * ratio * ratio;
      }
    } else {
      // neutral / mid-shift: engine spins freely
      if (this.shiftTimer > 0 && this._pendingGear) {
        // sequential box with ignition cut: revs drop/blip toward the next gear's shaft speed
        const nr = this._pendingGear > 0 ? s.gears[this._pendingGear - 1] * s.finalDrive : s.reverse * s.finalDrive;
        const tgt = Math.abs(this._drivenOmega * nr) * 60 / (2 * Math.PI);
        eng.rpm += (Math.max(e.idle, tgt) - eng.rpm) * Math.min(1, h / Math.max(0.02, s.shiftTime * 0.5));
      } else {
        const fr = e.brake * 0.6 + 12;
        eng.rpm += ((torqueCurve(e.curve, eng.rpm) * throttle * boostMul * limiterCut) - fr) / Ieng * h * 60 / (2 * Math.PI) * 0.25;
      }
      this._coupledInertia = 0; eng.clutch = 0;
    }
    eng.rpm = clamp(eng.rpm, e.idle * 0.9, e.limiter + 100);
    if (eng.rpm < e.idle) eng.rpm = e.idle;
    // antilag / overrun pops
    eng.popTimer -= h;
    if (throttle < 0.25 && eng.rpm > e.redline * 0.45 && eng.popTimer <= 0) {
      const rateP = e.antilag ? 9 : e.turbo ? 3 : 2;
      if (Math.random() < rateP * h * 4) { eng.antilagPop = true; eng.popTimer = 0.05; }
    }

    // ---- torque distribution: centre diff + axle diffs (using last omegas) ----
    const W = this.wheels;
    const hbOn = inp.handbrake > 0.15;
    let Tf, Tr;
    if (s.drivetrain === 'AWD') {
      // hydraulic handbrake releases the centre diff (real rally cars): all drive goes to the front
      const split = hbOn ? 1 : cf;
      Tf = driveTotal * split; Tr = driveTotal * (1 - split);
      if (!hbOn) {
        const kc = s.diff.center === 'locked' ? 260 : s.diff.center === 'active' ? 140 : s.diff.center === 'lsd' ? 90 : 45;
        const cap = Math.abs(driveTotal) * 0.6 + 350;
        const lock = clamp(kc * (wf - wr), -cap, cap);
        Tf -= lock; Tr += lock;
      }
    } else if (s.drivetrain === 'FWD') { Tf = driveTotal; Tr = 0; } else { Tf = 0; Tr = driveTotal; }
    const axleSplit = (T, a, b, type) => {
      let ta = T / 2, tb = T / 2;
      if (type === 'lsd') {
        const cap = s.diff.lsdPreload + s.diff.lsdRatio * Math.abs(T);
        const lock = clamp(70 * (a.omega - b.omega), -cap, cap);
        ta -= lock / 2; tb += lock / 2;
      }
      a.driveT = ta; b.driveT = tb;
    };
    axleSplit(Tf, W[0], W[1], s.diff.front); axleSplit(Tr, W[2], W[3], s.diff.rear);
    // coupled engine inertia share per driven wheel
    const cI = this._coupledInertia || 0;
    for (const w of W) {
      const share = s.drivetrain === 'AWD' ? (w.front ? cf : 1 - cf) / 2 : ((s.drivetrain === 'FWD') === w.front ? 0.5 : 0);
      w.Ieff = w.inertia + cI * share;
      // brakes
      const bias = w.front ? s.brakes.bias : 1 - s.brakes.bias;
      w.brakeT = brakeIn * s.brakes.torque * bias;
      if (!w.front) w.brakeT += inp.handbrake * s.brakes.handbrake / 2;
    }

    // ---- suspension geometry pass ----
    const sus = s.susp;
    const compound = TYRE_COMPOUNDS[this.compound] || TYRE_COMPOUNDS.gravel;
    let onGround = 0;
    for (const w of W) {
      const mw = w.pos; // reuse as mount world
      mw.copy(w.mount).applyQuaternion(q).add(this.pos);
      const nq = st.nearest(mw.x, mw.z, w.hint);
      w.hint = nq.i; w.roadS = nq.s; w.roadLat = nq.lat;
      w.surface = st.surfaceAt(nq.s, nq.lat); w.surf = SURFACES[w.surface];
      w.onRoad = Math.abs(nq.lat) <= st.halfW + 0.4;
      let hg = st.heightAt(mw.x, mw.z, w.hint);
      const b = w.surf.bump;
      // surface roughness, low-passed by the tyre carcass (an unsprung-mass/tyre-envelope stand-in)
      const bump = b > 0 ? b * (Math.sin(mw.x * 1.1 + mw.z * 0.7) * Math.sin(mw.x * 0.5 - mw.z * 1.2) + 0.6 * Math.sin(mw.x * 2.3 - mw.z * 1.9)) : 0;
      w.bumpF = (w.bumpF || 0) + (bump - (w.bumpF || 0)) * Math.min(1, h * 30);
      hg += w.bumpF;
      const t = (mw.y - hg) / Math.max(0.3, up.y) - w.R;
      w._t = t; w._hg = hg;
      if (t >= w.rest || up.y < 0.05) {
        w.contact = false; w.Fz = 0; w.compVel = 0;
        w.comp = Math.max(0, w.comp - h * 2); w.len = w.rest - w.comp;
        continue;
      }
      w.contact = true; onGround++;
      const comp = w.rest - t;
      w.compVel = (comp - w.comp) / h;
      w.comp = comp; w.len = Math.max(w.rest - w.travel, t);
      st.normalAt(mw.x, mw.z, w.hint, w.normal);
    }
    this.wheelsOnGround = onGround;
    // ---- forces pass ----
    for (const w of W) {
      const Iw = w.Ieff;
      if (!w.contact) {
        w.omega += (w.driveT / Iw) * h;
        const bt = w.brakeT * h / Iw;
        w.omega = w.omega > 0 ? Math.max(0, w.omega - bt) : Math.min(0, w.omega + bt);
        w.omega *= 1 - 0.3 * h;
        w.slip = 0; w.Fx = w.Fy = 0;
        continue;
      }
      const other = W[w.i ^ 1];
      const arb = (w.front ? sus.arbF : sus.arbR) * ((w.comp) - (other.contact ? other.comp : 0));
      let comp = Math.min(w.comp, w.travel);
      // digressive rally dampers: linear up to 0.25 m/s, then blow-off
      const cv = w.compVel, acv = Math.abs(cv), cd = cv > 0 ? sus.bump : sus.rebound;
      const damp = Math.sign(cv) * cd * (acv < 0.25 ? acv : 0.25 + (acv - 0.25) * 0.3);
      let Fs = sus.k * comp * (1 - 0.35 * this.damage.suspension[w.i]) + damp + arb;
      if (w.comp > w.travel) { // bump stop
        const over = w.comp - w.travel;
        Fs += sus.k * 10 * over + 8000 * Math.max(0, w.compVel);
        if (w.compVel > 2) this.suspHit = Math.max(this.suspHit, clamp((w.compVel - 2) / 6, 0, 1));
      }
      Fs = clamp(Fs, 0, this.mass * G * 6);
      // suspension force along body up at the mount
      _v1.copy(up).multiplyScalar(Fs);
      this._applyForce(_v1, w.pos, acc);
      const n = w.normal;
      const Fz = Fs * Math.max(0, n.dot(up));
      w.Fz = Fz;
      // tyre frame
      const sw = Math.sin(w.steer), cw = Math.cos(w.steer);
      const f = _v2.set(sw, 0, -cw).applyQuaternion(q);
      f.addScaledVector(n, -f.dot(n)).normalize();
      const r = _v3.crossVectors(f, n);
      // contact point (slightly raised to temper roll moments)
      const cp = w.contactPos.copy(w.pos).addScaledVector(up, -w.len).addScaledVector(n, -w.R);
      const ap = this._ap || (this._ap = new THREE.Vector3());
      ap.copy(cp).addScaledVector(up, 0.12);
      const vp = this._pointVel(_v4.subVectors(cp, this.pos), this._vp || (this._vp = new THREE.Vector3()));
      const vx = vp.dot(f), vy = vp.dot(r);
      const T = TYRE[w.surface] || TYRE.gravel;
      const loadRef = this.mass * G / 4;
      const loadSens = clamp(1 - 0.1 * (Fz / loadRef - 1), 0.7, 1.15);
      const mu = w.surf.mu * (compound[w.surface] ?? 1) * s.tyre.grip * loadSens;
      const den = Math.max(Math.abs(vx), 2.0);
      const sr = (w.omega * w.R - vx) / den;
      const alpha = Math.atan2(vy, Math.max(Math.abs(vx), 1.5));
      const sx = sr / T.kPeak, sy = Math.tan(clamp(alpha, -1.4, 1.4)) / Math.tan(T.aPeak);
      const sc = Math.hypot(sx, sy);
      const Fmax = mu * Fz;
      const F = Fmax * tyreShape(sc, T.fall);
      // longitudinal: implicit wheel solve with secant stiffness
      const Kx = sc > 1e-4 ? (F / sc) / T.kPeak : Fmax * 1.5708 / T.kPeak * s.tyre.stiff;
      let Td = w.driveT;
      if (this.assists.tcs && Td > 0 && sr > T.kPeak * 1.1) Td *= clamp(1 - (sr - T.kPeak * 1.1) / (T.kPeak * 2.5), 0.25, 1);
      let om = (Iw * w.omega + h * Td + h * Kx * w.R * vx / den) / (Iw + h * Kx * w.R * w.R / den);
      let bT = w.brakeT;
      if (this.assists.abs && brakeIn > 0 && w.front !== undefined && sr < -T.kPeak * 1.2 && Math.abs(vx) > 3) bT *= 0.4;
      const bt = bT * h / (Iw + h * Kx * w.R * w.R / den);
      om = om > 0 ? Math.max(0, om - bt) : Math.min(0, om + bt);
      w.omega = om;
      let Fx = Kx * (om * w.R - vx) / den;
      let Fy = sc > 1e-4 ? -F * sy / sc : 0;
      const capY = (this.mass / 4) * Math.abs(vy) / h * 0.8;
      if (Math.abs(Fy) > capY) Fy = Math.sign(Fy) * capY;
      const Ft = Math.hypot(Fx, Fy), lim = Fmax * 1.02;
      if (Ft > lim) { Fx *= lim / Ft; Fy *= lim / Ft; }
      // rolling resistance + deep-surface drag
      const vabs = Math.abs(vx);
      Fx -= Math.sign(vx) * Math.min(1, vabs) * (w.surf.roll + w.surf.drag * Math.min(1, vabs / 10)) * Fz;
      w.Fx = Fx; w.Fy = Fy; w.slipRatio = sr; w.slipAngle = alpha; w.slip = sc;
      _v1.copy(f).multiplyScalar(Fx).addScaledVector(r, Fy);
      this._applyForce(_v1, ap, acc);
    }
    // engine rpm follows (coupled) wheels immediately next step; record driven omega for gearbox
    // ---- aero ----
    const v2 = spd * spd;
    acc.f.addScaledVector(this.vel, -0.5 * RHO * s.aero.cd * s.aero.area * spd);
    acc.f.addScaledVector(up, -0.5 * RHO * s.aero.down * s.aero.area * v2);
    // ---- body vs ground + obstacles ----
    this._bodyGround(acc, h);
    // ---- integrate ----
    this.vel.addScaledVector(acc.f, h / this.mass);
    const tb = acc.t.applyQuaternion(qi);
    tb.x *= this.Iinv.x; tb.y *= this.Iinv.y; tb.z *= this.Iinv.z;
    tb.applyQuaternion(q);
    this.angVel.addScaledVector(tb, h);
    this.angVel.multiplyScalar(1 - 0.15 * h);
    this.pos.addScaledVector(this.vel, h);
    const wv = this.angVel;
    _q.set(wv.x * h * 0.5, wv.y * h * 0.5, wv.z * h * 0.5, 0).multiply(q);
    q.x += _q.x; q.y += _q.y; q.z += _q.z; q.w += _q.w; q.normalize();
    this._colliders(h);
    for (const w of W) w.spin += w.omega * h;
  }

  // Body hull vs ground: 10 hull points; penalty spring + friction. Rollovers happen here.
  _bodyGround(acc, h) {
    const d = this.spec.dims, st = this.stage, q = this.quat;
    if (!this._hull) {
      const L = d.length / 2, Wd = d.width / 2 - 0.05, yb = -this.cgY + d.groundClear, yt = -this.cgY + d.height - 0.05;
      const zc = -this.cgZ;
      this._hull = [
        [-Wd, yb, -L + 0.2], [Wd, yb, -L + 0.2], [-Wd, yb, L - 0.2], [Wd, yb, L - 0.2],
        [-Wd * 0.85, yt, -0.6], [Wd * 0.85, yt, -0.6], [-Wd * 0.85, yt, 0.7], [Wd * 0.85, yt, 0.7],
        [0, yb + 0.15, -L], [0, yb + 0.15, L], [-Wd, yb + 0.35, 0], [Wd, yb + 0.35, 0],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z + zc));
      this._hp = new THREE.Vector3(); this._hv = new THREE.Vector3(); this._hn = { x: 0, y: 1, z: 0 }; this._hF = new THREE.Vector3();
    }
    let worst = 0;
    for (const p of this._hull) {
      const wp = this._hp.copy(p).applyQuaternion(q).add(this.pos);
      const g = st.heightAt(wp.x, wp.z, this.roadHint);
      const pen = g - wp.y;
      if (pen <= 0) continue;
      const n = st.normalAt(wp.x, wp.z, this.roadHint, this._hn);
      const vp = this._pointVel(_v4.subVectors(wp, this.pos), this._hv);
      const vn = vp.x * n.x + vp.y * n.y + vp.z * n.z;
      const Fn = Math.max(0, 180000 * pen - 9000 * vn);
      const F = this._hF.set(n.x, n.y, n.z).multiplyScalar(Fn);
      // sliding friction
      const vt = vp.addScaledVector(F, -vn / Math.max(1e-6, Fn)); // tangential velocity (approx)
      const vtl = vt.length();
      if (vtl > 0.05) F.addScaledVector(vt, -0.55 * Fn / vtl);
      this._applyForce(F, wp, acc);
      if (-vn > worst) worst = -vn;
    }
    if (worst > 3) {
      this.impacts.push({ strength: clamp(worst / 12, 0, 1), kind: 'ground', pos: this.pos.clone() });
      this._damage(clamp((worst - 3) / 25, 0, 0.2), null);
    }
  }

  // Circle obstacles (trees, poles, walls, buildings). Car approximated by 3 circles along its length.
  _colliders(h) {
    if (!this.colliders.length) return;
    const d = this.spec.dims, C = this._colCell, q = this.quat;
    const fwd = _v1.set(0, 0, -1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
    const rad = d.width / 2;
    const off = d.length / 2 - rad;
    for (let k = -1; k <= 1; k++) {
      const cx = this.pos.x + fwd.x * off * k, cz = this.pos.z + fwd.z * off * k;
      const gx = Math.floor(cx / C), gz = Math.floor(cz / C);
      for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iz = gz - 1; iz <= gz + 1; iz++) {
        const arr = this._colGrid.get(ix * 73856093 ^ iz * 19349663); if (!arr) continue;
        for (const c of arr) {
          if (c.h !== undefined && this.pos.y - this.cgY > c.y + c.h) continue; // flying over low walls
          const dx = cx - c.x, dz = cz - c.z, dist = Math.hypot(dx, dz), minD = rad + c.r;
          if (dist >= minD || dist < 1e-4) continue;
          const nx = dx / dist, nz = dz / dist, pen = minD - dist;
          this.pos.x += nx * pen; this.pos.z += nz * pen;
          // velocity at contact point
          const r = _v2.set(cx - nx * rad - this.pos.x, 0, cz - nz * rad - this.pos.z);
          const vp = this._pointVel(r, _v3);
          const vn = vp.x * nx + vp.z * nz;
          if (vn >= 0) continue;
          const e = 0.25; // restitution
          // impulse with rotational term (yaw only)
          const rxn = r.x * nz - r.z * nx;
          const invM = 1 / this.mass + rxn * rxn / this.I.y;
          const j = -(1 + e) * vn / invM;
          this.vel.x += nx * j / this.mass; this.vel.z += nz * j / this.mass;
          this.angVel.y += -rxn * j / this.I.y;
          // friction along the obstacle
          const tx = -nz, tz = nx, vt = vp.x * tx + vp.z * tz;
          const jt = clamp(-vt * this.mass * 0.3, -0.4 * j, 0.4 * j);
          this.vel.x += tx * jt / this.mass; this.vel.z += tz * jt / this.mass;
          const strength = clamp(-vn / 18, 0, 1);
          if (-vn > 1.5) {
            this.impacts.push({ strength, kind: c.kind || 'tree', pos: new THREE.Vector3(c.x + nx * c.r, this.pos.y, c.z + nz * c.r) });
            this._damage(strength * strength * 0.35, r);
          }
        }
      }
    }
  }

  _damage(amount, rLocal) {
    if (this.noDamage || amount <= 0) return;
    const D = this.damage;
    D.body = clamp(D.body + amount, 0, 1);
    D.engine = clamp(D.engine + amount * 0.35, 0, 1);
    D.steering = clamp(D.steering + (Math.random() - 0.5) * amount * 0.6, -1, 1);
    const wi = rLocal ? ((rLocal.x > 0 ? 1 : 0) + 0) : Math.floor(Math.random() * 4);
    D.suspension[wi] = clamp(D.suspension[wi] + amount * 0.5, 0, 1);
    D.total = clamp((D.body + D.engine + Math.abs(D.steering) + D.suspension.reduce((a, b) => a + b, 0) / 4) / 3, 0, 1);
  }
  repair() { this.damage = { engine: 0, steering: 0, suspension: [0, 0, 0, 0], body: 0, total: 0 }; }

  // snapshot for audio / HUD / fx
  telemetry(out = {}) {
    const W = this.wheels;
    out.rpm = this.engine.rpm; out.gear = this.gear; out.speed = this.speed; out.kmh = this.speedKmh;
    out.throttle = this.input.throttle; out.boost = this.engine.boost;
    out.load = this.input.throttle > 0.05 ? this.input.throttle : -0.6;
    out.antilagPop = this.engine.antilagPop; out.shift = this.shiftedThisFrame;
    out.wheelSlip = out.wheelSlip || [0, 0, 0, 0];
    let maxSlip = 0, surfCount = {};
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const ls = w.contact ? clamp(Math.max(Math.abs(w.slipRatio) / 0.25, Math.abs(w.slipAngle) / 0.35) - 0.4, 0, 2) : 0;
      out.wheelSlip[i] = ls; maxSlip = Math.max(maxSlip, ls);
      if (w.contact) surfCount[w.surface] = (surfCount[w.surface] || 0) + 1;
    }
    out.surface = Object.keys(surfCount).sort((a, b) => surfCount[b] - surfCount[a])[0] || W[0].surface;
    out.onGround = this.wheelsOnGround > 0; out.suspHit = this.suspHit;
    out.slide = this.slideAngle; out.maxSlip = maxSlip;
    return out;
  }
}
