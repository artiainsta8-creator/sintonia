// Service worker do Sintonia: guarda a interface para abrir sem internet e
// serve as faixas baixadas (Cache API), inclusive pedidos com Range (avançar/voltar).
const SHELL = 'sintonia-shell-v4';
const AUDIO = 'dormir-audio-v1'; // nome antigo mantido para não perder faixas já baixadas
const FILES = ['./', 'sintonia.css', 'sintonia.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function rangeResponse(req, cached) {
  const range = req.headers.get('Range');
  if (!range) return cached;
  const blob = await cached.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = m && m[2] ? Math.min(Number(m[2]), blob.size - 1) : blob.size - 1;
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${blob.size}`, 'Content-Length': String(end - start + 1),
    },
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/sons/')) {
    e.respondWith((async () => {
      const c = await caches.open(AUDIO);
      const hit = await c.match(url.href);
      return hit ? rangeResponse(e.request, hit) : fetch(e.request);
    })());
    return;
  }

  if (url.pathname.startsWith('/sintonia/')) {
    // Rede primeiro para pegar atualizações. Se o Codespace estiver desligado, o GitHub
    // responde 404/401/redirect (não é "sem rede"), então qualquer resposta ruim também
    // cai na cópia guardada. Depois de 4 s sem resposta, usa a cópia.
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const cached = () => c.match(e.request, { ignoreSearch: true }).then((r) => r || c.match('./'));
      try {
        // no-cache: sempre confere com o servidor se há versão nova (o GitHub Pages guarda cópias por 10 min)
        const req = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
        const res = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 4000)),
        ]);
        if (res.ok && !res.redirected && res.type === 'basic') {
          c.put(e.request, res.clone());
          return res;
        }
        return (await cached()) || res;
      } catch {
        return (await cached()) || Response.error();
      }
    })());
  }
});
