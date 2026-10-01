// Rally Legends ? game orchestration: menus, stage loading, race loop, camera, timing, championship.
import * as THREE from './vendor/three.module.js';
import { loadStage, loadStageIndex, SURFACES } from './stage.js';
import { Car, TYRE_COMPOUNDS, defaultCompound } from './physics.js';
import { CARS, carById } from './cars.js';
import { buildWorld } from './world.js';
import { buildCarModel } from './carmodel.js';
import { RallyFX } from './fx.js';
import { RallyAudio } from './audio.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { generatePaceNotes, CoDriver, noteShort } from './pacenotes.js';
import { rivalField, fmtTime } from './rivals.js';
import { paramsFor, PRESETS, baseSetup, presetSetup, clampSetup, isDefault } from './tuning.js';

// ---------- persistence ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem('rl_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rl_' + k, JSON.stringify(v)); } catch {} },
};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const isMobile = isTouch && Math.min(screen.width, screen.height) < 900;
const DEFAULT_SETTINGS = {
  quality: 'auto', camera: 'chase', units: 'kmh', codriver: true, codriverVoice: true,
  volume: { master: 0.8, engine: 0.8, fx: 0.8, codriver: 0.9 }, touchLayout: 'wheel', invertTilt: false,
  steerSensitivity: 0.5, showPaceNotes: true, damage: true,
};
const settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('settings', {}));
settings.volume = Object.assign({}, DEFAULT_SETTINGS.volume, settings.volume || {});
const records = LS.get('records', {}); // stageId -> {time, car, date}
const profile = LS.get('profile', { selectedCar: 'impreza', selectedStage: 'ouninpohja', difficulty: 'amateur', assists: { autoGear: true, steerAssist: 0.5, tcs: false, abs: false } });
const saveProfile = () => LS.set('profile', profile);
const qualityLevel = () => settings.quality === 'auto' ? (isMobile ? 'med' : 'high') : settings.quality;

// ---------- renderer ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// dynamic resolution: on 'auto' the render scale adapts to hold a steady frame rate. Changing the pixel ratio
// only resizes the drawing buffer (no shader recompiles), unlike toggling shadows, which froze the game ~1.5 s.
// the learned scale/cap is remembered per device, so the next stage starts at the right resolution
// instead of stuttering for the first seconds while the scaler re-learns
const dynSaved = (() => { try { return JSON.parse(localStorage.getItem('rl.dynres') || 'null'); } catch (_) { return null; } })();
const dyn = { scale: dynSaved?.scale || 1, t: 0, n: 0, miss: 0, bad: 0, good: 0, hold: 0, minDt: 1, cap: dynSaved?.cap || 0, saved: 0 };
const saveDyn = () => { try { localStorage.setItem('rl.dynres', JSON.stringify({ scale: +dyn.scale.toFixed(3), cap: dyn.cap })); } catch (_) {} };
const basePixelRatio = () => {
  const q = qualityLevel();
  let pr = Math.min(devicePixelRatio, q === 'high' ? 1.75 : q === 'med' ? 1.35 : 1);
  // on auto, start from a sane pixel budget (ultrawide/4K screens would otherwise begin GPU-bound and stutter
  // for the first seconds until the scaler catches up)
  if (settings.quality === 'auto') { const px = innerWidth * innerHeight, budget = isMobile ? 1.4e6 : 1.9e6; pr = Math.min(pr, Math.sqrt(budget / Math.max(1, px))); }
  return Math.max(0.5, pr);
};
function setRenderScale(s) {
  dyn.scale = Math.max(0.45, Math.min(1, s));
  const pr = basePixelRatio() * dyn.scale;
  if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) renderer.setPixelRatio(pr);
}
function applyQuality() {
  const q = qualityLevel();
  renderer.setPixelRatio(basePixelRatio() * (settings.quality === 'auto' ? dyn.scale : 1));
  renderer.shadowMap.enabled = q === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
applyQuality();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 6000);
function resize() {
  const w = innerWidth, h = innerHeight;
  if (typeof dyn !== 'undefined') setRenderScale(dyn.scale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 78 : 62; // portrait phones need a wider vertical FOV
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- systems ----------
const input = new Input();
const audio = new RallyAudio();
let stageIndex = [];
const ui = new UI(document.getElementById('ui'), { cars: CARS, stages: [] });
const unlockAudio = () => { audio.unlock().catch(() => {}); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);

// game state
const G = {
  mode: 'menu',          // menu | loading | countdown | racing | finished | paused
  scene: null, world: null, stage: null, car: null, model: null, fx: null, notes: null, codriver: null,
  t: 0, raceTime: 0, penalty: 0, splits: [], splitIdx: 0, progress: 0, countdown: 0,
  camMode: settings.camera, offTimer: 0, wrongWayT: 0, recovering: 0, championship: null, lastNoteText: '',
  rivals: [], difficulty: profile.difficulty || 'amateur', ghost: null,
};

// ---------- menu showroom scene ----------
let showroom = null;
function buildShowroom() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15171a);
  scene.fog = new THREE.Fog(0x15171a, 12, 40);
  const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x2a2622, 0.9); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(5, 8, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffcc66, 1.2); rim.position.set(-6, 3, -5); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.85, metalness: 0.0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.48, 96), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; scene.add(ring);
  const holder = new THREE.Group(); scene.add(holder);
  showroom = { scene, holder, model: null, carId: null, angle: 0.6 };
}
function showroomCar(id) {
  if (!showroom) buildShowroom();
  if (showroom.carId === id) return;
  if (showroom.model) { showroom.holder.clear(); showroom.model.dispose?.(); }
  const spec = carById(id);
  const m = buildCarModel(spec, { quality: qualityLevel() });
  attachWheels(m, spec, null);
  m.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  showroom.holder.add(m.group);
  showroom.model = m; showroom.carId = id;
}

