/**
 * Tela de problemas de fala.
 *
 * É a porta de entrada para os exercícios. A organização antiga era por técnica
 * — "Motricidade", "Agilidade", "Articulação" —, que é como um fonoaudiólogo
 * pensa, e não como quem usa o app pensa. Quem usa chega sabendo o sintoma
 * ("eu troco o R"), não o nome da família de exercícios.
 *
 * Cada problema abre uma página que responde, nesta ordem: como se chama, o que
 * é, como soa na prática, como saber se é o seu caso, e o que treinar.
 */

import { h } from '../dom.ts';
import { registerScreen, type AppContext } from '../app.ts';
import { CONDITIONS, getCondition, type Condition } from '../../content/conditions.ts';
import { TRACKS, exercisesByTrack } from '../../content/exercises.ts';
import type { Exercise, Track } from '../../content/types.ts';
import { levelFor } from '../../engine/progression.ts';
import { buildTrackSession, singleExerciseSession } from '../../engine/session.ts';
import { startPractice } from './practice.ts';
import { saveSettings } from '../../data/store.ts';

let openConditionId: string | null = null;

export function openCondition(ctx: AppContext, id: string): void {
  openConditionId = id;
  ctx.go('conditions');
}

export function renderConditions(ctx: AppContext): HTMLElement {
  const current = openConditionId ? getCondition(openConditionId) : null;
  return current ? renderDetail(ctx, current) : renderList(ctx);
}

// ------------------------------------------------------------------- lista

function renderList(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'screen conditions' });
  root.appendChild(h('header', { class: 'app-header' },
    h('h1', { text: 'Problemas de fala' }),
    h('p', { class: 'muted', text: 'Escolha o seu para ver o que é e o que treinar.' }),
  ));

  const mine = ctx.state.settings.primaryCondition;
  // O problema do usuário vem primeiro: é o que ele abre todo dia.
  const ordered = [...CONDITIONS].sort((a, b) =>
    (a.id === mine ? -1 : 0) - (b.id === mine ? -1 : 0));

  for (const c of ordered) {
    const isMine = c.id === mine;
    const card = h('button', { class: `card condition-card${isMine ? ' mine' : ''}` },
      isMine ? h('span', { class: 'tag-mine', text: 'O seu' }) : null,
      h('strong', { class: 'condition-name', text: c.plainName }),
      h('span', { class: 'muted small', text: `${c.family} · ${c.clinicalName}` }),
      h('p', { class: 'condition-summary', text: c.summary }),
      h('span', { class: 'go', text: 'Ver e treinar →' }),
    );
    card.addEventListener('click', () => openCondition(ctx, c.id));
    root.appendChild(card);
  }

  root.appendChild(h('p', { class: 'muted small center disclaimer' },
    'Este app treina e mede. Ele não dá diagnóstico. Se algo aqui parecer o seu caso, '
    + 'vale confirmar com um fonoaudiólogo.',
  ));

  return root;
}

// ------------------------------------------------------------------ detalhe

