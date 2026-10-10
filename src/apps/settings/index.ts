import type { AppDefinition } from '../../core/appRegistry';
import { WALLPAPERS } from '../../core/os';
import { h } from '../../ui/dom';
import './style.css';

/** Shown as placeholders until their shells exist. */
const UPCOMING = [{ id: 'ios', label: 'iOS', description: 'Home screen with full-screen apps. Coming soon.' }];

export const settingsApp: AppDefinition = {
  id: 'settings',
  name: 'Settings',
  icon: 'settings',
  singleInstance: true,
  defaultSize: { width: 620, height: 520 },
  minSize: { width: 420, height: 360 },

  launch({ os, win }) {
    const themes = h('div', { class: 'settings-themes' });
    const wallpapers = h('div', { class: 'settings-wallpapers' });
    const about = h('dl', { class: 'settings-about' });

    win.body.append(
      h(
        'div',
        { class: 'settings' },
        h('h2', null, 'Appearance'),
        h('p', { class: 'settings-hint' }, 'Switch the whole desktop look. Open windows stay open.'),
        themes,
        h('h2', null, 'Wallpaper'),
        wallpapers,
        h('h2', null, 'About'),
        about,
      ),
    );

    const themeCard = (id: string, label: string, description: string, active: boolean, disabled: boolean) =>
      h(
        'button',
        {
          class: `settings-theme${active ? ' is-active' : ''}`,
          disabled,
          'aria-pressed': String(active),
          onclick: () => os.themes.set(id),
        },
        h('div', { class: `theme-preview theme-preview-${id}` }, h('div', { class: 'tp-bar' }), h('div', { class: 'tp-window' }, h('div', { class: 'tp-title' }))),
        h('div', { class: 'settings-theme-label' }, label),
        h('div', { class: 'settings-theme-desc' }, description),
      );

    const render = () => {
      themes.replaceChildren(
        ...os.themes.list().map((s) => themeCard(s.id, s.label, s.description, s.id === os.themes.active, false)),
        ...UPCOMING.map((u) => themeCard(u.id, u.label, u.description, false, true)),
      );
      wallpapers.replaceChildren(
        ...WALLPAPERS.map((w) =>
          h(
            'button',
            {
              class: `settings-wallpaper${w.id === os.wallpaper ? ' is-active' : ''}`,
              title: w.label,
              onclick: () => os.setWallpaper(w.id),
            },
            h('span', { class: 'settings-wallpaper-swatch', style: { background: w.css ?? 'var(--wallpaper)' } }),
            h('span', null, w.label),
          ),
        ),
      );
      const fileCount = (path: string): number =>
        os.fs.list(path).reduce((n, node) => n + 1 + (node.type === 'dir' ? fileCount(`${path === '/' ? '' : path}/${node.name}`) : 0), 0);
      about.replaceChildren(
        h('dt', null, 'System'), h('dd', null, 'WebOS 0.1'),
        h('dt', null, 'Theme'), h('dd', null, os.themes.list().find((s) => s.id === os.themes.active)?.label ?? '—'),
        h('dt', null, 'Applications'), h('dd', null, String(os.apps.all().length)),
        h('dt', null, 'Files & folders'), h('dd', null, String(fileCount('/'))),
        h('dt', null, 'Open windows'), h('dd', null, String(os.wm.list().length)),
        h('dt', null, 'Storage'), h('dd', null, 'In memory — resets on reload'),
      );
    };

    const offs = [
      os.bus.on('theme:changed', render),
      os.bus.on('settings:changed', render),
      os.bus.on('fs:changed', render),
    ];
    win.onClose(() => offs.forEach((off) => off()));
    render();
  },
};