// wheel pivots: model.wheels are placed at static positions inside steering pivots
function attachWheels(m, spec, physCar) {
  const d = spec.dims;
  m.pivots = [];
  for (let i = 0; i < 4; i++) {
    const front = i < 2, left = i % 2 === 0;
    const pv = new THREE.Group();
    pv.position.set((left ? -1 : 1) * (front ? d.trackF : d.trackR) / 2, d.wheelR, front ? -d.wheelbase / 2 : d.wheelbase / 2);
    pv.add(m.wheels[i]);
    m.group.add(pv); m.pivots.push(pv);
  }
}

// ---------- menus ----------
function stagesForUI() { return stageIndex; }
function goMainMenu() {
  teardownStage();
  G.mode = 'menu'; ui.showHUD?.(false); ui.setTouch?.(false);
  showroomCar(profile.selectedCar);
  ui.showMainMenu({
    profile,
    onQuickRace: () => goStageSelect(false),
    onChampionship: () => goChampionship(),
    onFreeRoam: () => goStageSelect(false),
    onSettings: () => goSettings(goMainMenu),
    onRecords: () => ui.showRecords({ records, stages: stagesForUI(), cars: CARS, onBack: goMainMenu }),
  });
}
function goStageSelect() {
  ui.showStageSelect({
    stages: stagesForUI(), selectedId: profile.selectedStage, records,
    onPick: (id) => { profile.selectedStage = id; saveProfile(); goCarSelect(() => goSetup(id, false)); },
    onBack: goMainMenu,
  });
}
function goCarSelect(next, back = goStageSelect) {
  showroomCar(profile.selectedCar);
  ui.showCarSelect({
    cars: CARS, selectedId: profile.selectedCar, previewCanvas: null,
    onPick: (id) => { profile.selectedCar = id; saveProfile(); next(); },
    onBack: back,
    onBrowse: (id) => showroomCar(id),
  });
}
// ---------- car setups (per car, persisted) ----------
const setups = LS.get('setups', {});
function setupFor(id) { const spec = carById(id); return setups[id] ? clampSetup(spec, setups[id]) : null; }
function setupLabel(id) {
  const spec = carById(id), s = setupFor(id); if (!s || isDefault(spec, s)) return 'Default setup';
  for (const p of Object.keys(PRESETS)) if (p !== 'default' && JSON.stringify(presetSetup(spec, p)) === JSON.stringify(s)) return PRESETS[p].label + ' setup';
  return 'Custom setup';
}
function goGarage(carId, back, overlay = false) {
  const spec = carById(carId);
  const save = (v) => { if (isDefault(spec, v)) delete setups[carId]; else setups[carId] = v; LS.set('setups', setups); if (G.car && G.car.baseSpec?.id === carId) G.car.setSetup(setupFor(carId)); };
  ui.showGarage({
    car: spec, overlay,
    tuning: {
      params: paramsFor(spec), presets: PRESETS, base: baseSetup(spec), value: setupFor(carId) || baseSetup(spec),
      onChange: save,
      onPreset: (id) => { const v = presetSetup(spec, id); save(v); return v; },
      onReset: () => { const v = baseSetup(spec); save(v); return v; },
    },
    onBack: back,
  });
}
function goSetup(stageId, champ) {
  const meta = stageIndex.find((s) => s.id === stageId);
  const car = carById(profile.selectedCar);
  ui.showSetup({
    onGarage: () => goGarage(car.id, () => goSetup(stageId, champ)), setupLabel: setupLabel(car.id),
    car, stage: meta,
    compounds: Object.entries(TYRE_COMPOUNDS).map(([id, c]) => ({ id, label: c.label })),
    compound: defaultCompound(meta.surface), assists: Object.assign({}, profile.assists), difficulty: G.difficulty,
    onStart: ({ compound, assists, difficulty }) => {
      profile.assists = assists; if (difficulty) { G.difficulty = difficulty; profile.difficulty = difficulty; }
      saveProfile();
      startStage(stageId, { compound, assists, champ });
    },
    onBack: champ ? goChampionship : () => goCarSelect(() => goSetup(stageId, false)),
  });
}
function goSettings(back) {
  ui.showSettings({
    settings: JSON.parse(JSON.stringify(settings)),
    onChange: (s) => {
      const qChanged = s.quality !== settings.quality;
      Object.assign(settings, s); LS.set('settings', settings);
      audio.setVolume(settings.volume);
      G.camMode = settings.camera;
      if (qChanged) { applyQuality(); G.world?.setQuality?.(qualityLevel()); }
      if (G.mode !== 'menu') ui.setTouchLayout?.(settings.touchLayout);
    },
    onBack: back,
  });
}

// ---------- championship ----------
function goChampionship() {
  let c = LS.get('champ', null);
  if (!c || c.finished) {
    c = { events: stageIndex.map((s) => ({ stageId: s.id, done: false, time: null, pos: null })), totals: {}, car: profile.selectedCar, finished: false };
  }
  G.championship = c;
  const standings = champStandings(c);
  ui.showChampionship({
    events: c.events, standings, finished: c.finished,
    onContinue: () => {
      const next = c.events.find((e) => !e.done);
      if (!next) { c.finished = true; LS.set('champ', c); return goMainMenu(); }
      if (c.events.every((e) => !e.done)) return goCarSelect(() => { c.car = profile.selectedCar; LS.set('champ', c); goSetup(next.stageId, true); }, goChampionship);
      profile.selectedCar = c.car; goSetup(next.stageId, true);
    },
    onBack: () => { G.championship = null; goMainMenu(); },
  });
}
function champStandings(c) {
  const tot = {};
  for (const [name, t] of Object.entries(c.totals)) tot[name] = t;
  return Object.entries(tot).map(([name, total]) => ({ name, total, car: name === 'You' ? c.car : '', isPlayer: name === 'You' })).sort((a, b) => a.total - b.total);
}

