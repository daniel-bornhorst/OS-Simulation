export type Child = Node | string | number | null | undefined | false;

type Props = {
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  [key: string]: unknown;
};

/**
 * Tiny element factory: `h('button', { class: 'btn', onclick: fn }, 'Save')`.
 * `on*` props become event listeners; other props are set as properties when the
 * element has one, otherwise as attributes.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value as string;
    else if (key === 'style') {
      if (typeof value === 'string') el.style.cssText = value;
      else Object.assign(el.style, value);
    } else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (key in el) (el as any)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: (Child | Child[])[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

/** Parse a trusted SVG/HTML string into a single element. */
export function fromHTML(html: string): Element {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild!;
}
