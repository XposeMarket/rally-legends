// Rally Legends — UI layer (menus, HUD, touch controls). Plain DOM, no deps.
// Usage: const ui = new UI(document.getElementById('ui'), { cars, stages });

const SVGNS = 'http://www.w3.org/2000/svg';
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

export function fmtTime(ms, short = false) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const neg = ms < 0; ms = Math.abs(ms);
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), t = Math.floor(ms % 1000);
  const out = `${m}:${String(s).padStart(2, '0')}.${short ? String(Math.floor(t / 100)) : String(t).padStart(3, '0')}`;
  return neg ? '-' + out : out;
}
export function fmtDelta(ms) {
  if (ms == null || !isFinite(ms)) return '';
  const s = Math.abs(ms) / 1000;
  const body = s >= 60 ? fmtTime(Math.abs(ms)) : s.toFixed(2);
  return (ms >= 0 ? '+' : '−') + body;
}

export const SURFACE_LABEL = { gravel: 'GRAVEL', snow: 'SNOW', tarmac: 'TARMAC', mud: 'MUD', dirt: 'DIRT', rocky: 'ROCKY', city: 'CITY', tarmacgravel: 'TARMAC+GRAVEL', snowtarmac: 'SNOW-TARMAC' };
function envKind(env = '') {
  env = String(env);
  if (/night/.test(env)) return ['night', 'Night'];
  if (/dusk|sunset/.test(env)) return ['dusk', 'Dusk'];
  if (/rain|wet|overcast|wales/.test(env)) return ['rain', 'Overcast'];
  if (/snow/.test(env)) return ['snow', 'Day · Snow'];
  return ['day', 'Day'];
}
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 4 7 12l8 8"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 4 8 8-8 8"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="14" height="11" rx="1"/><path d="m17 11 4-2v8l-4-2"/></svg>',
  recover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg>',
  day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
  night: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 15A9 9 0 0 1 9 4a8 8 0 1 0 11 11z"/></svg>',
  dusk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 16a6 6 0 0 1 12 0M2 16h20M5 20h14M12 4v4M4.5 9.5l2 2M19.5 9.5l-2 2"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3 3 0 0 1 0 6z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/></svg>',
};
const tyreIcon = (c) => `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#1b1b1b" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="8" fill="none" stroke="${c}" stroke-width="3"/><circle cx="16" cy="16" r="3" fill="currentColor"/></svg>`;

// Pace-note icon: dir L/R/null, sev 1..6 | 'hairpin' | 'square' | 'flat' | 'jump' | 'crest'
export function noteIconSVG(icon = {}) {
  const dir = icon.dir === 'L' ? -1 : icon.dir === 'R' ? 1 : 0;
  const sev = icon.sev;
  const S = (body) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const flip = dir < 0 ? ' transform="translate(48 0) scale(-1 1)"' : '';
  if (sev === 'crest' || sev === 'jump') {
    const up = sev === 'jump' ? '<path d="M24 6v12M18 12l6-6 6 6" stroke="#ffcc00"/>' : '';
    return S(`<path d="M4 38c8 0 12-14 20-14s12 14 20 14"/>${up}`);
  }
  if (sev === 'flat' || (!dir && typeof sev !== 'number')) return S('<path d="M24 42V8M14 18l10-10 10 10"/>');
  if (sev === 'hairpin') return S(`<g${flip}><path d="M14 42V18a10 10 0 0 1 20 0v14"/><path d="M28 26l6 7 6-7"/></g>`);
  if (sev === 'square') return S(`<g${flip}><path d="M16 42V14h20"/><path d="M30 8l7 6-7 6"/></g>`);
  const n = clamp(+sev || 3, 1, 6);
  // tighter bend for lower numbers
  const bend = [0, 22, 18, 14, 10, 7, 4][n];
  const path = `M14 42 C14 ${30 - bend * .3} ${18 + bend * .2} ${20 - bend * .4} ${26 + bend * .5} ${14}`;
  const ang = Math.atan2(-6, 8 + bend * .4);
  const ex = 26 + bend * .5, ey = 14;
  const head = `M${ex - 7 * Math.cos(ang - .6)} ${ey - 7 * Math.sin(ang - .6) + 6}L${ex} ${ey}L${ex - 8} ${ey - 1}`;
  return S(`<g${flip}><path d="${path}"/><path d="${head}"/></g><text x="${dir < 0 ? 33 : 15}" y="22" font-size="17" font-weight="700" fill="#ffcc00" stroke="none" text-anchor="middle" font-family="Bahnschrift,Arial Narrow,sans-serif">${n}</text>`);
}

// Car spec helpers
export function carStats(car) {
  let peakKW = 0, peakNm = 0;
  for (const [rpm, nm] of car.engine?.curve || []) { peakKW = Math.max(peakKW, nm * rpm * 2 * Math.PI / 60 / 1000); peakNm = Math.max(peakNm, nm); }
  const hp = Math.round(peakKW * 1.341);
  const mass = car.mass || 1000;
  const hpPerTon = Math.round(hp / (mass / 1000));
  return { kw: Math.round(peakKW), hp, nm: peakNm, mass, hpPerTon };
}
function carSideSVG(car) {
  const L = car.livery || {}; const body = hex(L.body ?? 0xdddddd); const st = (L.stripes || [0xffcc00, 0x222222, 0xffcc00]).map(hex);
  return `<svg viewBox="0 0 320 120"><ellipse cx="160" cy="106" rx="140" ry="7" fill="rgba(0,0,0,.45)"/>
  <path d="M22 84 L28 62 L80 56 L112 32 L208 30 L246 54 L296 60 L302 84 Z" fill="${body}" stroke="#0c0c0c" stroke-width="2"/>
  <path d="M118 38 L206 36 L232 56 L100 56 Z" fill="#1a2128" stroke="#0c0c0c" stroke-width="2"/><path d="M164 37 L164 56" stroke="${body}" stroke-width="4"/>
  <path d="M26 72 L300 70 L300 76 L25 78Z" fill="${st[0]}"/><path d="M25 79 L300 77 L300 81 L24 83Z" fill="${st[1]}"/>
  <rect x="140" y="58" width="34" height="22" fill="#fff" stroke="#0c0c0c"/><text x="157" y="75" text-anchor="middle" font-size="18" font-weight="700" fill="#111" font-family="Bahnschrift,Arial Narrow,sans-serif">${L.number ?? ''}</text>
  <circle cx="78" cy="86" r="20" fill="#111"/><circle cx="78" cy="86" r="11" fill="${hex(L.rims ?? 0xcccccc)}"/><circle cx="246" cy="86" r="20" fill="#111"/><circle cx="246" cy="86" r="11" fill="${hex(L.rims ?? 0xcccccc)}"/>
  <rect x="290" y="62" width="10" height="6" fill="#ffe9a8"/></svg>`;
}
function drawPreview(cv, pts) {
  if (!pts || pts.length < 2) return;
  const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(40, r.width), H = Math.max(40, r.height);
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const pad = 14, s = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (z1 - z0 || 1));
  const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
  const P = ([x, z]) => [ox + (x - x0) * s, oz + (z - z0) * s];
  g.lineJoin = g.lineCap = 'round';
  const path = () => { g.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p); i ? g.lineTo(a, b) : g.moveTo(a, b); }); };
  path(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 5; g.stroke();
  path(); g.strokeStyle = 'rgba(242,239,230,.85)'; g.lineWidth = 2; g.stroke();
  const [sx, sy] = P(pts[0]), [ex, ey] = P(pts[pts.length - 1]);
  g.fillStyle = '#35d07f'; g.beginPath(); g.arc(sx, sy, 4, 0, 7); g.fill();
  g.fillStyle = '#ffcc00'; g.fillRect(ex - 4, ey - 4, 8, 8);
}