// ---------- stage lifecycle ----------
function teardownStage() {
  if (!G.scene) return;
  G.world?.dispose?.(); G.fx?.dispose?.(); G.model?.dispose?.();
  G.scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  G.scene = G.world = G.stage = G.car = G.model = G.fx = null;
}

async function startStage(stageId, { compound, assists, champ }) {
  teardownStage();
  G.mode = 'loading';
  ui.hideAll(); ui.setLoading?.(0.05, 'Loading stage data');
  try {
    const stage = await loadStage(stageId);
    const meta = stageIndex.find((s) => s.id === stageId);
    stage.meta.refTime = meta?.refTime;
    ui.setLoading?.(0.25, 'Building ' + stage.meta.name);
    await new Promise((r) => setTimeout(r, 30));
    const scene = new THREE.Scene();
    const world = await buildWorld(scene, stage, { quality: qualityLevel(), renderer });
    ui.setLoading?.(0.8, 'Preparing car');
    await new Promise((r) => setTimeout(r, 20));
    const spec = carById(profile.selectedCar);
    const car = new Car(spec, stage, { compound, assists, colliders: world.colliders || [], substeps: 2, setup: setupFor(spec.id) });
    car.noDamage = !settings.damage;
    car.placeAtS(stage.startS - 8);
    for (let i = 0; i < 40; i++) car.update(1 / 60); // settle on suspension
    car.placeAtS(stage.startS - 8);
    for (let i = 0; i < 40; i++) car.update(1 / 60);
    const model = buildCarModel(spec, { quality: qualityLevel() });
    attachWheels(model, spec, car);
    model.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(model.group);
    const fx = new RallyFX(scene, { quality: qualityLevel() });
    const notes = generatePaceNotes(stage);
    Object.assign(G, {
      scene, world, stage, car, model, fx, notes, codriver: new CoDriver(notes),
      raceTime: 0, penalty: 0, splits: [], splitIdx: 0, countdown: 3.999, mode: 'countdown', champ: !!champ,
      offTimer: 0, wrongWayT: 0, recovering: 0, compound, lastNoteText: '', camInit: false, lastCount: 4,
      rivals: rivalField(meta || stage.meta, G.difficulty, CARS.map((c) => c.id)), best: records[stageId] || null,
      dirt: 0, finishedAt: 0, prevPos: car.pos.clone(), prevQuat: car.quat.clone(), physAcc: 0, physAlpha: 0,
    });
    // pre-compile every shader now (incl. the exhaust flame sprite) so nothing compiles mid-stage
    try { model.flame?.(); syncCarPose(model, car); renderer.compile(scene, camera); } catch (e) { console.warn('precompile', e); }
    if (world.isNight && world.hemi) world.hemi.intensity = Math.max(world.hemi.intensity, 0.4);
    ui.setHudOptions?.({ showPaceNotes: settings.showPaceNotes, damage: settings.damage, splits: stage.splitS.map((s) => (s - stage.startS) / (stage.finishS - stage.startS)) });
    model.setLights?.({ head: world.isNight || stage.meta.env === 'city_dusk' || stage.meta.env === 'wales_overcast', brake: 0, reverse: false });
    audio.setCar(spec); audio.setVolume(settings.volume);
    ui.setLoading?.(1, '');
    ui.hideAll();
    ui.showHUD(true);
    if (isTouch) { ui.setTouch?.(true); ui.setTouchLayout?.(settings.touchLayout); wireTouchButtons(); }
    ui.showMessage?.(`${stage.meta.flag} ${stage.meta.name.toUpperCase()} ? ${(stage.length / 1000).toFixed(2)} KM`, 2500);
    if (settings.codriver) audio.codriver(`${stage.meta.name}. ${notes[0] ? notes[0].text : ''}`);
    G.codriver.calledUpTo = 0;
  } catch (e) {
    console.error(e);
    ui.toast?.('Failed to load stage: ' + e.message);
    goMainMenu();
  }
}
let touchWired = false;
function wireTouchButtons() {
  if (touchWired || !ui.touch) return; touchWired = true;
  ui.touch.shiftUp?.(() => G.car?.shiftUp());
  ui.touch.shiftDown?.(() => G.car?.shiftDown());
  ui.touch.onPause?.(() => pauseGame());
  ui.touch.onCamera?.(() => cycleCamera());
  ui.touch.onRecover?.(() => doRecover());
}
const CAMS = ['chase', 'chase_far', 'bumper', 'bonnet', 'cockpit'];
function cycleCamera() { G.camMode = CAMS[(CAMS.indexOf(G.camMode) + 1) % CAMS.length]; settings.camera = G.camMode; LS.set('settings', settings); ui.toast?.('Camera: ' + G.camMode.replace('_', ' ')); }
function doRecover() {
  if (!G.car || G.mode !== 'racing') return;
  G.penalty += G.car.recover(); G.recovering = 1.2; snapInterp();
  if (ui.showPenalty) ui.showPenalty(5); else ui.toast?.('Recovered +5.0s');
  audio.ui?.('penalty');
}
function pauseGame() {
  if (G.mode !== 'racing' && G.mode !== 'countdown') return;
  G.prevMode = G.mode; G.mode = 'paused'; audio.pause?.();
  ui.showPause({
    onResume: resumeGame,
    onRestart: () => { ui.hideAll(); const id = G.stage.meta.id; startStage(id, { compound: G.compound, assists: profile.assists, champ: G.champ }); },
    onRecover: () => { resumeGame(); doRecover(); },
    onSettings: () => goSettings(() => { G.mode = 'paused'; pauseGame.call(null); G.mode = 'paused'; showPauseAgain(); }),
    onGarage: () => goGarage(G.car.baseSpec.id, () => showPauseAgain(), true),
    onQuit: () => { audio.stopAll?.(); goMainMenu(); },
  });
}
function showPauseAgain() { G.mode = G.prevMode; pauseGame(); }
function resumeGame() { ui.hideAll(); ui.showHUD(true); G.mode = G.prevMode || 'racing'; audio.resume?.(); }

