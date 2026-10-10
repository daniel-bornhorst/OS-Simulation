import type { OS } from '../core/os';
import { HOME } from '../core/vfs';
import { startClock, formatTime } from '../ui/clock';
import { onContextMenu } from '../ui/contextMenu';
import { mountDesktop } from '../ui/desktop';
import { confirmDialog, promptDialog } from '../ui/dialog';
import { h } from '../ui/dom';
import { glyph, icon } from '../ui/icons';
import { windowsChrome } from './chrome';
import type { Shell } from './shell';

interface TaskbarShellConfig {
  id: string;
  label: string;
  description: string;
  taskbarHeight: number;
  /** `grid`: searchable app grid. `list`: classic cascading Start menu. */
  startMenu: 'grid' | 'list';
  startLabel?: string;
  /** Text shown on the side banner of the `list` start menu. */
  brand?: string;
}

/** A Windows-style shell: desktop, bottom taskbar, Start menu. */
export function createTaskbarShell(cfg: TaskbarShellConfig): Shell {
  let cleanups: (() => void)[] = [];

  return {
    id: cfg.id,
    label: cfg.label,
    description: cfg.description,
    insets: { top: 0, right: 0, bottom: cfg.taskbarHeight, left: 0 },
    chrome: windowsChrome,

    mount(root: HTMLElement, os: OS) {
      const desktop = h('div', { class: 'desktop' });
      const startButton = h(
        'button',
        { class: 'start-button', 'aria-label': 'Start', title: 'Start' },
        glyph('logo', 18),
        cfg.startLabel ? h('span', null, cfg.startLabel) : null,
      );
      const windowList = h('div', { class: 'taskbar-windows' });
      const clock = h('span', { class: 'taskbar-clock' });
      const taskbar = h(
        'div',
        { class: 'taskbar', style: { height: `${cfg.taskbarHeight}px` } },
        startButton,
        windowList,
        h('div', { class: 'taskbar-tray' }, clock),
      );
      const startMenu = cfg.startMenu === 'grid' ? buildGridMenu(os, () => closeStart()) : buildListMenu(os, cfg, () => closeStart());
      startMenu.style.bottom = `${cfg.taskbarHeight}px`;
      root.append(desktop, taskbar, startMenu);

      // ---- start menu ----
      const isOpen = () => startMenu.classList.contains('is-open');
      const closeStart = () => {
        startMenu.classList.remove('is-open');
        startButton.classList.remove('is-active');
      };
      const openStart = () => {
        startMenu.classList.add('is-open');
        startButton.classList.add('is-active');
        startMenu.dispatchEvent(new Event('open'));
      };
      startButton.addEventListener('click', () => (isOpen() ? closeStart() : openStart()));
      const onOutside = (e: PointerEvent) => {
        const t = e.target as Node;
        if (isOpen() && !startMenu.contains(t) && !startButton.contains(t)) closeStart();
      };
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeStart();
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey);

      // ---- running windows ----
      const renderWindows = () => {
        windowList.replaceChildren(
          ...os.wm.list().map((w) =>
            h(
              'button',
              {
                class: `taskbar-window${w.state.focused && !w.state.minimized ? ' is-active' : ''}${w.state.minimized ? ' is-minimized' : ''}`,
                title: w.state.title,
                onclick: () => os.wm.toggle(w.id),
              },
              icon(w.state.icon, 20),
              h('span', { class: 'taskbar-window-title' }, w.state.title),
            ),
          ),
        );
      };
      renderWindows();

      onContextMenu(taskbar, () => [
        { label: 'Show Desktop', glyph: 'desktop', action: () => os.wm.list().forEach((w) => os.wm.minimize(w.id)) },
        { label: 'Settings', action: () => os.launch('settings') },
      ]);

      cleanups = [
        mountDesktop(desktop, os),
        startClock(clock, formatTime),
        os.bus.on('windows:changed', renderWindows),
        () => document.removeEventListener('pointerdown', onOutside, true),
        () => document.removeEventListener('keydown', onKey),
      ];
    },

    unmount() {
      cleanups.forEach((fn) => fn());
      cleanups = [];
    },
  };
}

async function confirmRestart(os: OS): Promise<void> {
  if (await confirmDialog('Restart', 'Restart WebOS? All files will be reset to their original state.', 'Restart', true)) {
    os.restart();
  }
}

/** Modern start menu: search box, app grid, user + power footer. */
function buildGridMenu(os: OS, close: () => void): HTMLElement {
  const search = h('input', { class: 'input start-search', type: 'search', placeholder: 'Search apps' });
  const grid = h('div', { class: 'start-grid' });

  const launch = (id: string) => {
    close();
    os.launch(id);
  };
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const apps = os.apps.launchable().filter((a) => a.name.toLowerCase().includes(q));
    grid.replaceChildren(
      ...apps.map((app) =>
        h('button', { class: 'start-app', onclick: () => launch(app.id) }, icon(app.icon, 36), h('span', null, app.name)),
      ),
    );
    if (!apps.length) grid.append(h('div', { class: 'start-empty' }, 'No matching apps'));
  };
  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') grid.querySelector<HTMLButtonElement>('.start-app')?.click();
  });

  const menu = h(
    'div',
    { class: 'start-menu start-menu-grid' },
    search,
    h('div', { class: 'start-section-title' }, 'Apps'),
    grid,
    h(
      'div',
      { class: 'start-footer' },
      h('div', { class: 'start-user' }, h('span', { class: 'start-avatar' }, 'U'), 'user'),
      h('button', { class: 'start-power', title: 'Restart', onclick: () => (close(), confirmRestart(os)) }, glyph('power', 18)),
    ),
  );
  menu.addEventListener('open', () => {
    search.value = '';
    render();
    requestAnimationFrame(() => search.focus());
  });
  return menu;
}

/** Classic start menu: brand banner, program list, Run…, Shut Down… */
function buildListMenu(os: OS, cfg: TaskbarShellConfig, close: () => void): HTMLElement {
  const item = (label: string, iconEl: Element, action: () => void) =>
    h('button', { class: 'start-item', onclick: () => (close(), action()) }, iconEl, h('span', null, label));

  const list = h('div', { class: 'start-items' });
  const render = () =>
    list.replaceChildren(
      ...os.apps.launchable().map((app) => item(app.name, icon(app.icon, 24), () => os.launch(app.id))),
      h('div', { class: 'menu-separator' }),
      item('Documents', icon('folder', 24), () => os.launch('explorer', { path: `${HOME}/Documents` })),
      item('Run…', icon('app', 24), async () => {
        const cmd = (await promptDialog('Run', 'Type the name of a program or a file path:', ''))?.trim();
        if (!cmd) return;
        if (os.apps.get(cmd)) os.launch(cmd);
        else os.openPath(cmd.startsWith('/') || cmd.startsWith('~') ? cmd.replace(/^~/, HOME) : `${HOME}/${cmd}`);
      }),
      h('div', { class: 'menu-separator' }),
      item('Shut Down…', glyph('power', 24), () => confirmRestart(os)),
    );

  const menu = h(
    'div',
    { class: 'start-menu start-menu-list' },
    h('div', { class: 'start-banner' }, h('span', null, cfg.brand ?? 'WebOS')),
    list,
  );
  menu.addEventListener('open', render);
  return menu;
}
