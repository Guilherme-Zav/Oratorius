/**
 * Tela inicial.
 *
 * Uma ação principal: "Treinar hoje". Todo o resto é contexto.
 * O aviso de backup fica aqui, e não escondido em Ajustes, porque o único risco
 * real de perda de dados no ADR-003 é o usuário nunca exportar nada.
 */

import { h, fmtDuration } from '../dom.ts';
import { streakBars } from '../charts.ts';
import { registerScreen, type AppContext } from '../app.ts';
import { buildSession } from '../../engine/session.ts';
import { startPractice } from './practice.ts';
import {
  currentStreak, dailyStats, daysSinceBackup, practiceSecondsToday, recentAttempts,
} from '../../data/store.ts';
import { levelFor } from '../../engine/progression.ts';
import { TRACKS } from '../../content/exercises.ts';

function card(...children: (Node | string | false | null)[]): HTMLElement {
  return h('section', { class: 'card' }, ...children);
}

export function renderHome(ctx: AppContext): HTMLElement {
  const plan = buildSession(ctx.state.progress, ctx.state.reviews);

  const root = h('div', { class: 'screen home' });

  root.appendChild(h('header', { class: 'app-header' },
    h('h1', { class: 'brand', text: 'Oratorius' }),
    h('p', { class: 'brand-sub', text: 'treino de fala' }),
  ));

  // ------------------------------------------------ acao primaria
  const cta = h('button', { class: 'cta' },
    h('span', { class: 'cta-label', text: 'Treinar hoje' }),
    h('span', {
      class: 'cta-meta',
      text: `${plan.exerciseIds.length} exercícios · cerca de ${Math.round(plan.estimatedSec / 60)} min`,
    }),
  );
  cta.addEventListener('click', () => startPractice(ctx, plan));
  root.appendChild(cta);

  // ------------------------------------------------ blocos do dia
  const blocks = h('ul', { class: 'plan' });
  for (const b of plan.blocks) {
    blocks.appendChild(h('li', { class: 'plan-item' },
      h('strong', { text: b.title }),
      h('span', { class: 'muted', text: b.subtitle }),
    ));
  }
  root.appendChild(card(h('h2', { text: 'Plano de hoje' }), blocks));

  // ------------------------------------------------ dados assincronos
  const statsCard = card(h('h2', { text: 'Constância' }), h('p', { class: 'muted', text: 'carregando…' }));
  root.appendChild(statsCard);

  const levelsCard = card(h('h2', { text: 'Seus níveis' }));
  const levelList = h('ul', { class: 'levels' });
  for (const t of TRACKS) {
    const level = levelFor(ctx.state.progress, t.id);
    levelList.appendChild(h('li', { class: 'level-row' },
      h('span', { text: t.name }),
      h('span', { class: 'level-badge', text: `${level}/${t.maxLevel}` }),
    ));
  }
  levelsCard.appendChild(levelList);
  root.appendChild(levelsCard);

  void hydrate(ctx, statsCard, root);
  return root;
}

async function hydrate(ctx: AppContext, statsCard: HTMLElement, root: HTMLElement): Promise<void> {
  const [streak, todaySec, stats, sinceBackup, recent] = await Promise.all([
    currentStreak(),
    practiceSecondsToday(),
    dailyStats(21),
    daysSinceBackup(),
    recentAttempts(1),
  ]);

  const goalSec = ctx.state.settings.dailyGoalMin * 60;
  const pct = Math.min(100, Math.round((todaySec / goalSec) * 100));

  statsCard.replaceChildren(
    h('h2', { text: 'Constância' }),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' },
        h('span', { class: 'stat-value', text: String(streak) }),
        h('span', { class: 'stat-label', text: streak === 1 ? 'dia seguido' : 'dias seguidos' }),
      ),
      h('div', { class: 'stat' },
        h('span', { class: 'stat-value', text: fmtDuration(todaySec) }),
        h('span', { class: 'stat-label', text: `de ${ctx.state.settings.dailyGoalMin} min hoje` }),
      ),
    ),
    h('div', { class: 'progress-bar' },
      h('div', { class: 'progress-fill', style: `width:${pct}%` }),
    ),
    streakBars(stats.map((s) => ({ day: s.day, value: s.practiceSec }))),
    h('p', { class: 'muted small', text: 'últimas 3 semanas' }),
  );

  if (recent.length === 0) {
    root.insertBefore(
      h('div', { class: 'notice info' },
        h('strong', { text: 'Primeira vez aqui?' }),
        h('p', {
          text: 'Toque em "Treinar hoje" para começar. Na primeira gravação o navegador vai pedir permissão para usar o microfone: precisa aceitar.',
        }),
        (() => {
          const b = h('button', { class: 'btn small', text: 'Ver meu problema de fala' });
          b.addEventListener('click', () => ctx.go('conditions'));
          return b;
        })(),
      ),
      root.children[1] ?? null,
    );
  }

  // Aviso de backup: aparece a partir de 7 dias, e fica mais insistente com o tempo.
  if (sinceBackup === null || sinceBackup >= 7) {
    const urgent = sinceBackup !== null && sinceBackup >= 21;
    root.insertBefore(
      h('div', { class: `notice ${urgent ? 'warn' : 'info'}` },
        h('strong', {
          text: sinceBackup === null ? 'Você ainda não fez backup' : `Último backup há ${sinceBackup} dias`,
        }),
        h('p', {
          text: 'O navegador do iPhone pode apagar os dados do app sozinho. Salve uma cópia de vez em quando: o arquivo é pequeno e traz tudo de volta.',
        }),
        (() => {
          const b = h('button', { class: 'btn small', text: 'Ir para Ajustes' });
          b.addEventListener('click', () => ctx.go('settings'));
          return b;
        })(),
      ),
      root.children[1] ?? null,
    );
  }
}

registerScreen('home', renderHome);
