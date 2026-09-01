/**
 * Ajustes: preferências, diagnóstico do ambiente e backup.
 *
 * O bloco de backup fica no topo, e não no rodapé, porque é a única defesa real
 * contra o único modo de falha grave do ADR-003 (o navegador apagar os dados).
 */

import { h, fmtNumber } from '../dom.ts';
import { registerScreen, type AppContext } from '../app.ts';
import {
  daysSinceBackup, exportBackup, importBackup, runRetention, saveSettings, wipeEverything,
} from '../../data/store.ts';
import { requestPersistence, storageStatus } from '../../data/audioStore.ts';
import { micSupport } from '../../audio/capture.ts';
import { describeVoices, loadVoices } from '../../audio/speech.ts';
import { todayKey, type CodaRhotic } from '../../data/model.ts';
import { CONDITIONS } from '../../content/conditions.ts';

function card(title: string, ...children: (Node | string | null | false)[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', { text: title }), ...children);
}

export function renderSettings(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'screen settings' });
  root.appendChild(h('header', { class: 'app-header' }, h('h1', { text: 'Ajustes' })));

  root.appendChild(backupCard(ctx));
  root.appendChild(preferencesCard(ctx));
  root.appendChild(diagnosticsCard());
  root.appendChild(dangerCard(ctx));

  root.appendChild(h('p', { class: 'disclaimer' },
    'Oratorius v0.1 · app pessoal, funciona todo dentro do seu celular. ',
    'Nenhuma gravação sai do aparelho. Não é aparelho médico e não dá diagnóstico.',
  ));

  return root;
}

// ---------------------------------------------------------------- backup

