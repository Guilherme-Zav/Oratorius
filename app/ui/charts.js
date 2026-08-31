/**
 * Graficos em SVG, escritos a mao.
 *
 * Um grafico por metrica, sem dashboard denso: a pergunta que a tela de progresso
 * responde e "isto esta melhorando?", e para isso uma linha por vez e melhor que
 * seis sobrepostas.
 */
import { svg } from "./dom.js";
const W = 320;
export function lineChart(points, options = {}) {
    const height = options.height ?? 120;
    const padTop = 8;
    const padBottom = 18;
    const padLeft = 30;
    const padRight = 6;
    const plotW = W - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const root = svg('svg', {
        viewBox: `0 0 ${W} ${height}`,
        class: 'chart',
        preserveAspectRatio: 'none',
        role: 'img',
    });
    const values = points.map((p) => p.value).filter((v) => v !== null);
    if (values.length === 0) {
        const t = svg('text', {
            x: W / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty',
        });
        t.textContent = 'sem dados ainda';
        root.appendChild(t);
        return root;
    }
    let min = options.yMin ?? Math.min(...values);
    let max = options.yMax ?? Math.max(...values);
    if (options.band) {
        min = Math.min(min, options.band.from);
        max = Math.max(max, options.band.to);
    }
    // Respiro de 10% para a linha nunca encostar na borda.
    const span = max - min || 1;
    min -= span * 0.1;
    max += span * 0.1;
    const x = (i) => padLeft + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const y = (v) => padTop + plotH - ((v - min) / (max - min)) * plotH;
    // Faixa alvo.
    if (options.band) {
        const y1 = y(options.band.to);
        const y2 = y(options.band.from);
        root.appendChild(svg('rect', {
            x: padLeft, y: Math.min(y1, y2), width: plotW, height: Math.abs(y2 - y1),
            class: 'chart-band',
        }));
    }
    // Eixo Y: so dois rotulos, minimo e maximo.
    for (const v of [min + span * 0.1, max - span * 0.1]) {
        const ty = y(v);
        root.appendChild(svg('line', {
            x1: padLeft, x2: W - padRight, y1: ty, y2: ty, class: 'chart-grid',
        }));
        const label = svg('text', { x: padLeft - 4, y: ty + 3, 'text-anchor': 'end', class: 'chart-tick' });
        label.textContent = formatTick(v);
        root.appendChild(label);
    }
    // Linha (quebrada nos buracos: dia sem treino nao e valor zero).
    let path = '';
    let pen = false;
    points.forEach((p, i) => {
        if (p.value === null) {
            pen = false;
            return;
        }
        path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)} `;
        pen = true;
    });
    root.appendChild(svg('path', {
        d: path.trim(), class: options.lowerIsBetter ? 'chart-line inverted' : 'chart-line',
    }));
    // Pontos.
    points.forEach((p, i) => {
        if (p.value === null)
            return;
        root.appendChild(svg('circle', { cx: x(i), cy: y(p.value), r: 2.5, class: 'chart-dot' }));
    });
    // Ultimo valor em destaque.
    const lastIdx = points.map((p) => p.value).lastIndexOf(values[values.length - 1]);
    if (lastIdx >= 0) {
        const t = svg('text', {
            x: Math.min(W - padRight, x(lastIdx) + 6), y: y(values[values.length - 1]) - 6,
            'text-anchor': 'end', class: 'chart-last',
        });
        t.textContent = formatTick(values[values.length - 1]) + (options.unit ?? '');
        root.appendChild(t);
    }
    return root;
}
function formatTick(v) {
    if (Math.abs(v) >= 100)
        return v.toFixed(0);
    if (Math.abs(v) >= 10)
        return v.toFixed(0);
    return v.toFixed(1).replace('.', ',');
}
/** Barras de sequencia diaria. Cinza = dia sem treino. */
export function streakBars(days) {
    const height = 46;
    const root = svg('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart streak', preserveAspectRatio: 'none' });
    const max = Math.max(1, ...days.map((d) => d.value));
    const gap = 2;
    const barW = Math.max(1, (W - gap * (days.length - 1)) / days.length);
    days.forEach((d, i) => {
        const hh = d.value > 0 ? Math.max(3, (d.value / max) * (height - 6)) : 3;
        root.appendChild(svg('rect', {
            x: i * (barW + gap), y: height - hh, width: barW, height: hh, rx: 1.5,
            class: d.value > 0 ? 'streak-bar on' : 'streak-bar off',
        }));
    });
    return root;
}
export function waveformChart(opts) {
    const height = 132;
    const mid = height / 2;
    const root = svg('svg', {
        viewBox: `0 0 ${W} ${height}`, class: 'chart waveform', preserveAspectRatio: 'none',
    });
    const dur = Math.max(0.001, opts.durationSec);
    const tx = (t) => (t / dur) * W;
    for (const p of opts.pauses ?? []) {
        root.appendChild(svg('rect', {
            x: tx(p.startSec), y: 0, width: Math.max(1, tx(p.endSec) - tx(p.startSec)),
            height, class: 'wave-pause',
        }));
    }
    for (const p of opts.filledPauses ?? []) {
        root.appendChild(svg('rect', {
            x: tx(p.startSec), y: 0, width: Math.max(1, tx(p.endSec) - tx(p.startSec)),
            height, class: 'wave-filled',
        }));
    }
    // Envelope.
    const bins = opts.waveform.length / 2;
    let peak = 0.01;
    for (let i = 0; i < opts.waveform.length; i++) {
        peak = Math.max(peak, Math.abs(opts.waveform[i]));
    }
    const scale = (mid - 6) / peak;
    let d = '';
    for (let b = 0; b < bins; b++) {
        const x = (b / bins) * W;
        const lo = opts.waveform[b * 2] * scale;
        const hi = opts.waveform[b * 2 + 1] * scale;
        d += `M${x.toFixed(1)} ${(mid - hi).toFixed(1)}L${x.toFixed(1)} ${(mid - lo).toFixed(1)} `;
    }
    root.appendChild(svg('path', { d: d.trim(), class: 'wave-body' }));
    // Contorno de f0, normalizado na faixa util da propria gravacao.
    const voiced = [];
    for (let i = 0; i < opts.f0.length; i++)
        if (opts.f0[i] > 0)
            voiced.push(opts.f0[i]);
    if (voiced.length > 3) {
        const sorted = [...voiced].sort((a, b) => a - b);
        const lo = sorted[Math.floor(sorted.length * 0.05)];
        const hi = sorted[Math.floor(sorted.length * 0.95)];
        const range = Math.max(10, hi - lo);
        let pitchPath = '';
        let pen = false;
        for (let i = 0; i < opts.f0.length; i++) {
            if (opts.f0[i] <= 0) {
                pen = false;
                continue;
            }
            const x = tx(opts.f0Times[i]);
            const norm = (opts.f0[i] - lo) / range;
            const y = height - 10 - Math.max(0, Math.min(1, norm)) * (height - 24);
            pitchPath += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
            pen = true;
        }
        root.appendChild(svg('path', { d: pitchPath.trim(), class: 'wave-pitch' }));
    }
    for (const t of opts.nuclei ?? []) {
        root.appendChild(svg('circle', { cx: tx(t), cy: height - 4, r: 1.5, class: 'wave-nucleus' }));
    }
    return root;
}
//# sourceMappingURL=charts.js.map