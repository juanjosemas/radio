// ╔══════════════════════════════════════════════════════════╗
// ║  Service Worker mejorado para Radio Pro - España        ║
// ║  Mantiene la app viva en segundo plano                  ║
// ╚══════════════════════════════════════════════════════════╝

const CACHE_NAME = 'radio-pro-v2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// --- Instalación: cachear assets estáticos ---
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => {
            self.skipWaiting();
        })
    );
});

// --- Activación: limpiar cachés antiguos ---
self.addEventListener('activate', (event) => {
    console.log('[SW] Activando Service Worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => {
            return clients.claim();
        })
    );
});

// --- Fetch: network-first para streams, cache-first para assets ---
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Para streams de audio: siempre ir a la red (nunca cachear streams)
    if (event.request.destination === 'audio' || 
        url.href.includes('.mp3') || 
        url.href.includes('.m3u8') ||
        url.href.includes('streamtheworld') ||
        url.href.includes('flumotion') ||
        url.href.includes('radioking') ||
        url.href.includes('laut.fm') ||
        url.href.includes('181fm') ||
        url.href.includes('audiomediaradio') ||
        url.href.includes('technolovers') ||
        url.href.includes('nrjaudio') ||
        url.href.includes('80s80s')) {
        
        // Network-only para streams de audio
        event.respondWith(
            fetch(event.request).catch(() => {
                // Si falla la red, devolver un error claro
                return new Response('', { 
                    status: 503, 
                    statusText: 'Stream no disponible' 
                });
            })
        );
        return;
    }
    
    // Para assets estáticos: network-first con fallback a cache
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Guardar en caché si es un asset estático
                if (event.request.method === 'GET') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback a caché si no hay red
                return caches.match(event.request).then((cachedResponse) => {
                    return cachedResponse || new Response('Offline', { status: 503 });
                });
            })
    );
});

// --- Mensajes del cliente ---
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
