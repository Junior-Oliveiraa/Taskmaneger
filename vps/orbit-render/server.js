// Servidor HTTP do gerador de cards. Roda na VPS ao lado da Evolution API,
// exposto pelo Caddy em https://<vps>/render.
//
//   POST /render/proposta   (Authorization: Bearer $RENDER_TOKEN)  JSON -> image/png
//   GET  /render/health     -> ok
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { renderCard } from './card.js';

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.RENDER_TOKEN || '';
const MAX_BODY = 256 * 1024;

if (!TOKEN) {
  console.error('RENDER_TOKEN não definido; recusando subir sem autenticação.');
  process.exit(1);
}

function autorizado(req) {
  const got = Buffer.from(req.headers.authorization || '');
  const want = Buffer.from(`Bearer ${TOKEN}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

function lerJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload grande demais'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    if (req.method === 'GET' && url.pathname === '/render/health') return json(res, 200, { ok: true });
    if (req.method !== 'POST' || url.pathname !== '/render/proposta') return json(res, 404, { error: 'not found' });
    if (!autorizado(req)) return json(res, 401, { error: 'unauthorized' });

    try {
      const input = await lerJson(req);
      const t = Date.now();
      const png = await renderCard(input);
      console.log(`proposta ${input.numero ?? '?'} renderizada em ${Date.now() - t} ms (${png.length} bytes)`);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
      res.end(png);
    } catch (e) {
      console.error('falha ao renderizar:', e?.message || e);
      json(res, e?.status || 500, { error: e?.message || 'erro' });
    }
  })
  .listen(PORT, () => console.log(`orbit-render ouvindo na porta ${PORT}`));
