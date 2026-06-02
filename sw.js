// Este es el Service Worker básico para que Android reconozca la App como una PWA activa
self.addEventListener('install', (event) => {
    // Forzamos la instalación inmediata sin esperar a que se cierren otras pestañas
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Tomamos el control de la aplicación inmediatamente
    event.waitUntil(clients.claim());
});

// El evento fetch es necesario aunque esté vacío para que se considere una aplicación instalable
self.addEventListener('fetch', (event) => {
    // No hace falta cachear nada para una radio, pero el evento debe existir
});