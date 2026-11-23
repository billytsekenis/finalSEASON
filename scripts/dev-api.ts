// Τοπικός server ανάπτυξης: εκτελεί τα αρχεία του /api όπως το Vercel (Web Request/Response).
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

const port = Number(process.env.API_PORT ?? 3001);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const file = resolve('api', `${url.pathname.replace(/^\/api\//, '')}.ts`);
    if (!url.pathname.startsWith('/api/') || url.pathname.includes('_lib') || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    const mod = (await import(pathToFileURL(file).href)) as Record<string, (r: Request) => Promise<Response>>;
    const handler = mod[req.method ?? 'GET'];
    if (!handler) {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(url, {
      method: req.method,
      headers,
      body: chunks.length && req.method !== 'GET' ? Buffer.concat(chunks) : undefined,
    });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String(e));
  }
}).listen(port, () => console.log(`API on http://localhost:${port}`));
