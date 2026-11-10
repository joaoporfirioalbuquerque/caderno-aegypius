/* Caderno de Campo Aegypius — funciona sem rede.
   A app (página, bibliotecas, fundo do mapa) fica guardada no telemóvel; as fotos já vistas também.
   Os dados vêm do Supabase e a cópia local é gerida pela própria app. */
const VERSAO = 'aeg-v1';
const APP = ['./', './index.html', './manifest.webmanifest', './js/config.js', './js/ligacao.js',
  './vendor/supabase.js', './vendor/leaflet.js', './vendor/xlsx.full.min.js', './osm_fundo.webp',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== 'aeg-fotos' && k !== 'aeg-fontes').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if(req.method !== 'GET') return;
  const url = new URL(req.url);
  // fotos públicas do Storage: guardar depois da primeira vez
  if(/\/storage\/v1\/object\/public\/fotos\//.test(url.pathname)){
    e.respondWith(caches.open('aeg-fotos').then(async c => (await c.match(req)) || fetch(req).then(r => { if(r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // restantes pedidos ao Supabase (dados, sessão): sempre à rede
  if(/supabase\.co$/.test(url.hostname)) return;
  // letras do Google Fonts
  if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.open('aeg-fontes').then(async c => (await c.match(req)) || fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => new Response('', {status: 504}))));
    return;
  }
  if(url.origin !== location.origin) return;
  // a própria app: responde já com a cópia guardada e atualiza em fundo
  e.respondWith(caches.open(VERSAO).then(async c => {
    const hit = await c.match(req, {ignoreSearch: true}) || (req.mode === 'navigate' ? await c.match('./index.html') : null);
    const net = fetch(req).then(r => { if(r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('Sem rede', {status: 503});
  }));
});