function backupCard(ctx: AppContext): HTMLElement {
  const status = h('p', { class: 'muted small', text: 'conferindo…' });

  const exportBtn = h('button', { class: 'btn primary wide', text: 'Exportar backup' });
  exportBtn.addEventListener('click', async () => {
    try {
      const data = await exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oratorius-backup-${todayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      await saveSettings({ lastBackupAt: new Date().toISOString() });
      await ctx.reload();
      ctx.toast('Backup pronto. Salve no app Arquivos ou no iCloud.', 'ok');
    } catch (err) {
      ctx.toast(`Falha ao exportar: ${(err as Error).message}`, 'error');
    }
  });

  const fileInput = h('input', { type: 'file', class: 'hidden-input' });
  fileInput.accept = 'application/json,.json';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!confirm(
      'Restaurar APAGA tudo que está aqui e coloca no lugar o que estiver no arquivo. Não dá para desfazer. Quer continuar?',
    )) {
      fileInput.value = '';
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const result = await importBackup(parsed);
      await ctx.reload();
      ctx.toast(`Restaurado: ${result.attempts} gravações e ${result.sessions} treinos.`, 'ok');
    } catch (err) {
      ctx.toast(`Falha ao importar: ${(err as Error).message}`, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  const importBtn = h('button', { class: 'btn wide', text: 'Restaurar um backup' });
  importBtn.addEventListener('click', () => fileInput.click());

  const el = card('Backup',
    h('p', { class: 'muted small' },
      'O arquivo leva só os seus números e o seu progresso, e ocupa quase nada. As gravações de voz não vão junto ',
      '(seriam centenas de MB), e por isso nenhum número do seu histórico depende delas.',
    ),
    status,
    exportBtn,
    importBtn,
    fileInput,
  );

  void (async () => {
    const days = await daysSinceBackup();
    status.textContent = days === null
      ? 'Você ainda não fez nenhum backup.'
      : days === 0 ? 'Backup feito hoje.' : `Último backup há ${days} dia(s).`;
    status.className = days === null || days >= 7 ? 'muted small warn-text' : 'muted small';
  })();

  return el;
}

// ---------------------------------------------------------------- preferencias

function preferencesCard(ctx: AppContext): HTMLElement {
  const s = ctx.state.settings;

  // --- alvo do R em coda ---
  const codaOptions: Array<{ value: CodaRhotic; label: string; example: string }> = [
    { value: 'fricativa', label: 'Puxado da garganta', example: 'como fala a maior parte do Brasil' },
    { value: 'tepe', label: 'Batidinho', example: 'toque rápido da língua, comum no Sul e na capital de SP' },
    { value: 'retroflexo', label: 'Do interior', example: 'o "r" caipira, do interior paulista' },
  ];

  const codaGroup = h('div', { class: 'options' });
  for (const opt of codaOptions) {
    const btn = h('button', {
      class: `option${s.codaRhoticTarget === opt.value ? ' selected' : ''}`,
    },
      h('strong', { text: opt.label }),
      h('span', { class: 'muted small', text: opt.example }),
    );
    btn.addEventListener('click', async () => {
      await saveSettings({ codaRhoticTarget: opt.value });
      await ctx.reload();
    });
    codaGroup.appendChild(btn);
  }

  // --- rigor ---
  const strictLabels = ['Tolerante', 'Normal', 'Exigente'];
  const strictGroup = h('div', { class: 'segmented' });
  for (let i = 1; i <= 3; i++) {
    const btn = h('button', {
      class: `seg${s.strictness === i ? ' selected' : ''}`,
      text: strictLabels[i - 1],
    });
    btn.addEventListener('click', async () => {
      await saveSettings({ strictness: i as 1 | 2 | 3 });
      await ctx.reload();
    });
    strictGroup.appendChild(btn);
  }

  // --- meta diaria ---
  const goal = h('input', {
    type: 'range', min: '5', max: '30', step: '1', value: String(s.dailyGoalMin),
  });
  const goalLabel = h('span', { class: 'range-value', text: `${s.dailyGoalMin} min` });
  goal.addEventListener('input', () => { goalLabel.textContent = `${goal.value} min`; });
  goal.addEventListener('change', async () => {
    await saveSettings({ dailyGoalMin: Number(goal.value) });
    await ctx.reload();
  });

  // --- retencao de audio ---
  const keep = h('input', {
    type: 'range', min: '7', max: '180', step: '1', value: String(s.keepAudioDays),
  });
  const keepLabel = h('span', { class: 'range-value', text: `${s.keepAudioDays} dias` });
  keep.addEventListener('input', () => { keepLabel.textContent = `${keep.value} dias`; });
  keep.addEventListener('change', async () => {
    await saveSettings({ keepAudioDays: Number(keep.value) });
    await ctx.reload();
  });

  // --- maos livres ---
  const hands = h('button', {
    class: `toggle${s.handsFree ? ' on' : ''}`,
    text: s.handsFree ? 'Ligado' : 'Desligado',
  });
  hands.addEventListener('click', async () => {
    await saveSettings({ handsFree: !s.handsFree });
    await ctx.reload();
  });

  // --- problema principal ---
  const condGroup = h('div', { class: 'options' });
  for (const c of CONDITIONS) {
    const btn = h('button', {
      class: `option${s.primaryCondition === c.id ? ' selected' : ''}`,
    },
      h('strong', { text: c.plainName }),
      h('span', { class: 'muted small', text: c.summary }),
    );
    btn.addEventListener('click', async () => {
      await saveSettings({ primaryCondition: c.id });
      await ctx.reload();
    });
    condGroup.appendChild(btn);
  }

  return card('Preferências',
    h('div', { class: 'field' },
      h('label', { text: 'Meu problema de fala' }),
      h('p', { class: 'muted small', text: 'Define o foco do treino do dia.' }),
      condGroup,
    ),
    h('div', { class: 'field' },
      h('label', { text: 'Seu jeito de falar o R no fim das palavras' }),
      h('p', { class: 'muted small' },
        'Em "porta", "verde", "sorte". Não existe um jeito certo: muda de região para região. ',
        'Escolha o seu, e o app não vai tratar o seu sotaque como erro.',
      ),
      codaGroup,
    ),
    h('div', { class: 'field' },
      h('label', { text: 'Quão exigente o app deve ser' }),
      h('p', { class: 'muted small', text: 'Muda só a nota de corte. Os números medidos são sempre os mesmos.' }),
      strictGroup,
    ),
    h('div', { class: 'field row' },
      h('label', { text: 'Meta de treino por dia' }), goalLabel,
    ),
    goal,
    h('div', { class: 'field row' },
      h('label', { text: 'Guardar gravações por' }), keepLabel,
    ),
    keep,
    h('p', { class: 'muted small', text: 'As gravações que você fixar (★) nunca são apagadas.' }),
    h('div', { class: 'field row' },
      h('div', {},
        h('label', { text: 'Passar sozinho' }),
        h('p', { class: 'muted small', text: 'Vai para o próximo exercício sem você tocar na tela. Bom para treinar em pé, na frente do espelho.' }),
      ),
      hands,
    ),
  );
}

// ---------------------------------------------------------------- diagnostico

function diagnosticsCard(): HTMLElement {
  const list = h('dl', { class: 'diag' });
  const el = card('Diagnóstico', list,
    h('p', { class: 'muted small', text: 'Confira esta lista na primeira vez que abrir o app no iPhone.' }),
  );

  void (async () => {
    const rows: Array<[string, string, boolean]> = [];

    const mic = micSupport();
    rows.push(['Microfone', mic.ok ? 'disponivel' : (mic.reason ?? 'indisponivel'), mic.ok]);
    rows.push([
      'Contexto seguro',
      window.isSecureContext ? 'sim (HTTPS)' : 'NÃO — o microfone não vai funcionar assim',
      window.isSecureContext,
    ]);
    rows.push([
      'Instalado na tela de inicio',
      window.matchMedia('(display-mode: standalone)').matches ? 'sim' : 'não (está aberto no navegador)',
      true,
    ]);

    const storage = await storageStatus();
    rows.push(['Armazenamento de audio', storage.backend === 'opfs' ? 'OPFS' : 'IndexedDB (alternativo)', true]);
    rows.push([
      'Dados persistentes',
      storage.persisted ? 'sim' : 'NAO — o navegador pode apagar. Faca backup.',
      storage.persisted,
    ]);
    rows.push([
      'Espaco usado',
      `${fmtNumber(storage.usageMb, 1)} MB${storage.quotaMb ? ` de ${fmtNumber(storage.quotaMb, 0)} MB` : ''}`,
      true,
    ]);

    const voices = describeVoices(await loadVoices());
    rows.push([
      'Vozes em portugues',
      voices.length ? voices.map((v) => v.name).slice(0, 3).join(', ') : 'nenhuma — o botão de ouvir não vai funcionar',
      voices.length > 0,
    ]);

    for (const [label, value, ok] of rows) {
      list.appendChild(h('dt', { text: label }));
      list.appendChild(h('dd', { class: ok ? '' : 'warn-text', text: value }));
    }

    if (!storage.persisted) {
      const btn = h('button', { class: 'btn small', text: 'Pedir armazenamento persistente' });
      btn.addEventListener('click', async () => {
        const ok = await requestPersistence();
        btn.textContent = ok ? 'Concedido ✓' : 'Negado pelo navegador';
      });
      el.appendChild(btn);
    }
  })();

  return el;
}

// ---------------------------------------------------------------- manutencao

function dangerCard(ctx: AppContext): HTMLElement {
  const prune = h('button', { class: 'btn wide', text: 'Apagar gravações antigas agora' });
  prune.addEventListener('click', async () => {
    const r = await runRetention();
    ctx.toast(`Removidos ${r.removed} audios antigos e ${r.orphans} arquivos orfaos.`, 'ok');
  });

  const wipe = h('button', { class: 'btn danger wide', text: 'Apagar tudo' });
  wipe.addEventListener('click', async () => {
    if (!confirm('Apagar TUDO: histórico, progresso e gravações? Não dá para desfazer.')) return;
    if (!confirm('Ultima confirmacao: exportou um backup antes?')) return;
    await wipeEverything();
    await ctx.reload();
    ctx.toast('Tudo apagado.', 'ok');
    ctx.go('home');
  });

  return card('Limpeza', prune, wipe);
}

registerScreen('settings', renderSettings);
