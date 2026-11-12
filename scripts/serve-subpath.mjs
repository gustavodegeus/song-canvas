// Production smoke-test server: no transforms, SPA fallback, or isolation headers.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith('/song-canvas/')) { response.writeHead(404).end(); return; }
    const file = resolve(root, path.slice('/song-canvas/'.length) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(data);
  } catch { response.writeHead(404).end(); }
}).listen(5175, '127.0.0.1', () => console.log('Production build at http://127.0.0.1:5175/song-canvas/'));
