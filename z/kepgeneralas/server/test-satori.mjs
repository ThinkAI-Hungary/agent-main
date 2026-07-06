import http from 'http';

const data = JSON.stringify({
  baseImageUrl: 'http://localhost:3001/renders/composite-1783367958193.jpg',
  satoriStyleId: 'gradient-bottom',
  text: 'TESZT SZOVEG',
  cta: 'MEGNEZEM',
  width: 1080,
  height: 1350
});

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/image/satori-render',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('RESPONSE:', body.substring(0, 500));
  });
});
req.on('error', e => console.error('ERROR:', e.message));
req.write(data);
req.end();
