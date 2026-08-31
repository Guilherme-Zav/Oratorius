/**
 * Tela de progresso.
 *
 * Uma metrica por grafico, sem dashboard denso. A pergunta que esta tela responde
 * e "isto esta melhorando?" — e para isso uma linha por vez le melhor do que seis
 * sobrepostas.
 *
 * As series vem dos exercicios de linha de base (sempre os mesmos, sem adaptacao),
 * que e o que torna a comparacao entre dias legitima.
 */

import { h, fmtDuration, fmtNumber } from '../dom.ts';
import { lineChart, type SeriesPoint } from '../charts.ts';
import { registerScreen, type AppContext } from '../app.ts';
import { allAttempts, dailyStats } from '../../data/store.ts';
import type { Attempt } from '../../data/model.ts';
import { getExercise } from '../../content/exercises.ts';
import { todayKey } from '../../data/model.ts';

interface MetricSpec {
  id: string;
  title: string;
  explanation: string;
  unit: string;
  lowerIsBetter?: boolean;
  band?: { from: number; to: number };
  /** Exercicios que alimentam a serie. Vazio = todos. */
  exerciseIds?: string[];
  value: (a: Attempt) => number | null;
  format: (v: number) => string;
}

const METRICS: MetricSpec[] = [
  {
    id: 'tmf',
    title: 'Tempo de fonacao (TMF)',
    explanation: 'Quantos segundos voce sustenta um /a/ numa expiracao. Mede apoio respiratorio.',
    unit: ' s',
    exerciseIds: ['resp-tmf-a'],
    value: (a) => a.metrics.mpt?.seconds ?? null,
    format: (v) => `${fmtNumber(v)} s`,
  },
  {
    id: 'ddk-rate',
    title: 'Velocidade do DDK',
    explanation: 'Silabas por segundo em pa-ta-ka. Sobe com a automatizacao do movimento.',
    unit: '',
    exerciseIds: ['ddk-pataka'],
    value: (a) => (a.metrics.ddk?.count ?? 0) >= 6 ? a.metrics.ddk!.syllPerSec : null,
    format: (v) => `${fmtNumber(v)} sil/s`,
  },
  {
    id: 'ddk-cv',
    title: 'Irregularidade do DDK',
    explanation:
      'Variacao dos intervalos entre silabas. E a metrica mais sensivel a travamento — e a unica em que MENOR e melhor.',
    unit: '%',
    lowerIsBetter: true,
    exerciseIds: ['ddk-pataka'],
    value: (a) => (a.metrics.ddk?.count ?? 0) >= 6 ? a.metrics.ddk!.cvPercent : null,
    format: (v) => `${fmtNumber(v, 0)}%`,
  },
  {
    id: 'pitch-range',
    title: 'Variacao de tom',
    explanation:
      'Desvio do contorno de f0 em semitons na leitura expressiva. Abaixo de ~1,5 a fala soa monotona.',
    unit: ' st',
    band: { from: 2, to: 6 },
    exerciseIds: ['ora-leitura-expressiva'],
    value: (a) => (a.metrics.f0.voicedRatio > 0.25 ? a.metrics.f0.sdSemitones : null),
    format: (v) => `${fmtNumber(v)} st`,
  },
  {
    id: 'rate',
    title: 'Ritmo de fala',
    explanation: 'Silabas por segundo excluindo pausas. Faixa confortavel de escuta: 3,8 a 6,0.',
    unit: '',
    band: { from: 3.8, to: 6.0 },
    value: (a) => (a.metrics.timing.syllableCount >= 6 ? a.metrics.timing.articulationRate : null),
    format: (v) => `${fmtNumber(v)} sil/s`,
  },
  {
    id: 'filled',
    title: 'Alongamentos por minuto',
    explanation:
      'Quantos "eeee" e "hmmm" por minuto de fala. Detectado pelo som, sem transcricao — nao pega "tipo" nem "ne".',
    unit: '/min',
    lowerIsBetter: true,
    value: (a) => (a.metrics.timing.speechSec > 20 ? a.metrics.timing.filledPausePerMin : null),
    format: (v) => `${fmtNumber(v)}/min`,
  },
  {
    id: 'artic-score',
    title: 'Nota nos pares minimos',
    explanation:
      'Desempenho em prato/pato, trem/tem e afins — onde a omissao do R aparece com clareza.',
    unit: '',
    band: { from: 85, to: 100 },
    exerciseIds: ['art-l6-pares-p'],
    value: (a) => (a.score >= 0 ? a.score : null),
    format: (v) => String(Math.round(v)),
  },
];