function renderDetail(ctx: AppContext, c: Condition): HTMLElement {
  const root = h('div', { class: 'screen condition-detail' });

  const back = h('button', { class: 'back', text: '← Todos os problemas' });
  back.addEventListener('click', () => {
    openConditionId = null;
    ctx.render();
  });
  root.appendChild(back);

  root.appendChild(h('header', { class: 'app-header' },
    h('h1', { text: c.plainName }),
    h('p', { class: 'muted', text: `Nome técnico: ${c.clinicalName} (${c.family})` }),
  ));

  const isMine = ctx.state.settings.primaryCondition === c.id;
  if (!isMine) {
    const pick = h('button', { class: 'btn wide', text: 'Definir como o meu problema' });
    pick.addEventListener('click', async () => {
      await saveSettings({ primaryCondition: c.id });
      await ctx.reload();
      ctx.toast('Pronto. O treino do dia vai focar nisso.', 'ok');
    });
    root.appendChild(pick);
  }

  // --- O que é ---
  const what = h('section', { class: 'card' }, h('h2', { text: 'O que é' }));
  for (const p of c.explanation) what.appendChild(h('p', { text: p }));
  root.appendChild(what);

  // --- Exemplos ---
  const ex = h('section', { class: 'card' },
    h('h2', { text: 'Como soa' }),
    h('p', { class: 'muted small', text: 'À esquerda como deveria sair; à direita como costuma sair.' }),
  );
  const table = h('div', { class: 'examples' });
  for (const e of c.examples) {
    table.appendChild(h('div', { class: 'example' },
      h('span', { class: 'ex-right', text: e.correct }),
      h('span', { class: 'ex-arrow', text: '→' }),
      h('span', { class: 'ex-wrong', text: e.wrong }),
    ));
  }
  ex.appendChild(table);
  root.appendChild(ex);

  // --- Sinais ---
  const signs = h('section', { class: 'card' }, h('h2', { text: 'É o seu caso?' }));
  const ul = h('ul', { class: 'signs' });
  for (const s of c.signs) ul.appendChild(h('li', { text: s }));
  signs.appendChild(ul);
  root.appendChild(signs);

  // --- O que o treino faz ---
  root.appendChild(h('section', { class: 'card' },
    h('h2', { text: 'O que o treino resolve' }),
    h('p', { text: c.whatTrainingDoes }),
  ));

  // --- Exercícios ---
  root.appendChild(h('h2', { class: 'section-title', text: 'Exercícios para isso' }));
  for (const trackId of c.tracks) {
    root.appendChild(trackSection(ctx, trackId));
  }

  // --- Quando procurar alguém ---
  root.appendChild(h('section', { class: 'card warn-card' },
    h('h2', { text: 'Quando procurar um profissional' }),
    h('p', { text: c.seeProfessional }),
  ));

  return root;
}

function trackSection(ctx: AppContext, trackId: Track): HTMLElement {
  const track = TRACKS.find((t) => t.id === trackId);
  if (!track) return h('div');

  const level = levelFor(ctx.state.progress, trackId);
  const list = exercisesByTrack(trackId);

  const section = h('section', { class: 'card track' },
    h('div', { class: 'track-info' },
      h('strong', { text: track.name }),
      h('span', { class: 'muted small', text: track.description }),
    ),
  );

  const run = h('button', { class: 'btn primary wide', text: 'Treinar isto agora' });
  run.addEventListener('click', () => startPractice(ctx, buildTrackSession(trackId, level)));
  section.appendChild(run);

  const details = h('details', { class: 'exercise-details' },
    h('summary', { text: `Ver os ${list.length} exercícios` }),
  );
  const ul = h('ul', { class: 'exercise-list' });
  let lastLevel = -1;
  for (const e of list) {
    if (e.level !== lastLevel) {
      lastLevel = e.level;
      const locked = e.level > level;
      ul.appendChild(h('li', { class: `level-sep${locked ? ' locked' : ''}` },
        `Degrau ${e.level}`,
        locked ? h('span', { class: 'lock', text: ' · você chega lá' }) : null,
      ));
    }
    ul.appendChild(exerciseRow(ctx, e));
  }
  details.appendChild(ul);
  section.appendChild(details);

  return section;
}

function exerciseRow(ctx: AppContext, e: Exercise): HTMLElement {
  const row = h('li', { class: 'exercise-row' },
    h('div', { class: 'exercise-row-main' },
      h('strong', { text: e.title }),
      h('span', { class: 'muted small', text: preview(e.prompt) }),
    ),
    h('span', { class: 'go', text: '▶' }),
  );
  row.addEventListener('click', () => startPractice(ctx, singleExerciseSession(e.id)));
  return row;
}

function preview(prompt: string): string {
  const single = prompt.replace(/\n/g, ' · ');
  return single.length > 62 ? `${single.slice(0, 60)}…` : single;
}

registerScreen('conditions', renderConditions);
