import type { OS } from '../../core/os';
import { HOME } from '../../core/vfs';
import type { WindowHandle } from '../../core/windowManager';
import { startClock } from '../../ui/clock';
import { showMenu, closeMenu, type MenuItem } from '../../ui/contextMenu';
import { mountDesktop } from '../../ui/desktop';
import { alertDialog, confirmDialog } from '../../ui/dialog';
import { h } from '../../ui/dom';
import { glyph, icon } from '../../ui/icons';
import { macChrome } from '../chrome';
import type { Shell } from '../shell';
import './style.css';

const MENUBAR_HEIGHT = 28;
const DOCK_HEIGHT = 78;

const formatMenuClock = (d: Date) =>
  d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

let cleanups: (() => void)[] = [];

/** A macOS-style shell: menu bar along the top, dock along the bottom. */
export const macShell: Shell = {
  id: 'mac',
  label: 'macOS',
  description: 'Menu bar on top, a dock with app icons, and traffic-light window buttons.',
  insets: { top: MENUBAR_HEIGHT, right: 0, bottom: DOCK_HEIGHT, left: 0 },
  chrome: macChrome,

  mount(root: HTMLElement, os: OS) {
    const desktop = h('div', { class: 'desktop' });
    const menubar = h('div', { class: 'menubar', style: { height: `${MENUBAR_HEIGHT}px` } });
    const dock = h('div', { class: 'dock' });
    root.append(desktop, menubar, h('div', { class: 'dock-wrap' }, dock));

    const appWindows = (appId: string) => os.wm.list().filter((w) => w.state.appId === appId);
    const focusedApp = () => {
      const win = os.wm.focused();
      return win ? os.apps.get(win.state.appId) : undefined;
    };

    // ---- menu bar ----
    const clock = h('span', { class: 'menubar-clock' });
    let openMenu: string | null = null;
    let lastClosed = { label: '', at: 0 };

    const menus = (): [string, () => MenuItem[], string?][] => {
      const app = focusedApp();
      const appName = app?.name ?? 'Files';
      const win = os.wm.focused();
      return [
        [
          'logo',
          () => [
            { label: 'About WebOS', action: () => aboutDialog(os) },
            { separator: true },
            { label: 'System Settings…', action: () => os.launch('settings') },
            { separator: true },
            { label: 'Restart…', action: () => confirmRestart(os) },
          ],
        ],
        [
          appName,
          () => [
            { label: `About ${appName}`, action: () => alertDialog(appName, `${appName} for WebOS.`) },
            { separator: true },
            {
              label: `Quit ${appName}`,
              shortcut: '⌘Q',
              disabled: !app,
              action: () => app && appWindows(app.id).forEach((w) => w.close()),
            },
          ],
          'menubar-app-name',
        ],
        [
          'File',
          () => [
            { label: 'New Window', shortcut: '⌘N', action: () => os.launch(app?.id ?? 'explorer') },
            { label: 'New Files Window', action: () => os.launch('explorer') },
            { separator: true },
            { label: 'Close Window', shortcut: '⌘W', disabled: !win, action: () => win?.close() },
          ],
        ],
        [
          'Window',
          () => [
            { label: 'Minimize', shortcut: '⌘M', disabled: !win, action: () => win && os.wm.minimize(win.id) },
            { label: 'Zoom', disabled: !win, action: () => win && os.wm.toggleMaximize(win.id) },
            { separator: true },
            ...os.wm.list().map((w): MenuItem => ({ label: w.state.title, checked: w.state.focused, action: () => w.focus() })),
          ],
        ],
        ['Help', () => [{ label: 'WebOS Help', action: () => os.openPath(`${HOME}/Desktop/Welcome.txt`) }]],
      ];
    };

    const renderMenubar = () => {
      menubar.replaceChildren(
        ...menus().map(([label, items, extraClass]) => {
          const button = h(
            'button',
            { class: `menubar-item ${extraClass ?? ''}`, dataset: { menu: label } },
            label === 'logo' ? glyph('logo', 15) : label,
          );
          const open = () => {
            const rect = button.getBoundingClientRect();
            button.classList.add('is-open');
            openMenu = label;
            showMenu(rect.left, rect.bottom + 2, items(), {
              className: 'menubar-menu',
              onClose: () => {
                button.classList.remove('is-open');
                if (openMenu === label) openMenu = null;
                lastClosed = { label, at: performance.now() };
              },
            });
          };
          button.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            // The outside-click handler already closed this menu; don't reopen it.
            if (lastClosed.label === label && performance.now() - lastClosed.at < 100) return;
            open();
          });
          // Like a real menu bar, hovering switches menus once one is open.
          button.addEventListener('pointerenter', () => {
            if (openMenu && openMenu !== label) open();
          });
          return button;
        }),
        h('div', { class: 'menubar-spacer' }),
        clock,
      );
    };

    // ---- dock ----
    const renderDock = () => {
      const running = new Set(os.wm.list().map((w) => w.state.appId));
      dock.replaceChildren(
        ...os.apps.launchable().map((app) =>
          h(
            'button',
            {
              class: `dock-item${running.has(app.id) ? ' is-running' : ''}`,
              'aria-label': app.name,
              onclick: () => activateApp(os, app.id, appWindows(app.id)),
            },
            h('span', { class: 'dock-tooltip' }, app.name),
            icon(app.icon, 52),
          ),
        ),
      );
    };

    const render = () => {
      renderMenubar();
      renderDock();
    };
    render();

    cleanups = [
      mountDesktop(desktop, os, { align: 'right' }),
      startClock(clock, formatMenuClock),
      os.bus.on('windows:changed', render),
    ];
  },

  unmount() {
    closeMenu();
    cleanups.forEach((fn) => fn());
    cleanups = [];
  },
};

/** Dock click: launch if not running, otherwise bring its frontmost window forward. */
function activateApp(os: OS, appId: string, windows: WindowHandle[]): void {
  if (!windows.length) {
    os.launch(appId);
    return;
  }
  const visible = windows.filter((w) => !w.state.minimized);
  const target = (visible.length ? visible : windows).sort((a, b) => b.state.z - a.state.z)[0];
  target.focus();
}

function aboutDialog(os: OS): void {
  alertDialog('About WebOS', `WebOS — a desktop simulated in your browser.\n${os.apps.all().length} apps installed.`);
}

async function confirmRestart(os: OS): Promise<void> {
  if (await confirmDialog('Restart', 'Restart WebOS? All files will be reset to their original state.', 'Restart', true)) {
    os.restart();
  }
}
