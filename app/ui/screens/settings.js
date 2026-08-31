/**
 * Ajustes: preferencias, diagnostico de ambiente e backup.
 *
 * O bloco de backup fica no topo, e nao no rodape, porque e a unica defesa real
 * contra o unico modo de falha grave do ADR-003 (despejo de dados pelo Safari).
 */
import { h, fmtNumber } from "../dom.js";
import { registerScreen } from "../app.js";
import { daysSinceBackup, exportBackup, importBackup, runRetention, saveSettings, wipeEverything, } from "../../data/store.js";
import { requestPersistence, storageStatus } from "../../data/audioStore.js";
import { micSupport } from "../../audio/capture.js";
import { describeVoices, loadVoices } from "../../audio/speech.js";
import { todayKey } from "../../data/model.js";
function card(title, ...children) {
    return h('section', { class: 'card' }, h('h2', { text: title }), ...children);
}
export function renderSettings(ctx) {
    const root = h('div', { class: 'screen settings' });
    root.appendChild(h('header', { class: 'app-header' }, h('h1', { text: 'Ajustes' })));
    root.appendChild(backupCard(ctx));
    root.appendChild(preferencesCard(ctx));
    root.appendChild(diagnosticsCard());
    root.appendChild(dangerCard(ctx));
    root.appendChild(h('p', { class: 'disclaimer' }, 'Oratorius v0.1 · app pessoal, roda inteiramente no aparelho. ', 'Nenhum audio sai do dispositivo. Nao e dispositivo medico.'));
    return root;
}
// ---------------------------------------------------------------- backup
function backupCard(ctx) {
    const status = h('p', { class: 'muted small', text: 'verificando…' });
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
            ctx.toast('Backup gerado. Salve no app Arquivos ou no iCloud Drive.', 'ok');
        }
        catch (err) {
            ctx.toast(`Falha ao exportar: ${err.message}`, 'error');
        }
    });
    const fileInput = h('input', { type: 'file', class: 'hidden-input' });
    fileInput.accept = 'application/json,.json';
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file)
            return;
        if (!confirm('Importar SUBSTITUI todo o historico atual pelo do arquivo. Isto nao pode ser desfeito. Continuar?')) {
            fileInput.value = '';
            return;
        }
        try {
            const parsed = JSON.parse(await file.text());
            const result = await importBackup(parsed);
            await ctx.reload();
            ctx.toast(`Importado: ${result.attempts} gravacoes, ${result.sessions} sessoes.`, 'ok');
        }
        catch (err) {
            ctx.toast(`Falha ao importar: ${err.message}`, 'error');
        }
        finally {
            fileInput.value = '';
        }
    });
    const importBtn = h('button', { class: 'btn wide', text: 'Restaurar de um backup' });
    importBtn.addEventListener('click', () => fileInput.click());
    const el = card('Backup', h('p', { class: 'muted small' }, 'O arquivo tem so as medidas e o progresso — poucos KB. As gravacoes de audio nao vao junto ', '(seriam centenas de MB) e por isso nunca sao pre-requisito de nenhum numero do historico.'), status, exportBtn, importBtn, fileInput);
    void (async () => {
        const days = await daysSinceBackup();
        status.textContent = days === null
            ? 'Nenhum backup feito ainda.'
            : days === 0 ? 'Backup feito hoje.' : `Ultimo backup ha ${days} dia(s).`;
        status.className = days === null || days >= 7 ? 'muted small warn-text' : 'muted small';
    })();
    return el;
}
// ---------------------------------------------------------------- preferencias
function preferencesCard(ctx) {
    const s = ctx.state.settings;
    // --- alvo do R em coda ---
    const codaOptions = [
        { value: 'fricativa', label: 'Aspirado / gutural', example: '"porta" como na maior parte do Brasil' },
        { value: 'tepe', label: 'Tepe (toque)', example: '"porta" com r batido, comum no Sul e em SP capital' },
        { value: 'retroflexo', label: 'Retroflexo (caipira)', example: '"porta" com r do interior paulista' },
    ];
    const codaGroup = h('div', { class: 'options' });
    for (const opt of codaOptions) {
        const btn = h('button', {
            class: `option${s.codaRhoticTarget === opt.value ? ' selected' : ''}`,
        }, h('strong', { text: opt.label }), h('span', { class: 'muted small', text: opt.example }));
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
            await saveSettings({ strictness: i });
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
    return card('Preferencias', h('div', { class: 'field' }, h('label', { text: 'Som do R no fim da silaba' }), h('p', { class: 'muted small' }, 'Nao existe um som "certo" unico aqui: varia por regiao. Escolha o seu — o app nao vai ', 'tratar o seu sotaque como erro.'), codaGroup), h('div', { class: 'field' }, h('label', { text: 'Rigor da avaliacao' }), h('p', { class: 'muted small', text: 'Muda a fronteira entre "ok" e "atencao", nao os numeros medidos.' }), strictGroup), h('div', { class: 'field row' }, h('label', { text: 'Meta diaria' }), goalLabel), goal, h('div', { class: 'field row' }, h('label', { text: 'Guardar audio por' }), keepLabel), keep, h('p', { class: 'muted small', text: 'Gravacoes fixadas (★) nunca sao apagadas.' }), h('div', { class: 'field row' }, h('div', {}, h('label', { text: 'Modo maos-livres' }), h('p', { class: 'muted small', text: 'Avanca sozinho apos o feedback — para treinar em pe, sem tocar na tela.' })), hands));
}
// ---------------------------------------------------------------- diagnostico
function diagnosticsCard() {
    const list = h('dl', { class: 'diag' });
    const el = card('Diagnostico', list, h('p', { class: 'muted small', text: 'Confira isto na primeira vez que abrir no iPhone.' }));
    void (async () => {
        const rows = [];
        const mic = micSupport();
        rows.push(['Microfone', mic.ok ? 'disponivel' : (mic.reason ?? 'indisponivel'), mic.ok]);
        rows.push([
            'Contexto seguro',
            window.isSecureContext ? 'sim (HTTPS)' : 'NAO — o microfone nao vai funcionar',
            window.isSecureContext,
        ]);
        rows.push([
            'Instalado na tela de inicio',
            window.matchMedia('(display-mode: standalone)').matches ? 'sim' : 'nao (rodando no navegador)',
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
            voices.length ? voices.map((v) => v.name).slice(0, 3).join(', ') : 'nenhuma — "ouvir modelo" nao vai funcionar',
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
function dangerCard(ctx) {
    const prune = h('button', { class: 'btn wide', text: 'Limpar audio antigo agora' });
    prune.addEventListener('click', async () => {
        const r = await runRetention();
        ctx.toast(`Removidos ${r.removed} audios antigos e ${r.orphans} arquivos orfaos.`, 'ok');
    });
    const wipe = h('button', { class: 'btn danger wide', text: 'Apagar tudo' });
    wipe.addEventListener('click', async () => {
        if (!confirm('Apagar TODO o historico, progresso e gravacoes? Isto nao pode ser desfeito.'))
            return;
        if (!confirm('Ultima confirmacao: exportou um backup antes?'))
            return;
        await wipeEverything();
        await ctx.reload();
        ctx.toast('Tudo apagado.', 'ok');
        ctx.go('home');
    });
    return card('Manutencao', prune, wipe);
}
registerScreen('settings', renderSettings);
//# sourceMappingURL=settings.js.map