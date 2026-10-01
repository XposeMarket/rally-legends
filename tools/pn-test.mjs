import fs from 'node:fs';
import { Stage } from '../js/stage.js';
import { generatePaceNotes } from '../js/pacenotes.js';
for (const id of ['turini','ouninpohja','monaco']) {
  const st = new Stage(JSON.parse(fs.readFileSync(`data/stages/${id}.json`,'utf8')));
  const n = generatePaceNotes(st);
  console.log(id, n.length, 'notes;', n.slice(0, 12).map(x => `[${x.s.toFixed(0)}] ${x.text}`).join(' | '));
}
