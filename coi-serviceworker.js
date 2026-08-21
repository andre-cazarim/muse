/*
  coi-serviceworker.js
  ---------------------------------------------------------------
  O GitHub Pages não permite configurar cabeçalhos HTTP customizados
  (nada de _headers, .htaccess ou similar). Mas o ffmpeg.wasm (usado
  no Compressor de Vídeo) precisa dos cabeçalhos Cross-Origin-Opener-Policy
  e Cross-Origin-Embedder-Policy pra poder usar SharedArrayBuffer.

  Esse service worker resolve isso do lado do navegador: ele intercepta
  as respostas e adiciona os dois cabeçalhos antes de entregar pra página,
  sem precisar de nenhuma configuração no servidor.

  Baseado na técnica padrão de "cross-origin isolation via service worker",
  usada por projetos como Pyodide, WebContainers e o próprio ffmpeg.wasm
  pra funcionar em hosts estáticos (GitHub Pages, S3, etc).
*/
if (typeof window === 'undefined') {
  // Está rodando dentro do próprio service worker
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('fetch', function (event) {
    const request = event.request;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response;
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error('[coi-serviceworker] falha ao buscar', e))
    );
  });
} else {
  // Está rodando na página normal — registra o service worker
  (function () {
    if (window.crossOriginIsolated !== false) return; // já está isolado, nada a fazer
    if (!window.isSecureContext) {
      console.warn('[coi-serviceworker] precisa de HTTPS pra funcionar (GitHub Pages já serve em HTTPS, então isso só é um problema se você abrir o arquivo localmente).');
      return;
    }
    navigator.serviceWorker.register(window.document.currentScript.src).then(
      (registration) => {
        registration.addEventListener('updatefound', () => window.location.reload());
        if (registration.active && !navigator.serviceWorker.controller) {
          window.location.reload();
        }
      },
      (err) => console.error('[coi-serviceworker] falha ao registrar', err)
    );
  })();
}