export class UI {
  constructor(root, { cars = [], stages = [] } = {}) {
    this.root = root; this.cars = cars; this.stages = stages;
    this.current = null; this._backFn = null; this._keyFn = null;
    this.touchState = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    this.touchLayout = 'wheel'; this.steerSensitivity = 0.5; this.invertTilt = false;
    this._touchCb = { shiftUp: null, shiftDown: null, onPause: null, onCamera: null, onRecover: null };
    const cb = this._touchCb;
    this.touch = {
      get steer() { return 0; }, // replaced below
      shiftUp: (fn) => { cb.shiftUp = fn; }, shiftDown: (fn) => { cb.shiftDown = fn; },
      onPause: (fn) => { cb.onPause = fn; }, onCamera: (fn) => { cb.onCamera = fn; }, onRecover: (fn) => { cb.onRecover = fn; },
    };
    const ts = this.touchState;
    for (const k of ['steer', 'throttle', 'brake', 'handbrake']) Object.defineProperty(this.touch, k, { get: () => ts[k], enumerable: true, configurable: true });
    root.classList.add('ui-root');
    this.layer = h('div', 'screens'); this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    root.appendChild(this.layer);
    this._buildTouch(); this._buildHUD();
    this.toastsEl = h('div', 'toasts'); root.appendChild(this.toastsEl);
    this.cdEl = h('div', 'countdown'); root.appendChild(this.cdEl);
    this.msgEl = h('div', 'message'); root.appendChild(this.msgEl);
    window.addEventListener('keydown', (e) => { if (this._keyFn && this.current) this._keyFn(e); });
    this.setTouch(matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
    this.showTouch(false);
  }

  // ---------- boot / loading ----------
  setLoading(p, label) {
    const f = document.getElementById('boot-fill'), l = document.getElementById('boot-label');
    if (f) f.style.width = Math.round(clamp(p, 0, 1) * 100) + '%';
    if (l && label != null) l.textContent = label;
  }
  bootDone() { const b = document.getElementById('boot'); if (b) { b.classList.add('done'); setTimeout(() => b.remove(), 700); } }

  // ---------- screen machinery ----------
  _screen(cls, { back, keys, overlay } = {}) {
    const old = this.current;
    if (old) { old.classList.remove('in'); old.classList.add('out'); setTimeout(() => old.remove(), 300); }
    const s = h('section', `screen tex ${cls}${overlay ? ' overlay' : ''}`);
    s.style.pointerEvents = 'auto';
    this.layer.appendChild(s); this.current = s; this._backFn = back || null; this._keyFn = keys || null;
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('in')));
    return s;
  }
  _head(s, kicker, title, back) {
    const hd = h('header', 'scr-head');
    if (back) { const b = h('button', 'back-btn', ICON.back); b.setAttribute('aria-label', 'Back'); b.onclick = () => back(); hd.appendChild(b); }
    hd.appendChild(h('div', '', `<span class="kicker">${esc(kicker)}</span><h2>${esc(title)}</h2>`));
    hd.appendChild(h('div', 'spacer'));
    s.appendChild(hd); return hd;
  }
  hideAll() {
    const old = this.current; this.current = null; this._backFn = null; this._keyFn = null;
    if (old) { old.classList.remove('in'); old.classList.add('out'); setTimeout(() => old.remove(), 300); }
  }
  back() { if (this._backFn) { this._backFn(); return true; } return false; }
  isOpen() { return !!this.current; }

  // ---------- main menu ----------
  showMainMenu({ onQuickRace, onChampionship, onFreeRoam, onSettings, onRecords, profile } = {}) {
    const items = [
      ['Quick Stage', 'Pick a stage, pick a car', onQuickRace],
      ['Championship', 'Every stage · one rally', onChampionship],
      onFreeRoam ? ['Free Roam', 'No clock, just the road', onFreeRoam] : null,
      ['Time Trial Records', 'Your best stage times', onRecords],
      ['Settings', 'Graphics · audio · controls', onSettings],
    ].filter(Boolean);
    let sel = 0;
    const s = this._screen('scr-menu', {
      back: null,
      keys: (e) => {
        if (e.key === 'ArrowDown' || e.key === 's') { sel = (sel + 1) % items.length; upd(); e.preventDefault(); }
        else if (e.key === 'ArrowUp' || e.key === 'w') { sel = (sel + items.length - 1) % items.length; upd(); e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === ' ') { items[sel][2]?.(); e.preventDefault(); }
      },
    });
    const wrap = h('div', 'menu-wrap');
    wrap.appendChild(h('h1', 'menu-title', 'RALLY <b>LEGENDS</b>'));
    wrap.appendChild(h('p', 'menu-sub', 'Real stages. Real roads.'));
    wrap.appendChild(h('div', 'menu-rule'));
    const list = h('nav', 'menu-list');
    const btns = items.map(([t, d, fn], i) => {
      const b = h('button', 'menu-item', `<span class="mi-n num">0${i + 1}</span><span class="mi-t">${esc(t)}</span><span class="mi-d">${esc(d)}</span>`);
      b.onclick = () => { sel = i; upd(); fn?.(); };
      list.appendChild(b); return b;
    });
    const upd = () => btns.forEach((b, i) => b.classList.toggle('sel', i === sel));
    upd(); wrap.appendChild(list);
    if (profile) {
      const p = h('div', 'menu-profile');
      const add = (k, v) => p.appendChild(h('div', '', `${esc(k)}<b class="num">${esc(v)}</b>`));
      if (profile.name) add('Driver', profile.name);
      if (profile.stagesDone != null) add('Stages', profile.stagesDone);
      if (profile.records != null) add('Records', profile.records);
      if (profile.distance != null) add('Distance', (profile.distance / 1000).toFixed(1) + ' km');
      wrap.appendChild(p);
    }
    s.appendChild(wrap);
    s.appendChild(h('footer', 'credits', 'Stage roads © OpenStreetMap contributors · Elevation: Mapzen/AWS Terrain Tiles (SRTM, GMTED, ETOPO)'));
    return s;
  }

  // ---------- stage select ----------
  showStageSelect({ stages = this.stages, selectedId, records = {}, onPick, onBack } = {}) {
    let sel = Math.max(0, stages.findIndex((x) => x.id === selectedId));
    const s = this._screen('scr-stages', {
      back: onBack,
      keys: (e) => {
        const cols = Math.max(1, Math.round(grid.clientWidth / (cards[0]?.offsetWidth || 1)));
        const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
        if (mv) { sel = clamp(sel + mv, 0, stages.length - 1); upd(true); e.preventDefault(); }
        else if (e.key === 'Enter') { onPick?.(stages[sel].id); e.preventDefault(); }
      },
    });
    this._head(s, 'Quick Stage', 'Select Stage', onBack);
    const body = h('div', 'scr-body'); const grid = h('div', 'stage-grid'); body.appendChild(grid);
    const cards = stages.map((st, i) => {
      const [ek, el] = envKind(st.env); const rec = records[st.id];
      const c = h('button', 'stage-card');
      c.innerHTML = `${st.preview ? '<canvas></canvas>' : ''}
        <div class="sc-top"><span class="sc-flag">${esc(st.flag || '')}</span><span class="sc-event">${esc(st.event)}</span></div>
        <div class="sc-name">${esc(st.name)}</div><div class="sc-country">${esc(st.country)}</div>
        <div class="sc-meta"><span class="badge s-${esc(st.surface)}">${SURFACE_LABEL[st.surface] || esc(String(st.surface).toUpperCase())}</span>
        <span class="len num">${((st.length || 0) / 1000).toFixed(2)} km</span>
        <span class="env">${ICON[ek]}${el}</span>
        ${rec ? `<span class="best num">${fmtTime(rec.time)}</span>` : '<span class="best none">No time</span>'}</div>`;
      c.onclick = () => { if (sel === i) onPick?.(st.id); else { sel = i; upd(); } };
      grid.appendChild(c); return c;
    });
    s.appendChild(body);
    const foot = h('footer', 'scr-foot'); const desc = h('p', 'stage-desc');
    const go = h('button', 'btn primary', 'Select <span aria-hidden="true">›</span>'); go.onclick = () => onPick?.(stages[sel].id);
    foot.append(desc, go); s.appendChild(foot);
    const upd = (scroll) => { cards.forEach((c, i) => c.classList.toggle('sel', i === sel)); desc.textContent = stages[sel]?.desc || ''; if (scroll) cards[sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    upd();
    requestAnimationFrame(() => { stages.forEach((st, i) => { const cv = cards[i].querySelector('canvas'); if (cv) drawPreview(cv, st.preview); }); cards[sel]?.scrollIntoView({ block: 'nearest' }); });
    return s;
  }

  // ---------- car select ----------
  showCarSelect({ cars = this.cars, selectedId, onPick, onBack, previewCanvas, onBrowse } = {}) {
    let sel = Math.max(0, cars.findIndex((c) => c.id === selectedId));
    const all = cars.map(carStats);
    const max = { hp: Math.max(...all.map((x) => x.hp)), mass: Math.max(...all.map((x) => x.mass)), pw: Math.max(...all.map((x) => x.hpPerTon)), nm: Math.max(...all.map((x) => x.nm)) };
    const s = this._screen('scr-cars', {
      back: onBack,
      keys: (e) => {
        if (e.key === 'ArrowRight' || e.key === 'd') { go(1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' || e.key === 'a') { go(-1); e.preventDefault(); }
        else if (e.key === 'Enter') { onPick?.(cars[sel].id); e.preventDefault(); }
      },
    });
    this._head(s, 'Garage', 'Select Car', onBack);
    const lay = h('div', 'car-layout');
    const stage = h('div', 'car-stage'); const slot = h('div', 'preview-slot');
    const num = h('div', 'car-num num'); slot.appendChild(num);
    let svgBox = null;
    if (previewCanvas) slot.appendChild(previewCanvas); else { svgBox = h('div', 'car-svg'); slot.appendChild(svgBox); }
    const la = h('button', 'car-arrow l', ICON.back), ra = h('button', 'car-arrow r', ICON.next);
    la.setAttribute('aria-label', 'Previous car'); ra.setAttribute('aria-label', 'Next car');
    la.onclick = () => go(-1); ra.onclick = () => go(1);
    slot.append(la, ra); stage.appendChild(slot);
    const strip = h('div', 'car-strip');
    const chips = cars.map((c, i) => { const b = h('button', 'car-chip', `<i style="background:${hex(c.livery?.body ?? 0xcccccc)};box-shadow:inset 0 -1px 0 ${hex(c.livery?.stripes?.[0] ?? 0)}"></i>${esc(c.short || c.name)}`); b.onclick = () => { sel = i; upd(); }; strip.appendChild(b); return b; });
    stage.appendChild(strip);
    const info = h('div', 'car-info');
    lay.append(stage, info); s.appendChild(lay);
    const foot = h('footer', 'scr-foot'); const ok = h('button', 'btn primary big', 'Confirm Car'); ok.onclick = () => onPick?.(cars[sel].id); foot.appendChild(ok); s.appendChild(foot);
    // swipe on preview
    let sx = null, sy = 0;
    slot.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; sx = e.clientX; sy = e.clientY; });
    slot.addEventListener('pointerup', (e) => { if (sx == null) return; const dx = e.clientX - sx; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - sy)) go(dx < 0 ? 1 : -1); sx = null; });
    slot.style.touchAction = 'pan-y';
    const go = (d) => { sel = (sel + d + cars.length) % cars.length; upd(); };
    const bar = (lbl, v, frac, hi) => `<div class="stat${hi ? ' hi' : ''}"><span>${lbl}</span><span class="bar"><i style="width:${Math.round(clamp(frac, 0.04, 1) * 100)}%"></i></span><span class="v num">${v}</span></div>`;
    const upd = () => {
      const c = cars[sel], st = all[sel];
      chips.forEach((b, i) => b.classList.toggle('sel', i === sel));
      chips[sel].scrollIntoView({ inline: 'nearest', block: 'nearest' });
      num.textContent = String(c.livery?.number ?? sel + 1);
      if (svgBox) svgBox.innerHTML = carSideSVG(c);
      info.innerHTML = `<div class="era">${esc(c.era)}</div><h3>${esc(c.name)}</h3>
        <div class="car-badges"><span class="badge acc">${esc(c.drivetrain)}</span>${c.engine?.turbo ? '<span class="badge">Turbo</span>' : ''}${c.engine?.antilag ? '<span class="badge">Anti-lag</span>' : ''}${c.engine?.hybrid ? '<span class="badge">Hybrid</span>' : ''}<span class="badge">${(c.gears || []).length || '?'}-speed</span></div>
        <p>${esc(c.desc)}</p>
        <div class="stats">${bar('Power', st.hp + ' hp', st.hp / max.hp, true)}${bar('Torque', st.nm + ' Nm', st.nm / max.nm)}${bar('Weight', st.mass + ' kg', st.mass / max.mass)}${bar('Power/wt', st.hpPerTon + ' hp/t', st.hpPerTon / max.pw, true)}</div>`;
      onBrowse?.(c.id);
    };
    upd();
    return s;
  }

  // ---------- pre-stage setup ----------
  showSetup({ car, stage, compounds = [], compound, assists = {}, onStart, onBack, difficulty = 'amateur' } = {}) {
    const a = { autoGear: true, steerAssist: 0.3, tcs: false, abs: false, ...assists };
    let comp = compound ?? compounds[0]?.id; let diff = String(difficulty).toLowerCase();
    const start = () => onStart?.({ compound: comp, assists: { ...a }, difficulty: diff });
    const s = this._screen('scr-setup', { back: onBack, keys: (e) => { if (e.key === 'Enter') { start(); e.preventDefault(); } } });
    this._head(s, 'Service Park', 'Pre-Stage Setup', onBack);
    const body = h('div', 'scr-body');
    const sum = h('div', 'setup-summary', `<span>Stage <b>${esc(stage?.flag || '')} ${esc(stage?.name || '')}</b></span><span>Car <b>${esc(car?.short || car?.name || '')}</b></span>${stage ? `<span class="badge s-${esc(stage.surface)}">${SURFACE_LABEL[stage.surface] || ''}</span><span class="num">${((stage.length || 0) / 1000).toFixed(2)} km</span>` : ''}`);
    sum.style.marginBottom = '14px'; body.appendChild(sum);
    const form = h('div', 'form');
    // tyres
    const gT = h('div', 'group', '<h4>Tyres</h4>'); const ty = h('div', 'tyres');
    const tcol = (id) => ({ soft: '#ff4a3d', medium: '#ffcc00', hard: '#f2efe6', wet: '#3aa0ff', snow: '#9fd8ff', gravel: '#c58a4a', studded: '#9fd8ff' }[String(id).split('_')[0]] || '#ffcc00');
    const tbtns = compounds.map((c) => { const b = h('button', 'tyre', `${tyreIcon(tcol(c.id))}${esc(c.label)}`); b.onclick = () => { comp = c.id; tb(); }; ty.appendChild(b); return [b, c.id]; });
    const tb = () => tbtns.forEach(([b, id]) => b.classList.toggle('on', id === comp)); tb();
    gT.appendChild(compounds.length ? ty : h('div', 'empty', 'Standard compound')); form.appendChild(gT);
    // assists
    const gA = h('div', 'group', '<h4>Assists</h4>');
    const tog = (lbl, key) => { const r = h('div', 'row', `<span class="lbl">${lbl}</span>`); const t = h('button', 'toggle'); t.setAttribute('aria-label', lbl); const f = () => { t.classList.toggle('on', !!a[key]); t.setAttribute('aria-pressed', !!a[key]); }; t.onclick = () => { a[key] = !a[key]; f(); }; f(); r.appendChild(t); return r; };
    gA.append(tog('Automatic gears', 'autoGear'), tog('Traction control', 'tcs'), tog('ABS', 'abs'));
    gA.appendChild(this._range('Steering assist', a.steerAssist, (v) => { a.steerAssist = v; }));
    form.appendChild(gA);
    // difficulty
    const gD = h('div', 'group', '<h4>Rival pace</h4>');
    const diffs = [['rookie', 'Rookie'], ['amateur', 'Amateur'], ['pro', 'Pro'], ['legend', 'Legend']];
    const r = h('div', 'row'); r.appendChild(this._seg(diffs, diff, (v) => { diff = v; }, true)); gD.appendChild(r);
    gD.appendChild(h('div', 'stage-desc', '<span style="font-size:13px">Sets the target times of rival crews.</span>'));
    form.appendChild(gD);
    body.appendChild(form); s.appendChild(body);
    const foot = h('footer', 'scr-foot'); const go = h('button', 'btn primary big', 'Start Stage <span aria-hidden="true">›</span>'); go.onclick = start; foot.appendChild(go); s.appendChild(foot);
    return s;
  }
  _seg(opts, val, onSet, acc) {
    const g = h('div', 'seg' + (acc ? ' acc' : ''));
    const bs = opts.map(([v, l]) => { const b = h('button', '', esc(l)); b.onclick = () => { val = v; f(); onSet(v); }; g.appendChild(b); return [b, v]; });
    const f = () => bs.forEach(([b, v]) => { b.classList.toggle('on', v === val); b.setAttribute('aria-pressed', v === val); }); f();
    return g;
  }
  _range(lbl, val, onSet) {
    const r = h('div', 'row', `<span class="lbl">${esc(lbl)}</span>`); const w = h('div', 'range');
    const i = h('input'); i.type = 'range'; i.min = 0; i.max = 100; i.value = Math.round((val ?? 0) * 100); i.setAttribute('aria-label', lbl);
    const o = h('output', 'num', i.value);
    i.oninput = () => { o.textContent = i.value; onSet(+i.value / 100); };
    w.append(i, o); r.appendChild(w); return r;
  }
  _stage(id) { return this.stages.find((x) => x.id === id) || { id, name: id }; }
  _car(id) { return this.cars.find((x) => x.id === id) || { id, name: id, short: id }; }
  _carName(c) { if (!c) return ''; if (typeof c === 'string') { const k = this._car(c); return k.short || k.name || c; } return c.short || c.name || ''; }

  // ---------- championship ----------
  showChampionship({ events = [], standings = [], onContinue, onBack, finished } = {}) {
    const s = this._screen('scr-champ', { back: onBack, keys: (e) => { if (e.key === 'Enter') { onContinue?.(); e.preventDefault(); } } });
    const done = events.filter((e) => e.done).length;
    this._head(s, `Championship · ${done}/${events.length} stages`, finished ? 'Final Standings' : 'Championship', onBack);
    const body = h('div', 'scr-body'); const ev = h('div', 'events');
    const nextIdx = events.findIndex((e) => !e.done);
    events.forEach((e, i) => { const st = this._stage(e.stageId); ev.appendChild(h('div', `event${e.done ? ' done' : ''}${i === nextIdx ? ' next' : ''}`, `<span>SS${i + 1} ${esc(st.flag || '')}</span><b>${esc(st.name)}</b>${e.done ? `<span class="num">${fmtTime(e.time)} <span class="r">P${e.pos ?? '-'}</span></span>` : `<span>${i === nextIdx ? 'Next' : '—'}</span>`}`)); });
    body.appendChild(ev);
    const sorted = [...standings].sort((a, b) => a.total - b.total); const lead = sorted[0]?.total ?? 0;
    const t = h('table', 'tbl'); t.innerHTML = `<thead><tr><th>Pos</th><th>Driver</th><th>Car</th><th class="t">Total</th></tr></thead><tbody>${sorted.map((r, i) => `<tr class="${r.isPlayer ? 'me' : ''}"><td class="pos num">${i + 1}</td><td>${esc(r.name)}</td><td class="car">${esc(this._carName(r.car))}</td><td class="t">${i ? `<span class="gap">+${fmtTime(r.total - lead).replace(/^0:/, '')}</span>` : fmtTime(r.total)}</td></tr>`).join('')}</tbody>`;
    body.appendChild(sorted.length ? t : h('div', 'empty', 'No stages run yet'));
    s.appendChild(body);
    const foot = h('footer', 'scr-foot'); const c = h('button', 'btn primary big', finished ? 'Finish' : (done ? 'Next Stage ›' : 'Start Rally ›')); c.onclick = () => onContinue?.(); foot.appendChild(c); s.appendChild(foot);
    return s;
  }

  // ---------- results ----------
  showResults({ stage, car, time, penalties = 0, splits = [], rivals = [], isRecord, onRetry, onNext, onMenu, nextLabel } = {}) {
    const st = typeof stage === 'string' ? this._stage(stage) : (stage || {});
    const s = this._screen('scr-results', { back: onMenu, keys: (e) => { if (e.key === 'Enter') { (onNext || onRetry)?.(); e.preventDefault(); } } });
    this._head(s, `${st.event || 'Stage'} · ${st.country || ''}`, `${st.name || ''} — Stage Complete`, null);
    const body = h('div', 'scr-body'); const wrap = h('div', 'res-wrap');
    const pi = rivals.findIndex((r) => r.isPlayer || (r.name === 'You'));
    const lead = rivals[0]?.time;
    const left = h('div', '');
    const total = time + (penalties || 0) * 1000;
    left.innerHTML = `<div class="res-time num">${fmtTime(total)}</div>
      <div class="res-pos">${pi >= 0 ? `Position <b class="num">P${pi + 1}</b> / ${rivals.length}` : ''}</div>
      ${isRecord ? '<div class="res-record">NEW STAGE RECORD</div>' : ''}
      <div class="res-lines"><div><span>Car</span><b>${esc(this._carName(car))}</b></div>
      ${splits.map((ms, i) => `<div><span>Split ${i + 1}</span><b class="num">${fmtTime(ms)}</b></div>`).join('')}
      <div><span>Stage time</span><b class="num">${fmtTime(time)}</b></div>
      <div class="pen"><span>Penalties</span><b class="num">${penalties ? '+' + (+penalties).toFixed(1) + 's' : '—'}</b></div></div>`;
    const t = h('table', 'tbl');
    t.innerHTML = `<thead><tr><th>Pos</th><th>Driver</th><th>Car</th><th class="t">Time</th></tr></thead><tbody>${rivals.map((r, i) => `<tr class="${i === pi ? 'me' : ''}"><td class="pos num">${i + 1}</td><td>${esc(r.name)}</td><td class="car">${esc(this._carName(r.car))}</td><td class="t">${i ? `<span class="gap">${fmtDelta(r.time - lead)}</span>` : fmtTime(r.time)}</td></tr>`).join('')}</tbody>`;
    wrap.append(left, rivals.length ? t : h('div', 'empty', 'No rival times'));
    body.appendChild(wrap); s.appendChild(body);
    const foot = h('footer', 'scr-foot');
    if (onMenu) { const b = h('button', 'btn ghost', 'Menu'); b.onclick = onMenu; foot.appendChild(b); }
    if (onRetry) { const b = h('button', 'btn', 'Retry'); b.onclick = onRetry; foot.appendChild(b); }
    if (onNext) { const b = h('button', 'btn primary', esc(nextLabel || 'Continue') + ' ›'); b.onclick = onNext; foot.appendChild(b); }
    s.appendChild(foot);
    return s;
  }

  // ---------- pause ----------
  showPause({ onResume, onRestart, onRecover, onSettings, onQuit } = {}) {
    const s = this._screen('scr-pause', { back: onResume, overlay: true });
    const box = h('div', 'pause-box', '<h2>Paused</h2>');
    const add = (l, fn, cls = '') => { if (!fn) return; const b = h('button', 'btn ' + cls, esc(l)); b.onclick = fn; box.appendChild(b); };
    add('Resume', onResume, 'primary'); add('Recover car', onRecover); add('Restart stage', onRestart); add('Settings', onSettings); add('Quit to menu', onQuit, 'danger');
    s.appendChild(box);
    requestAnimationFrame(() => box.querySelector('button')?.focus({ preventScroll: true }));
    return s;
  }

  // ---------- settings ----------
  showSettings({ settings = {}, onChange, onBack } = {}) {
    const S = JSON.parse(JSON.stringify(settings)); S.volume = { master: 1, engine: 1, fx: 1, codriver: 1, ...(S.volume || {}) };
    const ch = () => { this.touchLayout = S.touchLayout || this.touchLayout; this.steerSensitivity = S.steerSensitivity ?? this.steerSensitivity; this.invertTilt = !!S.invertTilt; this._applyLayout(); onChange?.(JSON.parse(JSON.stringify(S))); };
    const s = this._screen('scr-settings', { back: onBack, overlay: !!this.hudEl.classList.contains('on') });
    this._head(s, 'Options', 'Settings', onBack);
    const body = h('div', 'scr-body'); const form = h('div', 'form');
    const seg = (lbl, key, opts) => { const r = h('div', 'row', `<span class="lbl">${esc(lbl)}</span>`); r.appendChild(this._seg(opts, S[key], (v) => { S[key] = v; ch(); })); return r; };
    const tog = (lbl, key) => { const r = h('div', 'row', `<span class="lbl">${esc(lbl)}</span>`); const t = h('button', 'toggle'); t.setAttribute('aria-label', lbl); const f = () => t.classList.toggle('on', !!S[key]); t.onclick = () => { S[key] = !S[key]; f(); ch(); }; f(); r.appendChild(t); return r; };
    const g1 = h('div', 'group', '<h4>Graphics &amp; view</h4>');
    g1.append(seg('Quality', 'quality', [['auto', 'Auto'], ['low', 'Low'], ['med', 'Med'], ['high', 'High']]),
      seg('Camera', 'camera', [['chase', 'Chase'], ['chase_far', 'Far'], ['bonnet', 'Bonnet'], ['cockpit', 'Cockpit'], ['bumper', 'Bumper']]),
      seg('Units', 'units', [['kmh', 'km/h'], ['mph', 'mph']]), tog('Damage', 'damage'));
    const g2 = h('div', 'group', '<h4>Co-driver &amp; audio</h4>');
    g2.append(tog('Co-driver calls', 'codriver'), tog('Co-driver voice', 'codriverVoice'), tog('Pace-note panel', 'showPaceNotes'));
    for (const [k, l] of [['master', 'Master'], ['engine', 'Engine'], ['fx', 'Effects'], ['codriver', 'Co-driver']]) g2.appendChild(this._range(l + ' volume', S.volume[k], (v) => { S.volume[k] = v; ch(); }));
    const g3 = h('div', 'group', '<h4>Touch controls</h4>');
    g3.append(seg('Layout', 'touchLayout', [['wheel', 'Slider'], ['buttons', 'Buttons'], ['tilt', 'Tilt']]), tog('Invert tilt', 'invertTilt'),
      this._range('Steering sensitivity', S.steerSensitivity ?? 0.5, (v) => { S.steerSensitivity = v; ch(); }));
    form.append(g1, g2, g3); body.appendChild(form); s.appendChild(body);
    return s;
  }

  // ---------- records ----------
  showRecords({ records = {}, stages = this.stages, cars = this.cars, onBack } = {}) {
    const s = this._screen('scr-records', { back: onBack });
    this._head(s, 'Time Trial', 'Stage Records', onBack);
    const body = h('div', 'scr-body'); const t = h('table', 'tbl');
    const carN = (id) => { const c = cars.find((x) => x.id === id); return c ? (c.short || c.name) : (id || ''); };
    t.innerHTML = `<thead><tr><th>Stage</th><th>Surface</th><th>Car</th><th class="t">Best</th></tr></thead><tbody>${stages.map((st) => { const r = records[st.id]; return `<tr><td>${esc(st.flag || '')} ${esc(st.name)}</td><td><span class="badge s-${esc(st.surface)}">${SURFACE_LABEL[st.surface] || ''}</span></td><td class="car">${r ? esc(carN(r.car)) : '—'}</td><td class="t">${r ? fmtTime(r.time) : '<span class="gap">—</span>'}</td></tr>`; }).join('')}</tbody>`;
    body.appendChild(t); s.appendChild(body);
    return s;
  }

  // ================= HUD =================
  _buildHUD() {
    const H = this.hudEl = h('div', 'hud');
    H.innerHTML = `
      <div class="hud-top"><div class="prog"><div class="fill"></div><div class="dot"></div></div>
        <div class="timer-row"><div class="timer num">0:00.0</div><div class="delta num"></div></div>
        <div class="stage-lbl"><span class="sn"></span><span class="pen"></span></div></div>
      <div class="notes"><div class="note-icons">${'<div class="ni empty"><svg viewBox="0 0 48 48"></svg><span></span></div>'.repeat(3)}</div><div class="note-call"></div></div>
      <div class="dmg"><svg viewBox="0 0 42 72">
        <rect class="d-body" x="8" y="6" width="26" height="60" rx="7" fill="none" stroke="#f2efe6" stroke-opacity=".6" stroke-width="1.5"/>
        <rect class="d-eng" x="12" y="10" width="18" height="14" rx="2"/>
        <rect class="d-str" x="13" y="27" width="16" height="3" rx="1"/>
        <rect class="d-w0" x="2" y="12" width="6" height="13" rx="2"/><rect class="d-w1" x="34" y="12" width="6" height="13" rx="2"/>
        <rect class="d-w2" x="2" y="47" width="6" height="13" rx="2"/><rect class="d-w3" x="34" y="47" width="6" height="13" rx="2"/>
        <rect x="13" y="34" width="16" height="12" rx="2" fill="#f2efe6" fill-opacity=".12"/></svg><div class="lbl">DMG</div></div>
      <div class="tacho"><div class="leds">${'<i></i>'.repeat(10)}</div>
        <div class="tacho-body"><svg class="arc" viewBox="0 0 230 126"><path class="trk" d="M19 116 A96 96 0 0 1 211 116"/><path class="red" d="M19 116 A96 96 0 0 1 211 116"/><path class="val" d="M19 116 A96 96 0 0 1 211 116"/><g class="ticks"></g></svg>
          <span class="hb">HB</span><span class="rpmtxt num"></span><div class="gear num">N</div><div class="speed num"><span class="sv">0</span><small class="su">KM/H</small></div><div class="boost"><i></i></div></div></div>
      <div class="banner ww">Wrong Way</div><div class="banner rec">Recovering…</div>`;
    this.root.appendChild(H);
    const q = (s) => H.querySelector(s);
    const ARC = Math.PI * 96;
    this._hud = {
      prog: q('.prog'), fill: q('.prog .fill'), dot: q('.prog .dot'), timer: q('.timer'), delta: q('.delta'), sn: q('.sn'), pen: q('.stage-lbl .pen'),
      notes: q('.notes'), call: q('.note-call'), ni: [...H.querySelectorAll('.ni')].map((e) => ({ el: e, svg: e.querySelector('svg'), lbl: e.querySelector('span'), key: '' })),
      dmg: q('.dmg'), dparts: ['eng', 'str', 'w0', 'w1', 'w2', 'w3'].map((k) => q('.d-' + k)),
      leds: q('.leds'), ledEls: [...H.querySelectorAll('.leds i')], arc: q('.arc .val'), red: q('.arc .red'), ticks: q('.ticks'), gear: q('.gear'), sv: q('.sv'), su: q('.su'), rpm: q('.rpmtxt'), hb: q('.hb'), boost: q('.boost i'), bwrap: q('.boost'),
      ww: q('.banner.ww'), rec: q('.banner.rec'), ARC, splits: [], prev: {},
    };
    for (const p of [this._hud.arc, this._hud.red, H.querySelector('.arc .trk')]) p.style.strokeDasharray = `${ARC} ${ARC}`;
    this._hud.arc.style.strokeDashoffset = ARC;
  }
  showHUD(on = true) {
    this.hudEl.classList.toggle('on', !!on);
    if (on) { this._hud.prev = {}; this.hideAll(); }
    this.showTouch(on && this.touchEnabled);
  }
  _set(key, val, fn) { const p = this._hud.prev; if (p[key] !== val) { p[key] = val; fn(val); } }
  updateHUD(st = {}) {
    const H = this._hud; if (!H) return; const set = this._set.bind(this);
    // limits / tacho geometry (rarely changes)
    const maxR = st.maxRpm || (st.limiter ? st.limiter * 1.08 : 8000), red = st.redline || maxR * 0.88, lim = st.limiter || red * 1.03;
    set('geom', `${maxR}|${red}`, () => {
      const f = clamp(red / maxR, 0, 1); H.red.style.strokeDasharray = `${H.ARC * (1 - f)} ${H.ARC * 2}`; H.red.style.strokeDashoffset = -H.ARC * f;
      let t = ''; const step = 1000; for (let r = 0; r <= maxR; r += step) { const a = Math.PI * (1 - r / maxR); const c = Math.cos(a), s = Math.sin(a); t += `<line class="tick" x1="${115 + c * 82}" y1="${116 - s * 82}" x2="${115 + c * 88}" y2="${116 - s * 88}"/>`; }
      H.ticks.innerHTML = t;
    });
    const rpm = st.rpm || 0, fr = clamp(rpm / maxR, 0, 1);
    set('arc', Math.round(fr * 300), (v) => { H.arc.style.strokeDashoffset = H.ARC * (1 - v / 300); });
    set('hot', rpm >= red * 0.94, (v) => H.arc.classList.toggle('hot', v));
    // shift LEDs: light from 70% of redline to redline
    const lo = red * 0.72, n = rpm <= lo ? 0 : Math.min(10, Math.ceil((rpm - lo) / (red - lo) * 10));
    set('leds', n, (k) => H.ledEls.forEach((e, i) => { e.className = i < k ? (i < 4 ? 'g' : i < 7 ? 'y' : 'r') : ''; }));
    set('flash', rpm >= lim - 40, (v) => H.leds.classList.toggle('flash', v));
    set('rpmt', Math.round(rpm / 100), (v) => { H.rpm.textContent = (v / 10).toFixed(1) + 'k'; });
    const g = st.gear ?? 0; set('gear', g, (v) => { H.gear.textContent = v < 0 ? 'R' : v === 0 ? 'N' : String(v); H.gear.classList.toggle('r', v < 0); });
    const mph = st.units === 'mph'; set('units', mph, (v) => { H.su.textContent = v ? 'MPH' : 'KM/H'; });
    set('spd', Math.round(Math.abs(st.kmh || 0) * (mph ? 0.621371 : 1)), (v) => { H.sv.textContent = v; });
    set('hb', !!st.handbrake, (v) => H.hb.classList.toggle('on', v));
    const b = st.boost; set('boostOn', b != null, (v) => { H.bwrap.style.display = v ? '' : 'none'; });
    if (b != null) set('boost', Math.round(b * 50), (v) => { H.boost.style.width = v * 2 + '%'; });
    // timer / delta
    set('time', Math.floor((st.time || 0) / 100), () => { H.timer.textContent = fmtTime(st.time || 0, true); });
    const d = st.delta; set('delta', d == null ? null : Math.round(d / 10), (v) => { H.delta.classList.toggle('on', v != null); if (v != null) { H.delta.textContent = fmtDelta(v * 10); H.delta.classList.toggle('pos', v > 0); H.delta.classList.toggle('neg', v <= 0); } });
    set('sn', st.stageName || '', (v) => { H.sn.textContent = v; });
    set('pen', st.penalty || 0, (v) => { H.pen.textContent = v ? `+${(+v).toFixed(1)}s` : ''; });
    // progress
    const L = st.length || 1;
    set('pf', Math.round(clamp((st.distance || 0) / L, 0, 1) * 1000), (v) => { H.fill.style.width = v / 10 + '%'; H.dot.style.left = v / 10 + '%'; });
    const sp = st.splits || this._splitPos || [1 / 3, 2 / 3];
    set('splitsGeom', sp.join(','), () => { H.splits.forEach((e) => e.remove()); H.splits = sp.map((f) => { const e = h('div', 'split'); e.style.left = (f > 1 ? f / L : f) * 100 + '%'; H.prog.appendChild(e); return e; }); });
    set('splitIdx', st.splitIndex || 0, (v) => H.splits.forEach((e, i) => e.classList.toggle('passed', i < v)));
    // pace notes
    set('call', st.paceNote || '', (v) => { H.call.textContent = v; });
    const nn = st.nextNotes || [];
    for (let i = 0; i < 3; i++) {
      const n = nn[i], slot = H.ni[i], key = n ? `${n.icon?.dir}|${n.icon?.sev}|${n.text}` : '';
      if (slot.key !== key) { slot.key = key; slot.el.classList.toggle('empty', !n); if (n) { slot.el.querySelector('svg').outerHTML = noteIconSVG(n.icon || {}); slot.lbl.textContent = n.text || ''; } }
    }
    // damage
    const dp = st.damageParts || {}; const sus = dp.suspension || [];
    const vals = [dp.engine ?? st.damage ?? 0, dp.steering ?? 0, sus[0] ?? 0, sus[1] ?? 0, sus[2] ?? 0, sus[3] ?? 0];
    set('dmgv', vals.map((v) => Math.round(v * 10)).join(), () => vals.forEach((v, i) => { H.dparts[i].setAttribute('fill', dmgColor(v)); }));
    set('ww', !!st.wrongWay, (v) => H.ww.classList.toggle('on', v));
    set('rec', !!st.recovering, (v) => H.rec.classList.toggle('on', v));
  }
  setHudOptions({ showPaceNotes, damage, splits } = {}) {
    if (showPaceNotes != null) this._hud.notes.classList.toggle('off', !showPaceNotes);
    if (damage != null) this._hud.dmg.classList.toggle('off', !damage);
    if (splits) { this._splitPos = splits; this._hud.prev.splitsGeom = undefined; }
  }

  showCountdown(n) {
    this.cdEl.innerHTML = '';
    if (n == null || n < 0) return;
    const sp = h('span', n === 0 ? 'go' : '', n === 0 ? 'GO' : String(n)); this.cdEl.appendChild(sp);
    clearTimeout(this._cdT); this._cdT = setTimeout(() => { if (sp.parentNode) sp.remove(); }, n === 0 ? 900 : 1100);
  }
  showSplit({ index = 0, time, delta } = {}) {
    const d = delta == null ? '' : ` <span class="d ${delta > 0 ? 'pos' : 'neg'}">${fmtDelta(delta)}</span>`;
    this._toast(`Split ${index + 1} &nbsp;${fmtTime(time)}${d}`, 'split', 3000);
  }
  showPenalty(sec) { this._toast(`Penalty +${(+sec).toFixed(1)}s`, 'pen', 2500); }
  showMessage(text, ms = 2000) {
    this.msgEl.textContent = text; this.msgEl.classList.remove('on'); void this.msgEl.offsetWidth; this.msgEl.classList.add('on');
    clearTimeout(this._msgT); this._msgT = setTimeout(() => this.msgEl.classList.remove('on'), ms);
  }
  toast(text, ms = 2500) { this._toast(esc(text), '', ms); }
  _toast(html, cls, ms) {
    const t = h('div', 'toast ' + cls, html); this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
    setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 320); }, ms);
  }

  // ================= touch controls =================
  _buildTouch() {
    const T = this.touchEl = h('div', 'touch l-wheel');
    T.innerHTML = `
      <div class="t-top"><button class="t-btn" data-a="recover" aria-label="Recover">${ICON.recover}</button><button class="t-btn" data-a="camera" aria-label="Camera">${ICON.cam}</button><button class="t-btn" data-a="pause" aria-label="Pause">${ICON.pause}</button></div>
      <div class="t-steer"><div class="rail"><div class="knob"></div></div></div>
      <div class="t-arrows"><button class="t-arr" data-d="-1" aria-label="Steer left">${ICON.back}</button><button class="t-arr" data-d="1" aria-label="Steer right">${ICON.next}</button></div>
      <div class="tilt-ind"><i></i></div>
      <div class="t-pedals">
        <div class="t-shift"><button class="t-btn" data-a="up" aria-label="Shift up">+</button><button class="t-btn" data-a="down" aria-label="Shift down">−</button></div>
        <div class="t-hb" data-p="handbrake">HAND<br>BRAKE</div>
        <div class="pedal brk" data-p="brake"><div class="lvl"></div><span>BRAKE</span></div>
        <div class="pedal gas" data-p="throttle"><div class="lvl"></div><span>THROTTLE</span></div>
      </div>`;
    this.root.appendChild(T);
    const ts = this.touchState, cb = this._touchCb;
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    for (const ev of ['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'dblclick']) T.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    // top buttons
    T.querySelectorAll('.t-btn').forEach((b) => b.addEventListener('pointerdown', (e) => {
      stop(e); b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 140);
      ({ recover: cb.onRecover, camera: cb.onCamera, pause: cb.onPause, up: cb.shiftUp, down: cb.shiftDown })[b.dataset.a]?.();
    }));
    // steering slider (left zone); finger can land anywhere in the zone, offset from touch-start x
    const zone = T.querySelector('.t-steer'), knob = T.querySelector('.knob');
    let sid = null, sx = 0;
    const setSteer = (v) => { ts.steer = clamp(v, -1, 1); knob.style.transform = `translateX(${ts.steer * 70}px)`; };
    zone.addEventListener('pointerdown', (e) => { stop(e); if (sid != null) return; sid = e.pointerId; sx = e.clientX; zone.setPointerCapture?.(e.pointerId); zone.classList.add('active'); setSteer(0); });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId !== sid) return; stop(e); setSteer((e.clientX - sx) / 90); });
    const endS = (e) => { if (e.pointerId !== sid) return; sid = null; zone.classList.remove('active'); setSteer(0); };
    zone.addEventListener('pointerup', endS); zone.addEventListener('pointercancel', endS); zone.addEventListener('lostpointercapture', endS);
    this._setSteerVisual = setSteer;
    // pedals: analog by vertical position (bottom 20% = full, top = 0.35) — any press >= 0.35
    T.querySelectorAll('[data-p]').forEach((p) => {
      const key = p.dataset.p, lvl = p.querySelector('.lvl'); let pid = null;
      const val = (e) => { if (key === 'handbrake') return 1; const r = p.getBoundingClientRect(); const f = clamp((r.bottom - e.clientY) / r.height, 0, 1); return clamp(1.12 - f * 0.8, 0.35, 1); };
      const set = (v) => { ts[key] = v; p.classList.toggle('down', v > 0); if (lvl) lvl.style.height = v * 100 + '%'; };
      p.addEventListener('pointerdown', (e) => { stop(e); pid = e.pointerId; p.setPointerCapture?.(e.pointerId); set(val(e)); });
      p.addEventListener('pointermove', (e) => { if (e.pointerId === pid) { stop(e); set(val(e)); } });
      const end = (e) => { if (e.pointerId === pid) { pid = null; set(0); } };
      p.addEventListener('pointerup', end); p.addEventListener('pointercancel', end); p.addEventListener('lostpointercapture', end);
    });
    // buttons layout: ramp 0 -> ±1 over 0.15s
    const held = new Map(); let raf = 0, last = 0;
    const tick = (t) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016; last = t;
      let target = 0; for (const d of held.values()) target += d; target = clamp(target, -1, 1);
      const rate = dt / 0.15; const cur = ts.steer;
      ts.steer = target === 0 ? (Math.abs(cur) < rate * 1.5 ? 0 : cur - Math.sign(cur) * rate * 1.5) : clamp(cur + clamp(target - cur, -rate, rate), -1, 1);
      if (held.size || ts.steer !== 0) raf = requestAnimationFrame(tick); else { raf = 0; last = 0; }
    };
    T.querySelectorAll('.t-arr').forEach((b) => {
      const d = +b.dataset.d;
      b.addEventListener('pointerdown', (e) => { stop(e); b.setPointerCapture?.(e.pointerId); held.set(e.pointerId, d); b.classList.add('down'); if (!raf) raf = requestAnimationFrame(tick); });
      const end = (e) => { if (held.delete(e.pointerId)) { b.classList.remove('down'); if (!raf) raf = requestAnimationFrame(tick); } };
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('lostpointercapture', end);
    });
    this._tiltInd = T.querySelector('.tilt-ind i');
  }
  setTouch(on) { this.touchEnabled = !!on; this.showTouch(this.touchEnabled && this.hudEl?.classList.contains('on')); }
  showTouch(on) {
    if (!this.touchEl) return;
    this.touchEl.classList.toggle('on', !!on); this.hudEl?.classList.toggle('touching', !!on);
    if (!on) { Object.assign(this.touchState, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }); this._setSteerVisual?.(0); }
    this._applyLayout();
  }
  setTouchLayout(layout, { steerSensitivity, invertTilt } = {}) {
    if (layout) this.touchLayout = layout; if (steerSensitivity != null) this.steerSensitivity = steerSensitivity; if (invertTilt != null) this.invertTilt = !!invertTilt;
    this._applyLayout();
  }
  _applyLayout() {
    if (!this.touchEl) return;
    const L = this.touchLayout || 'wheel';
    this.touchEl.classList.remove('l-wheel', 'l-buttons', 'l-tilt'); this.touchEl.classList.add('l-' + L);
    if (L === 'tilt' && this.touchEl.classList.contains('on') && !this._tiltOn && this._tiltGranted) this._listenTilt();
  }
  async requestTilt() {
    try {
      const D = window.DeviceOrientationEvent;
      if (!D) return false;
      if (typeof D.requestPermission === 'function') { const r = await D.requestPermission(); if (r !== 'granted') return false; }
      this._tiltGranted = true; this._listenTilt(); return true;
    } catch (e) { console.warn('tilt permission', e); return false; }
  }
  _listenTilt() {
    if (this._tiltOn) return; this._tiltOn = true;
    window.addEventListener('deviceorientation', (e) => {
      if (this.touchLayout !== 'tilt' || !this.touchEl.classList.contains('on')) return;
      const ang = (screen.orientation?.angle ?? window.orientation ?? 0) | 0;
      let a; // tilt angle left/right in degrees, positive = right
      if (ang === 90) a = e.beta; else if (ang === -90 || ang === 270) a = -e.beta; else a = e.gamma;
      if (a == null) return;
      if (this.invertTilt) a = -a;
      const full = 25 * (1.2 - clamp(this.steerSensitivity ?? 0.5, 0, 1));
      const mag = Math.max(0, Math.abs(a) - 2);
      this.touchState.steer = clamp(Math.sign(a) * mag / Math.max(3, full - 2), -1, 1);
      if (this._tiltInd) this._tiltInd.style.left = 50 + this.touchState.steer * 50 + '%';
    });
  }
}

function dmgColor(v) {
  v = clamp(v || 0, 0, 1);
  if (v < 0.05) return 'rgba(242,239,230,.35)';
  if (v < 0.35) return '#ffcc00';
  if (v < 0.7) return '#ff8a1f';
  return '#ff3b30';
}

export default UI;
