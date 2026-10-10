import type { AppDefinition } from '../../core/appRegistry';
import { h } from '../../ui/dom';
import { TerminalSession } from './session';
import './style.css';

export const terminalApp: AppDefinition = {
  id: 'terminal',
  name: 'Terminal',
  icon: 'terminal',
  defaultSize: { width: 680, height: 420 },
  minSize: { width: 320, height: 180 },

  launch({ os, win, args }) {
    const session = new TerminalSession(os.fs, {
      open: (path) => os.openPath(path),
      launch: (id) => (os.apps.get(id) ? (os.launch(id), true) : false),
      themes: () => os.themes.list().map((s) => s.id),
      setTheme: (id) => os.themes.set(id),
    });
    if (args.path && os.fs.isDir(args.path)) session.cwd = args.path;

    const scrollback = h('div', { class: 'term-scrollback' });
    const promptEl = h('span', { class: 'term-prompt' });
    const input = h('input', { class: 'term-input', spellcheck: false, autocomplete: 'off', 'aria-label': 'Command' });
    const screen = h('div', { class: 'term' }, scrollback, h('div', { class: 'term-line' }, promptEl, input));
    win.body.append(screen);

    const updatePrompt = () => {
      promptEl.textContent = session.prompt + ' ';
      win.setTitle(`Terminal — ${session.displayPath()}`);
    };
    const print = (text: string, className = 'term-output') => {
      if (text) scrollback.append(h('div', { class: className }, text));
      screen.scrollTop = screen.scrollHeight;
    };

    let historyIndex = session.history.length;
    let draft = '';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const line = input.value;
        print(`${session.prompt} ${line}`, 'term-echo');
        input.value = '';
        const result = session.run(line);
        if (result.clear) scrollback.replaceChildren();
        print(result.output);
        historyIndex = session.history.length;
        updatePrompt();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex === session.history.length) draft = input.value;
        historyIndex = Math.max(0, Math.min(session.history.length, historyIndex + (e.key === 'ArrowUp' ? -1 : 1)));
        input.value = session.history[historyIndex] ?? draft;
        input.setSelectionRange(input.value.length, input.value.length);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const { line, matches } = session.complete(input.value);
        input.value = line;
        if (matches.length) {
          print(`${session.prompt} ${line}`, 'term-echo');
          print(matches.join('  '));
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        scrollback.replaceChildren();
      } else if (e.key === 'c' && e.ctrlKey && input.selectionStart === input.selectionEnd) {
        e.preventDefault();
        print(`${session.prompt} ${input.value}^C`, 'term-echo');
        input.value = '';
      }
    });

    // Clicking anywhere focuses the input, unless the user is selecting text.
    screen.addEventListener('mouseup', () => {
      if (!window.getSelection()?.toString()) input.focus();
    });
    win.el.addEventListener('pointerup', (e) => !screen.contains(e.target as Node) && input.focus());

    const motd = os.fs.exists('/etc/motd') ? os.fs.read('/etc/motd') : '';
    print(motd, 'term-motd');
    updatePrompt();
    input.focus();
  },
};