export function renderProgress(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'screen progress' });
  root.appendChild(h('header', { class: 'app-header' }, h('h1', { text: 'Progresso' })));
  root.appendChild(h('p', { class: 'muted', text: 'carregando historico…' }));
  void hydrate(ctx, root);
  return root;
}

async function hydrate(ctx: AppContext, root: HTMLElement): Promise<void> {
  const [attempts, stats] = await Promise.all([allAttempts(), dailyStats(30)]);

  root.replaceChildren(h('header', { class: 'app-header' }, h('h1', { text: 'Progresso' })));

  if (attempts.length === 0) {
    root.appendChild(h('div', { class: 'notice info' },
      h('strong', { text: 'Ainda sem dados' }),
      h('p', {
        text: 'Faca alguns treinos. Os graficos aparecem assim que houver ao menos duas medicoes da mesma coisa.',
      }),
    ));
    return;
  }

  // ------------------------------------------------ resumo
  const totalSec = attempts.reduce((s, a) => s + a.durationSec, 0);
  const scored = attempts.filter((a) => a.score >= 0);
  const meanScore = scored.length
    ? scored.reduce((s, a) => s + a.score, 0) / scored.length
    : 0;

  root.appendChild(h('section', { class: 'card' },
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' },
        h('span', { class: 'stat-value', text: String(attempts.length) }),
        h('span', { class: 'stat-label', text: 'gravacoes' }),
      ),
      h('div', { class: 'stat' },
        h('span', { class: 'stat-value', text: fmtDuration(totalSec) }),
        h('span', { class: 'stat-label', text: 'de treino' }),
      ),
      h('div', { class: 'stat' },
        h('span', { class: 'stat-value', text: String(Math.round(meanScore)) }),
        h('span', { class: 'stat-label', text: 'nota media' }),
      ),
    ),
    lineChart(
      stats.map((s) => ({ label: s.day, value: s.practiceSec > 0 ? s.practiceSec / 60 : null })),
      { height: 90, unit: ' min', yMin: 0 },
    ),
    h('p', { class: 'muted small', text: 'minutos por dia, ultimos 30 dias' }),
  ));

  // ------------------------------------------------ uma serie por metrica
  for (const spec of METRICS) {
    const series = buildSeries(attempts, spec);
    const withData = series.filter((p) => p.value !== null);
    if (withData.length < 2) continue;   // uma medicao nao e tendencia

    const first = withData[0].value!;
    const last = withData[withData.length - 1].value!;
    const delta = last - first;
    const improving = spec.lowerIsBetter ? delta < 0 : delta > 0;
    const meaningful = Math.abs(delta) > Math.abs(first) * 0.05;

    root.appendChild(h('section', { class: 'card metric-card' },
      h('div', { class: 'metric-head' },
        h('h2', { text: spec.title }),
        h('span', {
          class: `trend ${meaningful ? (improving ? 'up' : 'down') : 'flat'}`,
          text: meaningful
            ? `${improving ? '↑' : '↓'} ${spec.format(Math.abs(delta))}`
            : 'estavel',
        }),
      ),
      lineChart(series, {
        unit: spec.unit,
        band: spec.band,
        lowerIsBetter: spec.lowerIsBetter,
        yMin: spec.lowerIsBetter ? 0 : undefined,
      }),
      h('p', { class: 'muted small', text: spec.explanation }),
      h('p', { class: 'muted small', text: `${withData.length} medicoes · atual: ${spec.format(last)}` }),
    ));
  }

  // ------------------------------------------------ exportar relatorio
  const exportBtn = h('button', { class: 'btn wide', text: 'Exportar relatorio (texto)' });
  exportBtn.addEventListener('click', () => downloadReport(ctx, attempts));
  root.appendChild(h('section', { class: 'card' },
    h('h2', { text: 'Levar a um profissional' }),
    h('p', { class: 'muted small' },
      'Um fonoaudiologo reconhece TMF, DDK e taxa de acerto por contexto. ',
      'Este relatorio junta essas medidas em texto simples.',
    ),
    exportBtn,
  ));

  root.appendChild(h('p', { class: 'disclaimer' },
    'O Oratorius nao e dispositivo medico e nao diagnostica lingua presa (anquiloglossia). ',
    'Se houver causa anatomica, exercicio nenhum resolve — a avaliacao e clinica.',
  ));
}

