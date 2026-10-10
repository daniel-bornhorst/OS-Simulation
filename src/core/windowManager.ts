import { h } from '../ui/dom';
import type { EventBus } from './eventBus';
import type { OSEvents } from './events';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  z: number;
}

export interface WindowOptions {
  appId: string;
  title: string;
  icon: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
}

/**
 * Builds a window's title bar. Shells provide their own so the same window can
 * look like Windows, Win95 or macOS. The returned element must have the class
 * `window-titlebar`, contain a `.window-title` element, and use
 * `data-action="minimize|maximize|close"` on its buttons.
 */
export type WindowChrome = (win: WindowHandle) => HTMLElement;

type CloseGuard = () => boolean | Promise<boolean>;

export class WindowHandle {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  /** @internal */ closeGuards: CloseGuard[] = [];
  /** @internal */ closeHandlers: (() => void)[] = [];

  constructor(
    private wm: WindowManager,
    readonly state: WindowState,
  ) {
    this.body = h('div', { class: 'window-body' });
    this.el = h('div', { class: 'window', dataset: { id: state.id, app: state.appId } }, this.body);
  }

  get id(): string {
    return this.state.id;
  }

  setTitle(title: string): void {
    this.state.title = title;
    const titleEl = this.el.querySelector('.window-title');
    if (titleEl) titleEl.textContent = title;
    this.wm.notify();
  }

  focus(): void {
    this.wm.focus(this.id);
  }

  close(): Promise<boolean> {
    return this.wm.close(this.id);
  }

  /** Close the window without running close guards. */
  forceClose(): void {
    this.wm.close(this.id, true);
  }

  /** Return false (or resolve to false) to keep the window open, e.g. on unsaved changes. */
  onBeforeClose(guard: CloseGuard): void {
    this.closeGuards.push(guard);
  }

  /** Cleanup hook, e.g. to unsubscribe from events. */
  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }
}

