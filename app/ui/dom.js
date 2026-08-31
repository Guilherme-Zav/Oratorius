/** Helpers minimos de DOM. Substituem o framework de UI, que aqui nao se paga. */
export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    if (props.class)
        el.className = props.class;
    if (props.id)
        el.id = props.id;
    if (props.text !== undefined)
        el.textContent = props.text;
    if (props.html !== undefined)
        el.innerHTML = props.html;
    if (props.style)
        el.setAttribute('style', props.style);
    if (props.hidden)
        el.hidden = true;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        if (props.type && el instanceof HTMLInputElement)
            el.type = props.type;
        if (props.value !== undefined)
            el.value = props.value;
        if (props.min && el instanceof HTMLInputElement)
            el.min = props.min;
        if (props.max && el instanceof HTMLInputElement)
            el.max = props.max;
        if (props.step && el instanceof HTMLInputElement)
            el.step = props.step;
        if (props.checked && el instanceof HTMLInputElement)
            el.checked = true;
    }
    if (el instanceof HTMLButtonElement && props.disabled)
        el.disabled = true;
    if (el instanceof HTMLAnchorElement && props.href)
        el.href = props.href;
    for (const [k, v] of Object.entries(props.aria ?? {}))
        el.setAttribute(`aria-${k}`, v);
    for (const [k, v] of Object.entries(props.data ?? {}))
        el.dataset[k] = v;
    for (const [event, handler] of Object.entries(props.on ?? {})) {
        if (handler)
            el.addEventListener(event, handler);
    }
    append(el, children);
    return el;
}
export function append(parent, children) {
    for (const c of children) {
        if (c === null || c === undefined || c === false)
            continue;
        parent.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
}
export function svg(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs))
        el.setAttribute(k, String(v));
    return el;
}
export function clear(node) {
    while (node.firstChild)
        node.removeChild(node.firstChild);
}
export function mount(container, ...children) {
    clear(container);
    append(container, children);
}
/** Formata segundos como 1:05 ou 12s. */
export function fmtDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0)
        return '0s';
    if (sec < 60)
        return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtNumber(v, digits = 1) {
    if (!Number.isFinite(v))
        return '—';
    return v.toFixed(digits).replace('.', ',');
}
//# sourceMappingURL=dom.js.map