/**
 * Uma medicao por dia: a melhor do dia. Usar a media diluiria o progresso com as
 * tentativas de aquecimento, e usar a ultima seria refem do cansaco do fim da sessao.
 */
function buildSeries(attempts: Attempt[], spec: MetricSpec): SeriesPoint[] {
  const relevant = attempts.filter((a) => {
    if (spec.exerciseIds && !spec.exerciseIds.includes(a.exerciseId)) return false;
    return spec.value(a) !== null;
  });

  const byDay = new Map<string, number>();
  for (const a of relevant) {
    const v = spec.value(a);
    if (v === null) continue;
    const day = todayKey(new Date(a.at));
    const cur = byDay.get(day);
    if (cur === undefined) byDay.set(day, v);
    else byDay.set(day, spec.lowerIsBetter ? Math.min(cur, v) : Math.max(cur, v));
  }

  const days = [...byDay.keys()].sort();
  if (days.length === 0) return [];

  // Eixo continuo do primeiro ao ultimo dia com dado: buracos viram quebras na
  // linha, e nao um zero enganoso.
  const out: SeriesPoint[] = [];
  const cursor = new Date(days[0] + 'T12:00:00');
  const end = new Date(days[days.length - 1] + 'T12:00:00');
  while (cursor <= end) {
    const key = todayKey(cursor);
    out.push({ label: key, value: byDay.get(key) ?? null });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function downloadReport(ctx: AppContext, attempts: Attempt[]): void {
  const lines: string[] = [];
  lines.push('RELATORIO DE TREINO DE FALA — Oratorius');
  lines.push(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
  lines.push(`Periodo: ${attempts.length} gravacoes`);
  lines.push('');
  lines.push('AVISO: dados gerados por um app de treino pessoal, sem calibracao clinica.');
  lines.push('Servem como acompanhamento de tendencia, nao como medida diagnostica.');
  lines.push('');

  for (const spec of METRICS) {
    const series = buildSeries(attempts, spec).filter((p) => p.value !== null);
    if (series.length === 0) continue;
    lines.push(`## ${spec.title}`);
    lines.push(spec.explanation);
    for (const p of series) lines.push(`  ${p.label}  ${spec.format(p.value!)}`);
    lines.push('');
  }

  const exerciseCount = new Map<string, number>();
  for (const a of attempts) {
    exerciseCount.set(a.exerciseId, (exerciseCount.get(a.exerciseId) ?? 0) + 1);
  }
  lines.push('## Exercicios praticados');
  for (const [id, n] of [...exerciseCount].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${n.toString().padStart(3)}x  ${getExercise(id)?.title ?? id}`);
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oratorius-relatorio-${todayKey()}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  ctx.toast('Relatorio gerado. Salve no app Arquivos.', 'ok');
}

registerScreen('progress', renderProgress);
