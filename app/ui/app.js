/** Estado e roteamento do app. Cinco telas, uma acao primaria por tela. */
import { MicRecorder } from "../audio/capture.js";
import { initialProgress } from "../engine/progression.js";
import { getProgress, getReviews, getSettings, saveProgress, } from "../data/store.js";
import { clear } from "./dom.js";
const screens = new Map();
export function registerScreen(name, renderer) {
    screens.set(name, renderer);
}
let toastTimer = null;
export async function createApp(root) {
    const settings = await getSettings();
    let progress = await getProgress();
    if (progress.length === 0) {
        progress = initialProgress();
        await saveProgress(progress);
    }
    const state = {
        screen: 'home',
        settings,
        progress,
        reviews: await getReviews(),
        practice: null,
        toast: null,
    };
    const ctx = {
        state,
        recorder: new MicRecorder(),
        root,
        go(screen) {
            state.screen = screen;
            ctx.render();
            window.scrollTo({ top: 0, behavior: 'instant' });
        },
        render() {
            const renderer = screens.get(state.screen);
            clear(root);
            if (!renderer) {
                root.textContent = `Tela nao registrada: ${state.screen}`;
                return;
            }
            root.appendChild(renderer(ctx));
            renderToast(state);
            renderNav(ctx);
        },
        toast(text, kind = 'info') {
            state.toast = { text, kind };
            renderToast(state);
            if (toastTimer)
                clearTimeout(toastTimer);
            toastTimer = setTimeout(() => {
                state.toast = null;
                renderToast(state);
            }, kind === 'error' ? 6000 : 3000);
        },
        async reload() {
            state.settings = await getSettings();
            state.progress = await getProgress();
            state.reviews = await getReviews();
            ctx.render();
        },
    };
    return ctx;
}
function renderToast(state) {
    const host = document.getElementById('toast');
    if (!host)
        return;
    if (!state.toast) {
        host.hidden = true;
        host.textContent = '';
        return;
    }
    host.hidden = false;
    host.className = `toast ${state.toast.kind}`;
    host.textContent = state.toast.text;
}
const NAV = [
    { screen: 'home', label: 'Inicio', icon: '◉' },
    { screen: 'library', label: 'Exercicios', icon: '☰' },
    { screen: 'progress', label: 'Progresso', icon: '◺' },
    { screen: 'settings', label: 'Ajustes', icon: '⚙' },
];
function renderNav(ctx) {
    const nav = document.getElementById('nav');
    if (!nav)
        return;
    // A barra some durante a pratica: uma acao primaria por tela, sem escape acidental.
    const hidden = ctx.state.screen === 'practice';
    nav.hidden = hidden;
    document.body.classList.toggle('no-nav', hidden);
    if (hidden)
        return;
    clear(nav);
    for (const item of NAV) {
        const active = ctx.state.screen === item.screen
            || (item.screen === 'home' && ctx.state.screen === 'feedback');
        const btn = document.createElement('button');
        btn.className = `nav-item${active ? ' active' : ''}`;
        btn.innerHTML = `<span class="nav-icon">${item.icon}</span><span>${item.label}</span>`;
        btn.addEventListener('click', () => ctx.go(item.screen));
        nav.appendChild(btn);
    }
}
//# sourceMappingURL=app.js.map