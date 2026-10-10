import { h } from './dom';
import { glyph } from './icons';
import { overlayRoot } from './overlay';

export type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      glyph?: string;
      shortcut?: string;
      disabled?: boolean;
      checked?: boolean;
      action?: () => void;
    };

let closeCurrent: (() => void) | null = null;

export function closeMenu(): void {
  closeCurrent?.();
}

/** Show a menu at viewport coordinates. Returns a function that closes it. */
export function showMenu(
  x: number,
  y: number,
  items: MenuItem[],
  opts: { className?: string; onClose?: () => void } = {},
): () => void {
  closeMenu();

  const menu = h(
    'div',
    { class: `menu ${opts.className ?? ''}`, role: 'menu' },
    items.map((item) => {
      if (item.separator) return h('div', { class: 'menu-separator', role: 'separator' });
      return h(
        'button',
        {
          class: `menu-item${item.checked ? ' is-checked' : ''}`,
          role: 'menuitem',
          disabled: item.disabled,
          onclick: () => {
            close();
            item.action?.();
          },
        },
        h('span', { class: 'menu-glyph' }, item.glyph ? glyph(item.glyph, 14) : item.checked ? '✓' : null),
        h('span', { class: 'menu-label' }, item.label),
        item.shortcut ? h('span', { class: 'menu-shortcut' }, item.shortcut) : null,
      );
    }),
  );

  overlayRoot().append(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
  menu.style.top = `${Math.max(4, y + rect.height > window.innerHeight ? y - rect.height : y)}px`;

  const onPointerDown = (e: PointerEvent) => {
    if (!menu.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  function close() {
    menu.remove();
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', close);
    if (closeCurrent === close) closeCurrent = null;
    opts.onClose?.();
  }
  // Defer so the event that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
  });
  closeCurrent = close;
  return close;
}

/** Wire an element so right-clicking it shows the menu built by `items`. */
export function onContextMenu(el: HTMLElement, items: (e: MouseEvent) => MenuItem[] | null): void {
  el.addEventListener('contextmenu', (e) => {
    const list = items(e);
    if (!list) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY, list);
  });
}
