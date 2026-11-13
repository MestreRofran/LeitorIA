// LeitorIA 3.0 · Service Worker
// Regras:
//  - index.html e navegação: rede primeiro (atualizações chegam sozinhas); cache só se estiver offline.
//  - Ícones e manifesto: cache primeiro.
//  - Bibliotecas de CDN com versão fixada (PDF, MP3, runtime da voz natural): cache primeiro, guardadas na primeira vez.
//  - Modelos de voz (Hugging Face, dezenas de MB): NÃO entram no cache, porque o app já os guarda no armazenamento próprio.
//  - Qualquer outra coisa: vai direto para a rede, sem cache.

const CACHE_NAME = 'leitoria-v3.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const LIB_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'esm.sh',
  'unpkg.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isLib(url) {
  return LIB_HOSTS.includes(url.hostname);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Respostas opacas (cross-origin sem CORS) também são aceitas: são bibliotecas de versão fixada.
  if (response.ok || response.type === 'opaque') {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const hit = await cache.match(request) || await cache.match('./index.html');
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Modelos de voz e qualquer outro host fora da lista: sem cache.
  if (url.origin !== self.location.origin && !isLib(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isLib(url)) {
    event.respondWith(cacheFirst(request));
  }
});
