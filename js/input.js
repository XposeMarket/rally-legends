// Keyboard + Gamepad (+ touch state from UI) -> unified analog controls.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.state = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    this.kSteer = 0;
    this.touchState = null;
    this.lastDevice = 'keyboard';
    this.gpPrev = [];
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Space'].includes(e.key) || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code); this.lastDevice = 'keyboard';
    }, { passive: false });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  was(code) { return this.pressed.has(code); }
  // call once per frame
  poll(dt, sens = 0.5) {
    const k = this.keys, st = this.state;
    const left = k.has('ArrowLeft') || k.has('KeyA'), right = k.has('ArrowRight') || k.has('KeyD');
    const kt = (right ? 1 : 0) - (left ? 1 : 0);
    // keyboard steering ramps (digital -> analog), faster return to centre
    const rate = (kt === 0 || Math.sign(kt) !== Math.sign(this.kSteer) ? 6 : 2.6 + sens * 2.5) * dt;
    this.kSteer += Math.max(-rate, Math.min(rate, kt - this.kSteer));
    let steer = this.kSteer;
    let throttle = (k.has('ArrowUp') || k.has('KeyW')) ? 1 : 0;
    let brake = (k.has('ArrowDown') || k.has('KeyS')) ? 1 : 0;
    let hb = k.has('Space') ? 1 : 0;
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0, dz = 0.08;
      const a = Math.abs(ax) < dz ? 0 : Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz);
      const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
      const hbB = (gp.buttons[0]?.pressed || gp.buttons[5]?.pressed) ? 1 : 0;
      if (Math.abs(a) > 0.02 || rt > 0.02 || lt > 0.02 || hbB) this.lastDevice = 'gamepad';
      if (Math.abs(a) > Math.abs(steer)) steer = Math.sign(a) * Math.pow(Math.abs(a), 1.4);
      throttle = Math.max(throttle, rt); brake = Math.max(brake, lt); hb = Math.max(hb, hbB);
      // edges: 3 = Y (camera) 2 = X (shift down) 1 = B (shift up / back) 9 = start (pause) 8 = back (recover) 12/13 dpad
      const prev = this.gpPrev[gp.index] || [];
      const edge = (b) => gp.buttons[b]?.pressed && !prev[b];
      if (edge(9)) this.pressed.add('Pause'); if (edge(3)) this.pressed.add('KeyC'); if (edge(8)) this.pressed.add('KeyR');
      if (edge(1)) { this.pressed.add('KeyE'); this.pressed.add('Back'); } if (edge(2)) this.pressed.add('KeyQ');
      if (edge(12)) this.pressed.add('ArrowUp'); if (edge(13)) this.pressed.add('ArrowDown'); if (edge(14)) this.pressed.add('ArrowLeft'); if (edge(15)) this.pressed.add('ArrowRight');
      if (edge(0)) this.pressed.add('Confirm');
      this.gpPrev[gp.index] = gp.buttons.map((b) => b.pressed);
    }
    const t = this.touchState;
    if (t) {
      if (Math.abs(t.steer || 0) > Math.abs(steer)) steer = t.steer;
      throttle = Math.max(throttle, t.throttle || 0); brake = Math.max(brake, t.brake || 0); hb = Math.max(hb, t.handbrake || 0);
    }
    st.steer = Math.max(-1, Math.min(1, steer)); st.throttle = throttle; st.brake = brake; st.handbrake = hb;
    return st;
  }
  endFrame() { this.pressed.clear(); }
}
