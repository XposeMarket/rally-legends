import fs from 'node:fs';
const idx = JSON.parse(fs.readFileSync('data/stages/index.json', 'utf8'));
for (const e of idx) {
  const s = JSON.parse(fs.readFileSync(`data/stages/${e.id}.json`, 'utf8'));
  const r = s.road;
  let minR = 1e9, sharp = 0, maxGrade = 0, crossings = 0, near = 0;
  for (let i = 2; i < r.length - 2; i++) {
    const a = r[i - 2], b = r[i], c = r[i + 2];
    const h1 = Math.atan2(b[2] - a[2], b[0] - a[0]), h2 = Math.atan2(c[2] - b[2], c[0] - b[0]);
    let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const rad = 8 / Math.max(1e-6, Math.abs(d));
    if (rad < minR) minR = rad; if (rad < 12) sharp++;
    const g = Math.abs(r[i + 1][1] - r[i][1]) / 4; if (g > maxGrade) maxGrade = g;
  }
  // non-adjacent proximity (road overlapping itself)
  for (let i = 0; i < r.length; i += 3) for (let j = i + 40; j < r.length; j += 3) {
    const d = Math.hypot(r[i][0] - r[j][0], r[i][2] - r[j][2]);
    if (d < s.width * 1.6 && Math.abs(r[i][1] - r[j][1]) < 6) { near++; }
  }
  console.log(`${e.id.padEnd(11)} ${(s.length/1000).toFixed(2)}km minR ${minR.toFixed(1)}m sharp(<12m) ${sharp} maxGrade ${(maxGrade*100).toFixed(0)}% selfNear ${near} startY ${r[0][1]} endY ${r[r.length-1][1]} gridMax ${Math.max(...s.grid.h).toFixed(0)}`);
}