function finishStage() {
  G.mode = 'finished'; G.finishedAt = performance.now();
  const total = Math.round(G.raceTime * 1000 + G.penalty * 1000);
  const id = G.stage.meta.id;
  const prev = records[id];
  const isRecord = !prev || total < prev.time;
  if (isRecord) { records[id] = { time: total, car: profile.selectedCar, date: Date.now() }; LS.set('records', records); }
  audio.ui?.('finish');
  const field = G.rivals.map((r) => ({ name: r.name, car: r.car, time: r.time }));
  field.push({ name: 'You', car: profile.selectedCar, time: total, isPlayer: true });
  field.sort((a, b) => a.time - b.time);
  const pos = field.findIndex((r) => r.isPlayer) + 1;
  let nextLabel = 'Next stage', onNext;
  if (G.champ && G.championship) {
    const c = G.championship;
    const ev = c.events.find((e) => e.stageId === id);
    if (ev) { ev.done = true; ev.time = total; ev.pos = pos; }
    for (const r of field) c.totals[r.name] = (c.totals[r.name] || 0) + r.time;
    if (c.events.every((e) => e.done)) c.finished = true;
    LS.set('champ', c);
    nextLabel = c.finished ? 'Final standings' : 'Next event';
    onNext = () => goChampionship();
  } else {
    const i = stageIndex.findIndex((s) => s.id === id);
    const nx = stageIndex[(i + 1) % stageIndex.length];
    onNext = () => { profile.selectedStage = nx.id; saveProfile(); goSetup(nx.id, false); };
  }
  setTimeout(() => {
    if (G.mode !== 'finished') return;
    ui.showHUD(false); ui.setTouch?.(false);
    ui.showResults({
      stage: G.stage.meta, car: carById(profile.selectedCar), time: total, penalties: G.penalty, splits: G.splits,
      rivals: field, isRecord, nextLabel,
      onRetry: () => startStage(id, { compound: G.compound, assists: profile.assists, champ: G.champ }),
      onNext, onMenu: goMainMenu,
    });
  }, 2200);
}

