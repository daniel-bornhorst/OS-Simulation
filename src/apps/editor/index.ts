import type { AppDefinition } from '../../core/appRegistry';
import { basename, dirname, HOME, joinPath, resolvePath } from '../../core/vfs';
import { alertDialog, confirmDialog, promptDialog } from '../../ui/dialog';
import { h } from '../../ui/dom';
import { glyph } from '../../ui/icons';
import './style.css';

export const editorApp: AppDefinition = {
  id: 'editor',
  name: 'Text Editor',
  icon: 'editor',
  fileTypes: ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', ''],
  defaultSize: { width: 640, height: 460 },
  minSize: { width: 300, height: 200 },

  launch({ os, win, args }) {
    let path: string | null = null;
    let nodeId: string | undefined;
    let saved = '';
    const track = () => (nodeId = path ? os.fs.stat(path)?.id : undefined);

    const textarea = h('textarea', { class: 'editor-text', spellcheck: false, 'aria-label': 'Document' });
    const status = h('span', { class: 'editor-status' });
    const position = h('span', { class: 'editor-position' });

    const dirty = () => textarea.value !== saved;
    const updateTitle = () => {
      const name = path ? basename(path) : 'Untitled';
      win.setTitle(`${dirty() ? '• ' : ''}${name} — Text Editor`);
      status.textContent = path ?? 'Not saved yet';
    };
    const updatePosition = () => {
      const before = textarea.value.slice(0, textarea.selectionStart);
      const line = before.split('\n').length;
      const col = before.length - before.lastIndexOf('\n');
      position.textContent = `Ln ${line}, Col ${col}  ·  ${textarea.value.length} chars`;
    };

    const load = (p: string) => {
      const content = os.tryFS(() => os.fs.read(p));
      if (content === undefined) return;
      path = p;
      track();
      saved = content;
      textarea.value = content;
      updateTitle();
      updatePosition();
    };

    const confirmDiscard = async () =>
      !dirty() || confirmDialog('Unsaved changes', `Discard changes to ${path ? basename(path) : 'Untitled'}?`, 'Discard', true);

    const saveAs = async (): Promise<boolean> => {
      const suggestion = path ?? joinPath(`${HOME}/Documents`, os.fs.uniqueName(`${HOME}/Documents`, 'Untitled.txt'));
      const input = await promptDialog('Save As', 'Save to path:', suggestion, 'Save');
      if (!input) return false;
      const target = resolvePath(path ? dirname(path) : HOME, input);
      if (os.fs.isDir(target)) {
        await alertDialog('Save As', `${target} is a folder.`);
        return false;
      }
      if (target !== path && os.fs.exists(target) && !(await confirmDialog('Replace file', `${basename(target)} already exists. Replace it?`, 'Replace', true))) {
        return false;
      }
      nodeId = undefined;
      path = target;
      return save();
    };

    const save = async (): Promise<boolean> => {
      if (!path) return saveAs();
      const ok = os.tryFS(() => (os.fs.write(path!, textarea.value), true));
      if (ok) {
        saved = textarea.value;
        track();
      }
      updateTitle();
      return !!ok;
    };

    const open = async () => {
      if (!(await confirmDiscard())) return;
      const input = await promptDialog('Open', 'File path:', path ? dirname(path) + '/' : `${HOME}/Documents/`, 'Open');
      if (input) load(resolvePath(HOME, input));
    };

    const newDoc = async () => {
      if (!(await confirmDiscard())) return;
      path = null;
      nodeId = undefined;
      saved = '';
      textarea.value = '';
      updateTitle();
      updatePosition();
    };

    const toolButton = (label: string, glyphName: string, action: () => void, title = label) =>
      h('button', { class: 'btn btn-tool', title, onclick: action }, glyph(glyphName, 16), h('span', null, label));

    win.body.append(
      h(
        'div',
        { class: 'editor' },
        h(
          'div',
          { class: 'toolbar' },
          toolButton('New', 'new', newDoc),
          toolButton('Open', 'open', open, 'Open… (Ctrl+O)'),
          toolButton('Save', 'save', save, 'Save (Ctrl+S)'),
          h('button', { class: 'btn btn-tool', onclick: saveAs }, 'Save As…'),
        ),
        textarea,
        h('div', { class: 'statusbar' }, status, position),
      ),
    );

    textarea.addEventListener('input', () => {
      updateTitle();
      updatePosition();
    });
    textarea.addEventListener('keyup', updatePosition);
    textarea.addEventListener('click', updatePosition);
    textarea.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 's') {
        e.preventDefault();
        e.shiftKey ? saveAs() : save();
      } else if (mod && e.key === 'o') {
        e.preventDefault();
        open();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end');
        updateTitle();
      }
    });

    win.onBeforeClose(confirmDiscard);

    // Follow the file by identity if it's renamed or moved while open.
    const offFs = os.bus.on('fs:changed', () => {
      if (!nodeId) return;
      const current = os.fs.pathOf(nodeId);
      if (current !== path) {
        if (current) path = current;
        else nodeId = undefined;
        updateTitle();
      }
    });
    win.onClose(offFs);

    if (args.path) load(args.path);
    else {
      updateTitle();
      updatePosition();
    }
    textarea.focus();
  },
};
