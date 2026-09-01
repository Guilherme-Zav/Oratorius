/** Lista completa: treinar um grupo inteiro ou um exercício solto, fora do plano do dia. */

import { h } from '../dom.ts';
import { registerScreen, type AppContext } from '../app.ts';
import { EXERCISES, TRACKS, exercisesByTrack } from '../../content/exercises.ts';
import type { Exercise, Track } from '../../content/types.ts';
import { levelFor } from '../../engine/progression.ts';
import { buildTrackSession, singleExerciseSession } from '../../engine/session.ts';
import { startPractice } from './practice.ts';
import { allAttempts } from '../../data/store.ts';

let openTrack: Track | null = null;

export function renderLibrary(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'screen library' });
  root.appendChild(h('header', { class: 'app-header' }, h('h1', { text: 'Todos os exercícios' })));

  for (const track of TRACKS) {
    const level = levelFor(ctx.state.progress, track.id);
    const list = exercisesByTrack(track.id);
    const isOpen = openTrack === track.id;

    const header = h('button', { class: `track-head${isOpen ? ' open' : ''}` },
      h('div', { class: 'track-info' },
        h('strong', { text: track.name }),
        h('span', { class: 'muted small', text: track.description }),
      ),
      h('span', { class: 'level-badge', text: `${level}/${track.maxLevel}` }),
    );
    header.addEventListener('click', () => {
      openTrack = isOpen ? null : track.id;
      ctx.render();
    });

    const section = h('section', { class: 'card track' }, header);

    if (isOpen) {
      const run = h('button', { class: 'btn primary wide', text: `Treinar tudo até o degrau ${level}` });
      run.addEventListener('click', () => startPractice(ctx, buildTrackSession(track.id, level)));
      section.appendChild(run);

      let lastLevel = -1;
      const ul = h('ul', { class: 'exercise-list' });
      for (const ex of list) {
        if (ex.level !== lastLevel) {
          lastLevel = ex.level;
          const locked = ex.level > level;
          ul.appendChild(h('li', { class: `level-sep${locked ? ' locked' : ''}` },
            `Degrau ${ex.level}`,
            locked ? h('span', { class: 'lock', text: ' · você chega lá' }) : null,
          ));
        }
        ul.appendChild(exerciseRow(ctx, ex, ex.level > level));
      }
      section.appendChild(ul);
    }

    root.appendChild(section);
  }

  root.appendChild(h('p', { class: 'muted small center' },
    `${EXERCISES.length} exercícios no total.`,
  ));

  void annotateCounts(root);
  return root;
}

function exerciseRow(ctx: AppContext, ex: Exercise, locked: boolean): HTMLElement {
  const row = h('li', { class: `exercise-row${locked ? ' locked' : ''}` },
    h('div', { class: 'exercise-row-main' },
      h('strong', { text: ex.title }),
      h('span', { class: 'muted small', text: preview(ex.prompt) }),
    ),
    h('span', { class: 'count', data: { exercise: ex.id }, text: '' }),
  );

  // Niveis nao liberados continuam praticaveis — travar de vez seria paternalista.
  // O rotulo existe para orientar a ordem, nao para impedir.
  row.addEventListener('click', () => startPractice(ctx, singleExerciseSession(ex.id)));
  return row;
}

function preview(prompt: string): string {
  const single = prompt.replace(/\n/g, ' · ');
  return single.length > 62 ? `${single.slice(0, 60)}…` : single;
}

/** Mostra quantas vezes cada exercicio ja foi feito. */
async function annotateCounts(root: HTMLElement): Promise<void> {
  const attempts = await allAttempts();
  const counts = new Map<string, number>();
  for (const a of attempts) counts.set(a.exerciseId, (counts.get(a.exerciseId) ?? 0) + 1);

  for (const el of root.querySelectorAll<HTMLElement>('[data-exercise]')) {
    const n = counts.get(el.dataset.exercise ?? '') ?? 0;
    el.textContent = n > 0 ? `${n}x` : '';
  }
}

registerScreen('library', renderLibrary);
