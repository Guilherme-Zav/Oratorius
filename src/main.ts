/** Ponto de entrada. */

import { createApp } from './ui/app.ts';
import { requestPersistence } from './data/audioStore.ts';
import { runRetention } from './data/store.ts';

// Registrar as telas tem efeito colateral (registerScreen), por isso os imports
// vem pelo modulo, nao por simbolo.
import './ui/screens/home.ts';
import './ui/screens/practice.ts';
import './ui/screens/progress.ts';
import './ui/screens/library.ts';
import './ui/screens/conditions.ts';
import './ui/screens/settings.ts';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Elemento #app nao encontrado');

  const ctx = await createApp(root);
  ctx.render();

  // Pede persistencia na primeira execucao. Sem isso o Safari pode despejar os
  // dados de sites pouco usados (ADR-003).
  void requestPersistence();

  // Retencao de audio na abertura — nunca durante uma gravacao.
  void runRetention().catch(() => { /* falha de limpeza nao pode derrubar o app */ });

  // O iOS suspende o AudioContext ao sair do app; liberar o microfone tambem
  // apaga o indicador laranja de gravacao.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !ctx.recorder.isRecording && ctx.state.screen !== 'practice') {
      void ctx.recorder.release();
    }
  });

  if ('serviceWorker' in navigator) {
    const swUrl = new URL('./sw.js', document.baseURI).href;
    navigator.serviceWorker.register(swUrl).catch(() => {
      // Sem service worker o app ainda funciona online. Nao vale interromper.
    });
  }
}

boot().catch((err) => {
  const root = document.getElementById('app');
  if (root) {
    root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'notice warn';
    box.innerHTML = `<strong>Falha ao iniciar</strong><p>${String(err?.message ?? err)}</p>`;
    root.appendChild(box);
  }
  console.error(err);
});