// ---------- camera ----------
const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, pitchLag: 0, shake: 0, fovKick: 0 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _qq = new THREE.Quaternion(), _e = new THREE.Euler();
const BODY_CAMS = { bumper: [0, 0.55, -1.0], bonnet: [0, 1.12, -0.55], cockpit: [-0.36, 1.08, 0.35] };
function updateCamera(dt) {
  const car = G.car, spec = car.spec, st = G.stage;
  const fwd = _a.set(0, 0, -1).applyQuaternion(car.quat);
  const heading = Math.atan2(-fwd.x, -fwd.z);
  // body pose of the model origin
  const body = G.model.group;
  const inCockpit = G.camMode === 'cockpit';
  if (G.model.setInterior && G.model._interior !== inCockpit) { G.model.setInterior(inCockpit); G.model._interior = inCockpit; }
  if (BODY_CAMS[G.camMode]) {
    const o = BODY_CAMS[G.camMode], eye = G.model.eyes?.[G.camMode];
    if (eye) camera.position.copy(eye);
    else camera.position.set(o[0], o[1] * (spec.dims.height / 1.38), -spec.dims.wheelbase * 0.25);
    // head/bumper vibration: small, smooth, scaled by surface roughness
    const spdB = car.speed, roughB = (SURFACES[car.wheels[0].surface]?.bump || 0) * Math.min(1, spdB / 25);
    const tt = performance.now() / 1000;
    if (inCockpit || G.camMode === 'bumper') camera.position.y += (Math.sin(tt * 31) * 0.6 + Math.sin(tt * 19.3 + 1)) * roughB * (inCockpit ? 0.012 : 0.02);
    camera.position.applyQuaternion(body.quaternion).add(body.position);
    // orientation: the bumper/bonnet are bolted to the body; the driver's head keeps the horizon steadier
    // (half the body roll and pitch) and glances into the direction of travel when sideways
    _qq.copy(body.quaternion);
    if (inCockpit) {
      _e.setFromQuaternion(body.quaternion, 'YXZ');
      const vx = car.vel.x, vz = car.vel.z, spdH = Math.hypot(vx, vz);
      let look = 0;
      if (spdH > 5) { let d = Math.atan2(-vx, -vz) - _e.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; look = Math.max(-0.5, Math.min(0.5, d * 0.35)); }
      cam.headYaw = (cam.headYaw || 0) + (look - (cam.headYaw || 0)) * (1 - Math.exp(-dt * 5));
      _e.x *= 0.55; _e.z *= 0.45; _e.y += cam.headYaw;
      _qq.setFromEuler(_e);
    }
    if (!G.camInit) camera.quaternion.copy(_qq); else camera.quaternion.slerp(_qq, 1 - Math.exp(-dt * (inCockpit ? 18 : 40)));
    G.camInit = true;
    const fovB = (innerWidth < innerHeight ? 80 : 66) + (inCockpit ? 4 : 0) + Math.min(10, Math.max(0, car.speed - 15) * 0.14);
    if (camera.near !== 0.04 || Math.abs(camera.fov - fovB) > 0.05) { camera.near = 0.04; camera.fov += (fovB - camera.fov) * (G.camInit ? 1 - Math.exp(-dt * 3) : 1); camera.updateProjectionMatrix(); }
    return;
  }
  if (camera.near !== 0.1) { camera.near = 0.1; camera.updateProjectionMatrix(); }
  const far = G.camMode === 'chase_far';
  const dist = (far ? 9.6 : 5.6) + spec.dims.length * 0.3, height = far ? 3.6 : 1.95;
  // follow the velocity direction when sliding a bit (rally cams look where the car is going), else heading
  const v = car.vel, spd = Math.hypot(v.x, v.z);
  let target = heading;
  if (spd > 4) {
    const vh = Math.atan2(-v.x, -v.z);
    let d = vh - heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) < 1.6) target = heading + d * 0.35; // blend toward travel direction
  }
  if (!G.camInit) { cam.yaw = target; }
  let dy = target - cam.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  cam.yaw += dy * (1 - Math.exp(-dt * (far ? 2.6 : 4.5)));
  const cx = car.pos.x + Math.sin(cam.yaw) * dist, cz = car.pos.z + Math.cos(cam.yaw) * dist;
  let cy = car.pos.y + height;
  const g = st.heightAt(cx, cz, car.roadHint) + 0.6;
  if (cy < g) cy = g;
  const desired = _b.set(cx, cy, cz);
  // frame-rate independent exponential smoothing (the old min(1, dt*k) form behaved differently at 30 vs 120 fps)
  if (!G.camInit) cam.pos.copy(desired); else {
    const kxz = 1 - Math.exp(-dt * 12), ky = 1 - Math.exp(-dt * 6);
    cam.pos.x += (desired.x - cam.pos.x) * kxz;
    cam.pos.z += (desired.z - cam.pos.z) * kxz;
    cam.pos.y += (desired.y - cam.pos.y) * ky;
  }
  // soft ground clamp: g already sits 0.6 m above the (noisy) verge terrain, so allow a small dip instead of
  // snapping the camera up every time it passes over a bump in the ditch
  if (cam.pos.y < g - 0.35) cam.pos.y = g - 0.35;
  // far cam looks further down the road and a bit lower so more of the stage ahead is in frame
  const la = far ? 7 : 4;
  const look = _c.set(car.pos.x - Math.sin(cam.yaw) * la, car.pos.y + (far ? 0.4 : 0.75), car.pos.z - Math.cos(cam.yaw) * la);
  if (!G.camInit) cam.look.copy(look); else cam.look.lerp(look, 1 - Math.exp(-dt * 14));
  camera.position.copy(cam.pos);
  // shake: rough surfaces, landings, impacts
  const rough = (SURFACES[car.wheels[0].surface]?.bump || 0) * spd * 0.03;
  cam.shake = Math.max(cam.shake * Math.exp(-dt * 6), car.suspHit * 0.25, rough);
  if (cam.shake > 0.001) { // smooth (band-limited) shake, not per-frame random jitter
    const tt = performance.now() / 1000;
    camera.position.x += (Math.sin(tt * 29.3) + Math.sin(tt * 17.1 + 1.3)) * 0.5 * cam.shake * 0.16;
    camera.position.y += (Math.sin(tt * 23.7 + 0.4) + Math.sin(tt * 13.9 + 2.1)) * 0.5 * cam.shake * 0.16;
  }
  camera.lookAt(cam.look);
  const baseFov = (innerWidth < innerHeight ? 78 : 62) - (far ? 4 : 0);
  const fov = baseFov + Math.min(14, Math.max(0, spd - 15) * 0.18);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
  G.camInit = true;
}

