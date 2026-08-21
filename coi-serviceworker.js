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

    function reloadOnce(){
      // evita loop infinito de recarregamento caso algo dê errado
      if (window.sessionStorage.getItem('coiReloadedOnce') === '1') return;
      window.sessionStorage.setItem('coiReloadedOnce', '1');
      window.location.reload();
    }

    navigator.serviceWorker.register(window.document.currentScript.src).then(
      (registration) => {
        // caso já exista um worker ativo controlando outra aba, mas não essa página ainda
        if (registration.active && !navigator.serviceWorker.controller) {
          reloadOnce();
          return;
        }
        // primeira instalação: espera o worker (installing ou waiting) ficar ativo, então recarrega
        const trackWorker = registration.installing || registration.waiting;
        if (trackWorker) {
          trackWorker.addEventListener('statechange', () => {
            if (trackWorker.state === 'activated') reloadOnce();
          });
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker){
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') reloadOnce();
            });
          }
        });
      },
      (err) => console.error('[coi-serviceworker] falha ao registrar', err)
    );
  })();
}
