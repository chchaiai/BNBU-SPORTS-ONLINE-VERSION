// Development-only server. Never proxies or accepts API requests.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const frontend = path.resolve(__dirname, '../../../BNBU-Sports-Web-new/frontend/student');
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2'};
http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {res.writeHead(405); res.end(); return;}
  let pathname;
  try {pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);} catch {res.writeHead(400); res.end(); return;}
  let file;
  if (pathname === '/') file = path.join(__dirname, 'index.html');
  else if (['/preview.js','/scenes.html','/experience.js','/experience-storage.mjs'].includes(pathname)) file = path.join(__dirname, pathname.slice(1));
  else if (pathname.startsWith('/student/')) {
    const candidate = path.resolve(frontend, pathname.slice('/student/'.length));
    if (candidate.startsWith(frontend + path.sep)) file = candidate;
  }
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404); res.end(); return;}
  res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
}).listen(4181, '127.0.0.1', () => console.log('Student experience: http://127.0.0.1:4181/'));
