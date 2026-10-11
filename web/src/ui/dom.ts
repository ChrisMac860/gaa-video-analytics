/** Tiny DOM helpers. All text goes in as text nodes / textContent, never as HTML. */

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'open', 'indeterminate']);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) {
        if (PROP_KEYS.has(k) && v === false) (el as unknown as Record<string, unknown>)[k] = false;
        continue;
      }
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'for') (el as HTMLLabelElement).htmlFor = String(v);
      else if (PROP_KEYS.has(k)) (el as unknown as Record<string, unknown>)[k] = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replace(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, children);
}

let uid = 0;
export function nextId(prefix = 'f'): string {
  return `${prefix}${++uid}`;
}

/** Label + control pair with matching id. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || nextId('c');
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}

export function select(options: Array<[string, string]>, value: string, onChange: (v: string) => void): HTMLSelectElement {
  const s = h('select', { onChange: () => onChange(s.value) },
    ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  s.value = value;
  return s;
}

export function toast(message: string, opts: { action?: { label: string; run: () => void }; kind?: 'error' | 'ok' } = {}): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: `toast ${opts.kind ?? ''}` }, h('span', null, message));
  if (opts.action) {
    const a = opts.action;
    el.append(h('button', { type: 'button', class: 'link', onClick: () => { a.run(); el.remove(); } }, a.label));
  }
  host.append(el);
  setTimeout(() => el.remove(), opts.action ? 9000 : 4500);
}

export function download(name: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
