// Dev helper: receives canvas dataURL POSTs from tools/car-test.html and saves them to shots/<name>.png
import http from 'node:http';
import fs from 'node:fs';
fs.mkdirSync('shots', { recursive: true });
http.createServer((q, r) => {
  let b = ''; q.on('data', (d) => (b += d));
  q.on('end', () => {
    r.setHeader('Access-Control-Allow-Origin', '*');
    if (q.method === 'POST') { const n = q.url.slice(1).replace(/[^\w.-]/g, ''); fs.writeFileSync('shots/' + n, Buffer.from(b.split(',')[1], 'base64')); }
    r.end('ok');
  });
}).listen(5192, () => console.log('shot receiver on 5192'));
