import type { WindowChrome } from '../core/windowManager';
import { h } from '../ui/dom';
import { glyph, icon } from '../ui/icons';

const button = (action: string, label: string, glyphName: string) =>
  h('button', { class: `window-button window-${action}`, dataset: { action }, 'aria-label': label, title: label }, glyph(glyphName, 12));

/** Icon and title on the left, minimize/maximize/close on the right. */
export const windowsChrome: WindowChrome = (win) =>
  h(
    'div',
    { class: 'window-titlebar' },
    h('span', { class: 'window-icon' }, icon(win.state.icon, 16)),
    h('span', { class: 'window-title' }, win.state.title),
    h(
      'div',
      { class: 'window-controls' },
      button('minimize', 'Minimize', 'minimize'),
      button('maximize', 'Maximize', 'maximize'),
      button('close', 'Close', 'close'),
    ),
  );

/** Traffic-light buttons on the left, centred title. */
export const macChrome: WindowChrome = (win) =>
  h(
    'div',
    { class: 'window-titlebar' },
    h(
      'div',
      { class: 'window-controls' },
      button('close', 'Close', 'close'),
      button('minimize', 'Minimize', 'minimize'),
      button('maximize', 'Zoom', 'maximize'),
    ),
    h('span', { class: 'window-title' }, win.state.title),
  );