// ---------- sync visuals from physics ----------
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _vel = new THREE.Vector3();
let lastLights = '';
function syncCarPose(m, car) {
  m.group.quaternion.copy(car.quat);
  m.group.position.set(0, -car.cgY, -car.cgZ).applyQuaternion(car.quat).add(car.pos);
}
function syncCar(dt) {
  const car = G.car, m = G.model;
  // model origin = CG + q*(0,-cgY,-cgZ)
  m.group.quaternion.copy(car.quat);
  m.group.position.set(0, -car.cgY, -car.cgZ).applyQuaternion(car.quat).add(car.pos);
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i], pv = m.pivots[i];
    const len = Math.min(w.rest, Math.max(w.rest - w.travel, w.len));
    pv.position.y = w.mount.y + car.cgY - len;
    pv.rotation.y = -w.steer;
    m.wheels[i].rotation.x = -w.spin;
  }
  if (m.steerWheel && m._interior) m.steerWheel.rotation.z = (car.steerSmooth / (car.spec.steerLock || 0.6)) * 2.4; // ~270 deg to full lock
  const head = G.world.isNight || G.stage.meta.env === 'city_dusk' || G.stage.meta.env === 'wales_overcast';
  const key = `${head}|${car.input.brake > 0.1 ? 1 : 0}|${car.gear === -1}`;
  if (key !== lastLights) { lastLights = key; m.setLights?.({ head, brake: car.input.brake > 0.1 ? 1 : 0, reverse: car.gear === -1 }); }
  // dirt
  const surf = car.wheels[2].surface, sp = car.speed;
  if (surf !== 'tarmac' && surf !== 'pavement') G.dirt = Math.min(1, G.dirt + dt * sp * 0.0009);
  if ((G._dirtT = (G._dirtT || 0) + dt) > 0.5) { G._dirtT = 0; m.setDirt?.(G.dirt, SURFACES[surf]?.color || 0x6b5a45); m.setDamage?.(car.damage.body); }
  // fx + audio events
  const fx = G.fx;
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    if (!w.contact) { fx.skidBreak(i); continue; }
    const slip = car.telemetry ? null : null;
    // w.slip = combined slip normalised to the tyre's peak (1 = limit); effects start just past the limit
    const ls = (w.slip - 0.85) * 0.8;
    _vel.copy(car.vel);
    fx.emitWheel(i, w.contactPos, _vel, Math.max(0, ls), w.surface, sp, dt);
    fx.skid(i, w.contactPos, w.normal, Math.max(0, ls), w.surface, dt);
  }
  for (const im of car.impacts) {
    fx.impact(im.pos, im.strength, car.wheels[0].surface);
    audio.impact(im.strength, im.kind === 'ground' ? 'ground' : im.kind === 'wall' || im.kind === 'barrier' || im.kind === 'building' ? 'barrier' : im.kind === 'rock' ? 'rock' : 'tree');
    cam.shake = Math.max(cam.shake, im.strength * 0.6);
    if (im.strength > 0.3 && navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(Math.round(30 + im.strength * 60));
  }
  if (car.engine.antilagPop && m.exhaust) {
    m.flame?.();
    m.exhaust.getWorldPosition(_p); _n.set(0, 0, 1).applyQuaternion(car.quat);
    fx.backfire(_p, _n);
  }
}

// ---------- race loop ----------
const tel = {};
const hud = { nextNotes: [], damageParts: {} };
function noteIcon(n) { return { dir: n.dir, sev: n.sev }; }
function raceUpdate(dt) {
  input.touchState = ui.touchEnabled ? ui.touchState : null;
  const car = G.car, st = G.stage, inp = input.poll(dt, settings.steerSensitivity);
  if (input.was('Escape') || input.was('KeyP') || input.was('Pause')) { pauseGame(); return; }
  if (input.was('KeyC')) cycleCamera();
  if (input.was('KeyR')) doRecover();
  if (input.was('KeyE')) car.shiftUp();
  if (input.was('KeyQ')) car.shiftDown();
  if (input.was('KeyG')) { car.assists.autoGear = !car.assists.autoGear; ui.toast?.(car.assists.autoGear ? 'Automatic gearbox' : 'Manual gearbox (Q / E)'); }
  if (G.mode === 'countdown') {
    G.countdown -= dt;
    const n = Math.ceil(G.countdown);
    if (n !== G.lastCount && n >= 0) { G.lastCount = n; ui.showCountdown?.(n); audio.ui?.(n > 0 ? 'countdown' : 'go'); }
    // hold the car on the line (handbrake + brake), allow revving
    car.input.steer = 0; car.input.throttle = inp.throttle; car.input.brake = 1; car.input.handbrake = 1;
    if (G.countdown <= 0) { G.mode = 'racing'; G.raceTime = 0; }
  } else {
    // throttle ramps in over ~0.15 s (digital keys / touch buttons would otherwise slam full torque on instantly)
    const thrIn = inp.throttle, thrPrev = car.input.throttle || 0;
    const thr = thrIn > thrPrev ? Math.min(thrIn, thrPrev + dt * 7) : Math.max(thrIn, thrPrev - dt * 12);
    car.input.steer = inp.steer; car.input.throttle = thr; car.input.brake = inp.brake; car.input.handbrake = inp.handbrake;
    if (G.recovering > 0) { G.recovering -= dt; car.input.throttle *= 0.3; }
  }
  stepCar(dt);
  if (car.needsRecover && G.mode === 'racing') { car.needsRecover = false; doRecover(); }
  else car.needsRecover = false;
  const q = car.roadQ;
  if (G.mode === 'racing') {
    G.raceTime += dt;
    // splits
    if (G.splitIdx < st.splitS.length && q.s >= st.splitS[G.splitIdx] && q.dist < 30) {
      const t = Math.round(G.raceTime * 1000 + G.penalty * 1000);
      G.splits.push(t);
      const best = G.best && G.best.splits ? G.best.splits[G.splitIdx] : null;
      ui.showSplit?.({ index: G.splitIdx + 1, time: t, delta: best != null ? t - best : null });
      audio.ui?.('split');
      G.splitIdx++;
    }
    if (q.s >= st.finishS && q.dist < 30 && G.splitIdx >= st.splitS.length) { finishStage(); }
    // off-stage: too far from road for too long -> auto recover with penalty
    if (q.dist > st.halfW + 45) { G.offTimer += dt; if (G.offTimer > 4) { G.offTimer = 0; doRecover(); } } else G.offTimer = 0;
    // wrong way
    const fwd = _a.set(0, 0, -1).applyQuaternion(car.quat), p = st.pointAtS(q.s);
    const along = fwd.x * p.tx + fwd.z * p.tz;
    G.wrongWayT = along < -0.5 && car.speed > 5 ? G.wrongWayT + dt : 0;
    // co-driver
    if (settings.codriver) {
      const calls = G.codriver.update(q.s, car.speed);
      if (calls.length) {
        const text = calls.map((n) => n.text).join(', ');
        if (settings.codriverVoice) audio.codriver(text, calls.some((n) => n.sev === 'hairpin' || n.sev === 'jump' || n.mods.includes('tightens')));
        G.lastNoteText = calls.map((n) => noteShort(n)).join(' ? ');
      }
    }
  }
  // brake lights / audio
  car.telemetry(tel);
  audio.update(dt, {
    rpm: tel.rpm, throttle: car.input.throttle, load: tel.load, gear: tel.gear, speed: tel.speed, turboBoost: tel.boost,
    antilagPop: tel.antilagPop, shift: tel.shift, wheelSlip: tel.wheelSlip, surface: tel.surface, onGround: tel.onGround,
    suspHit: tel.suspHit, camInside: G.camMode === 'cockpit' || G.camMode === 'bonnet', paused: false,
  });
  if (navigator.vibrate && tel.suspHit > 0.5 && navigator.userActivation?.hasBeenActive) navigator.vibrate(40);
  // HUD
  const upcoming = G.codriver.upcoming(q.s, 3);
  hud.nextNotes.length = 0;
  for (const n of upcoming) hud.nextNotes.push({ text: noteShort(n), icon: noteIcon(n), dist: Math.max(0, n.s - q.s) });
  const total = G.raceTime * 1000 + G.penalty * 1000;
  let delta = null;
  if (G.rivals.length && G.mode === 'racing') {
    const lead = G.rivals[0].time; // compare to leader pace at this distance
    const frac = Math.max(0.0001, (q.s - st.startS) / (st.finishS - st.startS));
    if (frac > 0.03) delta = total - lead * frac;
  }
  const kmh = car.speedKmh;
  Object.assign(hud, {
    kmh: settings.units === 'mph' ? kmh * 0.6214 : kmh, units: settings.units, gear: car.gear === 0 && car.shiftTimer > 0 ? car._pendingGear : car.gear,
    rpm: car.engine.rpm, redline: car.spec.engine.redline, limiter: car.spec.engine.limiter, maxRpm: car.spec.engine.limiter + 500,
    time: G.mode === 'countdown' ? 0 : total, distance: Math.max(0, q.s - st.startS), length: st.finishS - st.startS,
    splitIndex: G.splitIdx, splitFractions: st.splitS.map((s) => (s - st.startS) / (st.finishS - st.startS)),
    damage: car.damage.total, damageParts: car.damage, surface: tel.surface,
    paceNote: settings.showPaceNotes ? G.lastNoteText : '', nextNotes: settings.showPaceNotes ? hud.nextNotes : [],
    penalty: G.penalty, stageName: st.meta.name, delta, wrongWay: G.wrongWayT > 1.2, recovering: G.recovering > 0,
    boost: car.engine.boost, handbrake: car.input.handbrake > 0.1, manual: !car.assists.autoGear,
  });
  ui.updateHUD(hud);
}