const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export class WindowManager {
  private windows = new Map<string, WindowHandle>();
  private nextId = 1;
  private zTop = 1;
  private cascade = 0;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private chrome: WindowChrome = () => h('div', { class: 'window-titlebar' }, h('span', { class: 'window-title' }));

  constructor(
    private layer: HTMLElement,
    private bus: EventBus<OSEvents>,
  ) {
    window.addEventListener('resize', () => this.windows.forEach((w) => this.apply(w)));
  }

  /** @internal */
  notify(): void {
    this.bus.emit('windows:changed', undefined);
  }

  list(): WindowHandle[] {
    return [...this.windows.values()];
  }

  get(id: string): WindowHandle | undefined {
    return this.windows.get(id);
  }

  focused(): WindowHandle | undefined {
    return this.list().find((w) => w.state.focused);
  }

  setChrome(chrome: WindowChrome): void {
    this.chrome = chrome;
    for (const win of this.windows.values()) this.renderChrome(win);
  }

  setInsets(insets: Insets): void {
    this.insets = insets;
    for (const win of this.windows.values()) {
      win.state.y = Math.max(win.state.y, insets.top);
      this.apply(win);
    }
  }

  open(opts: WindowOptions): WindowHandle {
    const area = this.workArea();
    const width = Math.min(opts.width ?? 640, area.width - 16);
    const height = Math.min(opts.height ?? 440, area.height - 16);
    const step = (this.cascade++ % 8) * 28;
    let x = area.left + Math.max(8, (area.width - width) / 2 - 120) + step;
    let y = area.top + Math.max(8, (area.height - height) / 2 - 80) + step;
    x = Math.max(area.left, Math.min(x, area.left + area.width - width));
    y = Math.max(area.top, Math.min(y, area.top + area.height - height));

    const win = new WindowHandle(this, {
      id: `w${this.nextId++}`,
      appId: opts.appId,
      title: opts.title,
      icon: opts.icon,
      x,
      y,
      width,
      height,
      minWidth: opts.minWidth ?? 260,
      minHeight: opts.minHeight ?? 160,
      minimized: false,
      maximized: false,
      focused: false,
      z: 0,
    });

    for (const dir of RESIZE_DIRECTIONS) {
      win.el.append(h('div', { class: `window-resize window-resize-${dir}`, dataset: { dir } }));
    }
    this.renderChrome(win);
    this.attachInteractions(win);
    this.windows.set(win.id, win);
    this.layer.append(win.el);
    win.el.classList.add('window-opening');
    win.el.addEventListener('animationend', () => win.el.classList.remove('window-opening'), { once: true });
    this.focus(win.id);
    return win;
  }

  focus(id: string): void {
    const target = this.windows.get(id);
    if (!target) return;
    target.state.minimized = false;
    if (!target.state.focused) target.state.z = ++this.zTop;
    for (const win of this.windows.values()) {
      win.state.focused = win === target;
      this.apply(win);
    }
    this.notify();
  }

  minimize(id: string): void {
    const win = this.windows.get(id);
    if (!win) return;
    win.state.minimized = true;
    win.state.focused = false;
    this.apply(win);
    this.focusTopmost();
  }

  toggleMaximize(id: string): void {
    const win = this.windows.get(id);
    if (!win) return;
    win.state.maximized = !win.state.maximized;
    this.apply(win);
    this.notify();
  }

  /** Taskbar/dock behaviour: restore if minimized, minimize if focused, else focus. */
  toggle(id: string): void {
    const win = this.windows.get(id);
    if (!win) return;
    if (win.state.focused && !win.state.minimized) this.minimize(id);
    else this.focus(id);
  }

  async close(id: string, force = false): Promise<boolean> {
    const win = this.windows.get(id);
    if (!win) return true;
    if (!force) {
      for (const guard of win.closeGuards) {
        if (!(await guard())) return false;
      }
    }
    win.closeHandlers.forEach((fn) => fn());
    this.windows.delete(id);
    win.el.remove();
    if (win.state.focused) this.focusTopmost();
    else this.notify();
    return true;
  }

  private focusTopmost(): void {
    const top = this.list()
      .filter((w) => !w.state.minimized)
      .sort((a, b) => b.state.z - a.state.z)[0];
    if (top) this.focus(top.id);
    else {
      this.windows.forEach((w) => (w.state.focused = false));
      this.windows.forEach((w) => this.apply(w));
      this.notify();
    }
  }

  private workArea() {
    const { top, right, bottom, left } = this.insets;
    return {
      left,
      top,
      width: this.layer.clientWidth - left - right,
      height: this.layer.clientHeight - top - bottom,
    };
  }

  private renderChrome(win: WindowHandle): void {
    win.el.querySelector(':scope > .window-titlebar')?.remove();
    win.el.prepend(this.chrome(win));
  }

  /** Push window state to the DOM. */
  private apply(win: WindowHandle): void {
    const s = win.state;
    const style = win.el.style;
    if (s.maximized) {
      const area = this.workArea();
      Object.assign(style, {
        left: `${area.left}px`,
        top: `${area.top}px`,
        width: `${area.width}px`,
        height: `${area.height}px`,
      });
    } else {
      Object.assign(style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.width}px`, height: `${s.height}px` });
    }
    style.zIndex = String(s.z);
    win.el.classList.toggle('is-focused', s.focused);
    win.el.classList.toggle('is-minimized', s.minimized);
    win.el.classList.toggle('is-maximized', s.maximized);
  }

  private attachInteractions(win: WindowHandle): void {
    const el = win.el;
    el.addEventListener('pointerdown', () => !win.state.focused && this.focus(win.id), { capture: true });

    el.addEventListener('click', (e) => {
      const button = (e.target as Element).closest<HTMLElement>('.window-titlebar [data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'close') this.close(win.id);
      else if (action === 'minimize') this.minimize(win.id);
      else if (action === 'maximize') this.toggleMaximize(win.id);
    });

    el.addEventListener('dblclick', (e) => {
      const target = e.target as Element;
      if (target.closest('.window-titlebar') && !target.closest('[data-action]')) this.toggleMaximize(win.id);
    });

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-action]')) return;
      if (target.classList.contains('window-resize')) this.startResize(win, target.dataset.dir!, e);
      else if (target.closest('.window-titlebar')) this.startDrag(win, e);
    });
  }

  private track(e: PointerEvent, onMove: (dx: number, dy: number) => void): void {
    const startX = e.clientX;
    const startY = e.clientY;
    const target = e.target as HTMLElement;
    target.setPointerCapture(e.pointerId);
    this.layer.classList.add('is-interacting');
    const move = (ev: PointerEvent) => onMove(ev.clientX - startX, ev.clientY - startY);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      this.layer.classList.remove('is-interacting');
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  private startDrag(win: WindowHandle, e: PointerEvent): void {
    const s = win.state;
    let originX = s.x;
    let originY = s.y;
    let pendingRestore = s.maximized;
    this.track(e, (dx, dy) => {
      if (pendingRestore) {
        // Dragging a maximized window un-maximizes it under the cursor.
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        pendingRestore = false;
        const area = this.workArea();
        const ratio = (e.clientX - area.left) / area.width;
        s.maximized = false;
        originX = e.clientX - ratio * s.width;
        originY = this.insets.top;
        this.notify();
      }
      if (s.maximized) return;
      s.x = originX + dx;
      s.y = Math.max(this.insets.top, Math.min(originY + dy, this.layer.clientHeight - this.insets.bottom - 32));
      this.apply(win);
    });
  }

  private startResize(win: WindowHandle, dir: string, e: PointerEvent): void {
    const s = win.state;
    if (s.maximized) return;
    const o = { x: s.x, y: s.y, width: s.width, height: s.height };
    this.track(e, (dx, dy) => {
      if (dir.includes('e')) s.width = Math.max(s.minWidth, o.width + dx);
      if (dir.includes('s')) s.height = Math.max(s.minHeight, o.height + dy);
      if (dir.includes('w')) {
        s.width = Math.max(s.minWidth, o.width - dx);
        s.x = o.x + o.width - s.width;
      }
      if (dir.includes('n')) {
        const maxGrow = o.y - this.insets.top;
        s.height = Math.max(s.minHeight, Math.min(o.height - dy, o.height + maxGrow));
        s.y = o.y + o.height - s.height;
      }
      this.apply(win);
    });
  }
}
