// Generates real rally pace notes from the stage geometry (WRC 1-6 severity scale, 6 = fastest).
// Severity is derived from the corner's minimum radius; modifiers: tightens/opens/long/don't cut/over crest/jump.
export function generatePaceNotes(stage) {
  const N = stage.N, curv = stage.curv, S = stage.s, py = stage.py;
  // smoothed curvature
  const k = new Float32Array(N);
  for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let j = -3; j <= 3; j++) { const q = Math.min(N - 1, Math.max(0, i + j)); a += curv[q]; c++; } k[i] = a / c; }
  const TH = 1 / 220; // straighter than R=220m => "straight"
  const notes = [];
  let i = 0;
  while (i < N) {
    if (Math.abs(k[i]) < TH) { i++; continue; }
    const sign = Math.sign(k[i]);
    let j = i, kmax = 0, imax = i, turn = 0;
    while (j < N && Math.sign(k[j]) === sign && Math.abs(k[j]) >= TH * 0.7) { if (Math.abs(k[j]) > kmax) { kmax = Math.abs(k[j]); imax = j; } if (j > i) turn += k[j] * (S[j] - S[j - 1]); j++; }
    const len = S[Math.min(N - 1, j)] - S[i];
    const totalTurn = Math.abs(turn) * 180 / Math.PI;
    if (totalTurn < 12 || len < 6) { i = j; continue; }
    const R = 1 / kmax;
    let sev;
    if (R < 9 || (totalTurn > 150 && R < 16)) sev = 'hairpin';
    else if (totalTurn > 75 && totalTurn < 105 && len < 22 && R < 22) sev = 'square';
    else if (R < 18) sev = 1; else if (R < 30) sev = 2; else if (R < 48) sev = 3; else if (R < 75) sev = 4; else if (R < 120) sev = 5; else sev = 6;
    const mods = [];
    const third = (j - i) / 3;
    const kFirst = Math.abs(k[Math.floor(i + third / 2)]), kLast = Math.abs(k[Math.floor(j - 1 - third / 2)]);
    if (kLast > kFirst * 1.6 && sev !== 'hairpin') mods.push('tightens');
    else if (kFirst > kLast * 1.6 && sev !== 'hairpin') mods.push('opens');
    if (len > 80 && typeof sev === 'number') mods.unshift('long');
    notes.push({ s: S[i], end: S[Math.min(N - 1, j)], dir: sign > 0 ? 'R' : 'L', sev, mods, R, turn: totalTurn, apex: S[imax] });
    i = j;
  }
  // crests & jumps: local maxima of road height with sharp convex vertical curvature
  const crests = [];
  for (let a = 6; a < N - 6; a++) {
    const y0 = py[a - 6], y1 = py[a], y2 = py[a + 6];
    const d1 = (y1 - y0) / (S[a] - S[a - 6]), d2 = (y2 - y1) / (S[a + 6] - S[a]);
    const vc = (d2 - d1) / ((S[a + 6] - S[a - 6]) / 2); // vertical curvature (1/m), negative = crest
    if (vc < -0.0045 && y1 >= py[a - 1] && y1 >= py[a + 1]) {
      const kind = vc < -0.009 && d1 > 0.04 ? 'jump' : 'crest';
      if (!crests.length || S[a] - crests[crests.length - 1].s > 40) crests.push({ s: S[a] - 10, kind, sev: kind, dir: null, mods: [], R: 1e9 });
    }
  }
  // merge crests into corner notes ("over crest") or standalone
  for (const c of crests) {
    const hit = notes.find((n) => c.s >= n.s - 25 && c.s <= n.end);
    if (hit) { if (!hit.mods.includes(c.kind === 'jump' ? 'over jump' : 'over crest')) hit.mods.push(c.kind === 'jump' ? 'over jump' : 'over crest'); }
    else notes.push(c);
  }
  notes.sort((a, b) => a.s - b.s);
  // "don't cut" when there's a ditch/obstacle side: we don't know, so use: fast (sev>=4) corner after a crest
  // distance calls + "into" chaining
  for (let n = 0; n < notes.length; n++) {
    const cur = notes[n], nxt = notes[n + 1];
    if (!nxt) { cur.link = 'finish'; continue; }
    const gap = nxt.s - (cur.end || cur.s + 10);
    if (gap < 15) cur.link = 'into';
    else if (gap < 30) cur.link = 'and';
    else cur.link = Math.round(Math.min(gap, 500) / 10) * 10 >= 100 ? String(Math.round(Math.min(gap, 500) / 50) * 50) : String(Math.round(gap / 10) * 10);
  }
  for (const n of notes) n.text = noteText(n);
  return notes;
}

const DIR = { L: 'left', R: 'right' };
export function noteText(n, withLink = true) {
  let t;
  if (n.sev === 'crest') t = 'crest';
  else if (n.sev === 'jump') t = 'jump! caution';
  else if (n.sev === 'hairpin') t = `hairpin ${DIR[n.dir]}`;
  else if (n.sev === 'square') t = `square ${DIR[n.dir]}`;
  else t = `${DIR[n.dir]} ${n.sev}`;
  if (n.mods.length) t += ' ' + n.mods.join(', ');
  if (withLink && n.link) t += n.link === 'into' ? ', into' : n.link === 'and' ? ', and' : n.link === 'finish' ? ', to finish' : `, ${n.link}`;
  return t;
}
// short label for HUD
export function noteShort(n) {
  if (n.sev === 'crest') return 'CREST';
  if (n.sev === 'jump') return 'JUMP';
  if (n.sev === 'hairpin') return `${n.dir} HP`;
  if (n.sev === 'square') return `${n.dir} SQ`;
  return `${n.dir}${n.sev}${n.mods.includes('tightens') ? '↘' : n.mods.includes('opens') ? '↗' : ''}`;
}

export class CoDriver {
  constructor(notes, { leadTime = 3.2 } = {}) { this.notes = notes; this.idx = 0; this.lead = leadTime; this.calledUpTo = -1; }
  reset() { this.idx = 0; this.calledUpTo = -1; }
  // returns array of new notes to speak this frame
  update(s, speed) {
    const out = [];
    while (this.idx < this.notes.length && this.notes[this.idx].s < s - 5) this.idx++;
    const lookDist = Math.max(55, speed * this.lead);
    let k = this.calledUpTo + 1;
    if (k < this.idx) k = this.idx;
    // call next note when within look distance; chain "into/and" notes together
    while (k < this.notes.length && this.notes[k].s - s < lookDist) {
      out.push(this.notes[k]);
      this.calledUpTo = k;
      if (this.notes[k].link !== 'into' && this.notes[k].link !== 'and') { k++; break; }
      k++;
    }
    return out;
  }
  upcoming(s, count = 3) {
    const r = [];
    for (let k = this.idx; k < this.notes.length && r.length < count; k++) if (this.notes[k].end === undefined ? this.notes[k].s > s - 5 : this.notes[k].end > s) r.push(this.notes[k]);
    return r;
  }
}
