// Adds decimated route previews + reference times to data/stages/index.json
import fs from 'node:fs';
import { Stage } from '../js/stage.js';
import { referenceTime } from '../js/rivals.js';
const idx = JSON.parse(fs.readFileSync('data/stages/index.json', 'utf8'));
for (const e of idx) {
  const raw = JSON.parse(fs.readFileSync(`data/stages/${e.id}.json`, 'utf8'));
  const st = new Stage(raw);
  const pv = [];
  for (let i = 0; i < raw.road.length; i += 8) pv.push([Math.round(raw.road[i][0]), Math.round(raw.road[i][2])]);
  e.preview = pv;
  e.climb = Math.round(Math.max(...raw.road.map((p) => p[1])) - Math.min(...raw.road.map((p) => p[1])));
  e.lat = raw.origin.lat; e.lon = raw.origin.lon; e.alt = raw.origin.alt;
  e.refTime = Math.round(referenceTime(st) * 1000);
  console.log(e.id, (e.refTime / 1000).toFixed(1) + 's', e.climb + 'm climb');
}
fs.writeFileSync('data/stages/index.json', JSON.stringify(idx));