// ---------- main loop ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0;
// ---------- fixed-step physics ----------
const PHYS_STEP = 1 / 120;
const _physPos = new THREE.Vector3(), _physQuat = new THREE.Quaternion();
function stepCar(dt) {
  const car = G.car;
  if (!G.prevPos) { G.prevPos = car.pos.clone(); G.prevQuat = car.quat.clone(); }
  car.beginFrame();
  G.physAcc = Math.min((G.physAcc || 0) + dt, PHYS_STEP * 12);
  while (G.physAcc >= PHYS_STEP) {
    G.prevPos.copy(car.pos); G.prevQuat.copy(car.quat);
    car.update(PHYS_STEP, true);
    G.physAcc -= PHYS_STEP;
  }
  G.physAlpha = G.physAcc / PHYS_STEP;
}
function snapInterp() { if (G.car && G.prevPos) { G.prevPos.copy(G.car.pos); G.prevQuat.copy(G.car.quat); } }
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  if (dt > 0.1) dt = 0.1;
  // frame cap: on a high-refresh screen the GPU can't keep up with, render every other vsync (steady 60)
  // instead of flip-flopping between 120 and 60 fps, which reads as the car stuttering
  if (dyn.cap && dt < dyn.cap - 0.004 && G.mode !== 'menu') return;
  last = now;
  const cpu0 = performance.now();
  if (G.mode === 'countdown' || G.mode === 'racing' || G.mode === 'finished') {
    if (G.mode === 'finished') {
      // coast to a stop after the flying finish
      G.car.input.throttle = 0; G.car.input.brake = 0.6; G.car.input.handbrake = 0; G.car.input.steer *= 0.9;
      stepCar(dt); G.car.telemetry(tel);
      audio.update(dt, { rpm: tel.rpm, throttle: 0, load: -0.5, gear: tel.gear, speed: tel.speed, turboBoost: 0, antilagPop: tel.antilagPop, shift: false, wheelSlip: tel.wheelSlip, surface: tel.surface, onGround: tel.onGround, suspHit: 0, camInside: false, paused: false });
    } else raceUpdate(dt);
    if (!G.scene) { input.endFrame(); return; }
    // render the car at an interpolated pose between the last two fixed physics steps (smooth at any frame rate)
    const car = G.car;
    _physPos.copy(car.pos); _physQuat.copy(car.quat);
    if (G.prevPos) { car.pos.lerpVectors(G.prevPos, _physPos, G.physAlpha || 0); car.quat.slerpQuaternions(G.prevQuat, _physQuat, G.physAlpha || 0); }
    syncCar(dt);
    G.fx.update(dt, camera);
    updateCamera(dt);
    G.world.update(dt, camera, car.pos);
    renderer.render(G.scene, camera);
    car.pos.copy(_physPos); car.quat.copy(_physQuat);
    // auto quality = dynamic resolution (never toggles shadows/materials mid-stage -> no recompile stalls)
    // target: every frame on time for the display (or for the 60 fps cap). Measure the refresh period from the
    // fastest recent frames, count missed frames per half-second window, and scale resolution to fix misses.
    if (settings.quality === 'auto' && dt < 0.25) {
      dyn.minDt = Math.min(dyn.minDt * 1.002, dt);
      const period = Math.max(dyn.cap, dyn.minDt);
      dyn.t += dt; dyn.n++; dyn.sum = (dyn.sum || 0) + dt; if (dt > period * 1.45) dyn.miss++;
      dyn.cpu = (dyn.cpu || 0) + (performance.now() - cpu0) / 1000; // JS-side frame work (physics, fx, draw submission)
      if (dyn.t >= 0.5) {
        const rate = dyn.miss / dyn.n;
        dyn.hold = Math.max(0, dyn.hold - dyn.t);
        if (rate > 0.12) {
          dyn.good = 0;
          if (++dyn.bad >= 2) {
            dyn.bad = 0; dyn.hold = 5;
            // high-refresh screen that can't hold it: lock a steady 60 first (keeps resolution), then scale.
            // one sized jump (pixel count ~ GPU time) instead of many small steps: every resize is a small hitch
            if (!dyn.cap && dyn.minDt < 1 / 100) dyn.cap = 1 / 60; // 120/144 Hz only (90 Hz halved would be 45)
            else if (dyn.cpu / dyn.n > Math.max(dyn.cap, dyn.minDt) * 0.8) { /* CPU-bound: fewer pixels won't help, keep the resolution */ }
            else { const avg = dyn.sum / dyn.n, tgt = Math.max(dyn.cap, dyn.minDt); setRenderScale(dyn.scale * Math.min(0.92, Math.max(0.6, Math.sqrt(tgt / avg) * 0.92))); }
          }
        } else if (rate < 0.02) {
          dyn.bad = 0;
          if (++dyn.good >= 16 && dyn.hold <= 0 && dyn.scale < 1) { setRenderScale(dyn.scale * 1.06); dyn.good = 0; } // creep back up slowly (8 s of clean frames)
        } else { dyn.bad = 0; dyn.good = 0; }
        G.autoQuality = Math.round(dyn.scale * 100) + '%' + (dyn.cap ? '@60' : '');
        if ((dyn.saved += dyn.t) > 3) { dyn.saved = 0; saveDyn(); }
        dyn.t = 0; dyn.n = 0; dyn.miss = 0; dyn.sum = 0; dyn.cpu = 0;
      }
    }
  } else if (G.mode === 'paused') {
    if (G.scene) renderer.render(G.scene, camera);
    input.poll(dt);
    if (input.was('Escape') || input.was('Pause')) resumeGame();
  } else if (G.mode === 'menu') {
    input.poll(dt);
    if (input.was('Escape') || input.was('Back')) ui.back?.();
    if (showroom) {
      showroom.angle += dt * 0.35;
      const r = 6.4;
      camera.position.set(Math.sin(showroom.angle) * r, 1.9, Math.cos(showroom.angle) * r);
      camera.lookAt(0, 0.55, 0);
      if (showroom.model) for (const w of showroom.model.wheels) w.rotation.x -= dt * 2;
      renderer.render(showroom.scene, camera);
    }
  }
  input.endFrame();
}
qualityLevel; // keep
// ---------- boot ----------
(async () => {
  try {
    ui.setLoading?.(0.2, 'Loading stages');
    stageIndex = await loadStageIndex();
    ui.stages = stageIndex;
    audio.setVolume(settings.volume);
    buildShowroom();
    ui.bootDone?.();
    goMainMenu();
    requestAnimationFrame(frame);
    // debug hooks
    window.RL = { G, settings, startStage, goMainMenu, goGarage, goSetup, pauseGame, input, audio, camera, renderer };
    // ?bot=1 : simple autopilot for automated testing
    if (new URLSearchParams(location.search).get('bot')) {
      const botTick = () => {
        const car = G.car, st = G.stage;
        if (car && G.mode === 'racing') {
          const q = car.roadQ, p = st.pointAtS(q.s + 8 + car.speed * 0.6), qq = car.quat;
          const fx = -2 * (qq.x * qq.z + qq.w * qq.y), fz = -(1 - 2 * (qq.x * qq.x + qq.y * qq.y));
          const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
          let k = 0; for (let s = q.s; s < q.s + 30 + car.speed * 2.2; s += 4) k = Math.max(k, Math.abs(st.curv[st.indexAtS(s).i]));
          const vmax = Math.sqrt(0.7 * 9.81 / Math.max(k, 1e-3));
          input.touchState = { steer: Math.max(-1, Math.min(1, Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) * 2.2)), throttle: car.speed < vmax ? 1 : 0, brake: car.speed > vmax * 1.1 ? 1 : 0, handbrake: 0 };
          ui.touchState = input.touchState; ui.touchEnabled = true;
        }
        setTimeout(botTick, 16);
      };
      botTick();
    }
    const qs = new URLSearchParams(location.search);
    if (qs.get('stage')) { profile.selectedCar = qs.get('car') || profile.selectedCar; startStage(qs.get('stage'), { compound: defaultCompound(stageIndex.find((s) => s.id === qs.get('stage'))?.surface || 'gravel'), assists: profile.assists }); }
  } catch (e) { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;position:fixed;top:0;left:0;z-index:99">${e.stack}</pre>`); }
})();
