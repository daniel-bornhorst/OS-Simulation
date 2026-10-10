import { alertDialog } from '../ui/dialog';
import { h } from '../ui/dom';
import { AppRegistry, type AppArgs } from './appRegistry';
import { EventBus } from './eventBus';
import type { OSEvents } from './events';
import type { StorageAdapter } from './storage';
import { ThemeManager } from './themeManager';
import { extname, FSError, VirtualFS } from './vfs';
import { WindowManager, type WindowHandle } from './windowManager';

export interface Wallpaper {
  id: string;
  label: string;
  /** CSS `background` value; null means "use the theme's default". */
  css: string | null;
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'default', label: 'Theme default', css: null },
  { id: 'aurora', label: 'Aurora', css: 'linear-gradient(135deg, #0f2027, #203a43 45%, #2c5364)' },
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(160deg, #2b1055, #d53369 60%, #ffb347)' },
  { id: 'meadow', label: 'Meadow', css: 'linear-gradient(160deg, #a8e063, #56ab2f)' },
  { id: 'ocean', label: 'Ocean', css: 'radial-gradient(circle at 30% 20%, #4facfe, #00419c 70%)' },
  { id: 'teal', label: 'Classic teal', css: '#008080' },
  { id: 'graphite', label: 'Graphite', css: '#2b2d31' },
];

export class OS {
  readonly bus = new EventBus<OSEvents>();
  readonly apps = new AppRegistry();
  readonly fs: VirtualFS;
  readonly wm: WindowManager;
  readonly themes: ThemeManager;
  wallpaper = 'default';

  constructor(
    readonly root: HTMLElement,
    storage: StorageAdapter,
    seed: (fs: VirtualFS) => void,
  ) {
    const shellRoot = h('div', { class: 'shell-root' });
    const windowLayer = h('div', { class: 'window-layer' });
    root.append(shellRoot, windowLayer);

    this.fs = new VirtualFS(storage, seed);
    this.fs.onChange((change) => this.bus.emit('fs:changed', change));
    this.wm = new WindowManager(windowLayer, this.bus);
    this.themes = new ThemeManager(this, shellRoot);
  }

  launch(appId: string, args: AppArgs = {}): WindowHandle | undefined {
    const app = this.apps.get(appId);
    if (!app) {
      alertDialog('Application not found', `There is no application called "${appId}".`);
      return;
    }
    if (app.singleInstance) {
      const existing = this.wm.list().find((w) => w.state.appId === appId);
      if (existing) {
        existing.focus();
        return existing;
      }
    }
    const win = this.wm.open({
      appId,
      title: app.name,
      icon: app.icon,
      width: app.defaultSize?.width,
      height: app.defaultSize?.height,
      minWidth: app.minSize?.width,
      minHeight: app.minSize?.height,
    });
    try {
      app.launch({ os: this, win, args });
    } catch (err) {
      win.forceClose();
      alertDialog(`${app.name} crashed`, String(err instanceof Error ? err.message : err));
    }
    return win;
  }

  /** Open a file or folder with the right app, like double-clicking it. */
  openPath(path: string): void {
    const node = this.fs.stat(path);
    if (!node) {
      alertDialog('Not found', `${path} does not exist.`);
      return;
    }
    if (node.type === 'dir') {
      this.launch('explorer', { path });
    } else if (extname(node.name) === 'app') {
      this.launch((node.content ?? '').trim());
    } else {
      const app =
        this.apps.forFile(node.name) ?? this.apps.get(node.mime?.startsWith('image/') ? 'paint' : 'editor');
      if (app) this.launch(app.id, { path });
    }
  }

  setWallpaper(id: string): void {
    const wallpaper = WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
    this.wallpaper = wallpaper.id;
    if (wallpaper.css) this.root.style.setProperty('--wallpaper', wallpaper.css);
    else this.root.style.removeProperty('--wallpaper');
    this.bus.emit('settings:changed', undefined);
  }

  /** Run a filesystem operation, reporting failures in a dialog. */
  tryFS<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      if (!(err instanceof FSError)) throw err;
      alertDialog('Error', err.message);
      return undefined;
    }
  }

  restart(): void {
    location.reload();
  }
}
