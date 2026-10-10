import type { AppDefinition } from '../../core/appRegistry';
import type { FSNode } from '../../core/storage';
import { basename, dirname, HOME, joinPath, resolvePath } from '../../core/vfs';
import { onContextMenu, type MenuItem } from '../../ui/contextMenu';
import { h } from '../../ui/dom';
import { deleteItem, DRAG_TYPE, moveInto, newFolder, newTextFile, renameItem } from '../../ui/fileActions';
import { displayName, glyph, icon, iconNameFor } from '../../ui/icons';
import './style.css';

const PLACES = [
  { label: 'Home', glyph: 'home', path: HOME },
  { label: 'Desktop', glyph: 'desktop', path: `${HOME}/Desktop` },
  { label: 'Documents', glyph: 'documents', path: `${HOME}/Documents` },
  { label: 'Pictures', glyph: 'pictures', path: `${HOME}/Pictures` },
  { label: 'Downloads', glyph: 'downloads', path: `${HOME}/Downloads` },
  { label: 'Computer', glyph: 'drive', path: '/' },
];

function formatSize(node: FSNode): string {
  if (node.type === 'dir') return '—';
  const bytes = (node.content ?? '').length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kindOf(node: FSNode): string {
  if (node.type === 'dir') return 'Folder';
  if (node.name.endsWith('.app')) return 'Application';
  if (node.mime?.startsWith('image/')) return 'Image';
  if (node.mime?.startsWith('text/')) return 'Text document';
  return 'File';
}

export const explorerApp: AppDefinition = {
  id: 'explorer',
  name: 'Files',
  icon: 'explorer',
  defaultSize: { width: 760, height: 480 },
  minSize: { width: 420, height: 260 },

  launch({ os, win, args }) {
    let cwd = args.path && os.fs.isDir(args.path) ? args.path : HOME;
    let history = [cwd];
    let historyIndex = 0;
    let selected: string | null = null;
    let view: 'grid' | 'list' = 'grid';

    const backBtn = h('button', { class: 'btn btn-icon', title: 'Back', onclick: () => go(historyIndex - 1) }, glyph('back'));
    const fwdBtn = h('button', { class: 'btn btn-icon', title: 'Forward', onclick: () => go(historyIndex + 1) }, glyph('forward'));
    const upBtn = h('button', { class: 'btn btn-icon', title: 'Up', onclick: () => navigate(dirname(cwd)) }, glyph('up'));
    const pathInput = h('input', { class: 'input explorer-path', spellcheck: false, 'aria-label': 'Path' });
    const viewBtn = h('button', { class: 'btn btn-icon', title: 'Toggle view' });
    const sidebar = h('nav', { class: 'explorer-sidebar' });
    const content = h('div', { class: 'explorer-content', tabindex: 0 });
    const status = h('span');

    win.body.append(
      h(
        'div',
        { class: 'explorer' },
        h(
          'div',
          { class: 'toolbar' },
          backBtn,
          fwdBtn,
          upBtn,
          pathInput,
          h('button', { class: 'btn btn-icon', title: 'New folder', onclick: () => newFolder(os, cwd) }, glyph('open')),
          viewBtn,
        ),
        h('div', { class: 'explorer-main' }, sidebar, content),
        h('div', { class: 'statusbar' }, status),
      ),
    );

    // ---- navigation ----

    function navigate(path: string) {
      if (!os.fs.isDir(path) || path === cwd) return;
      history = [...history.slice(0, historyIndex + 1), path];
      historyIndex = history.length - 1;
      cwd = path;
      selected = null;
      render();
    }

    function go(index: number) {
      if (index < 0 || index >= history.length || !os.fs.isDir(history[index])) return;
      historyIndex = index;
      cwd = history[index];
      selected = null;
      render();
    }

    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const target = resolvePath(cwd, pathInput.value.trim() || '/');
        if (os.fs.isDir(target)) navigate(target);
        else if (os.fs.exists(target)) os.openPath(target);
        else pathInput.classList.add('is-invalid');
        pathInput.blur();
      } else pathInput.classList.remove('is-invalid');
    });
    pathInput.addEventListener('blur', () => (pathInput.value = cwd));

    viewBtn.addEventListener('click', () => {
      view = view === 'grid' ? 'list' : 'grid';
      render();
    });

    // ---- rendering ----

    function select(path: string | null) {
      selected = path;
      content.querySelectorAll<HTMLElement>('.explorer-item').forEach((el) => {
        el.classList.toggle('is-selected', el.dataset.path === path);
      });
      const node = path ? os.fs.stat(path) : null;
      const count = os.fs.list(cwd).length;
      status.textContent = node
        ? `${node.name} · ${kindOf(node)} · ${formatSize(node)}`
        : `${count} item${count === 1 ? '' : 's'}`;
    }

    function renderSidebar() {
      sidebar.replaceChildren(
        ...PLACES.filter((p) => os.fs.isDir(p.path)).map((p) =>
          h(
            'button',
            { class: `explorer-place${p.path === cwd ? ' is-active' : ''}`, dataset: { path: p.path }, onclick: () => navigate(p.path) },
            glyph(p.glyph, 16),
            h('span', null, p.label),
          ),
        ),
      );
    }

    function render() {
      win.setTitle(cwd === '/' ? 'Computer' : cwd === HOME ? 'Home' : basename(cwd));
      pathInput.value = cwd;
      backBtn.disabled = historyIndex === 0;
      fwdBtn.disabled = historyIndex === history.length - 1;
      upBtn.disabled = cwd === '/';
      viewBtn.replaceChildren(glyph(view === 'grid' ? 'list' : 'grid'));
      renderSidebar();

      const items = os.fs.list(cwd);
      content.className = `explorer-content view-${view}`;
      const header =
        view === 'list'
          ? h('div', { class: 'explorer-row explorer-header' }, h('span', null, 'Name'), h('span', null, 'Modified'), h('span', null, 'Kind'), h('span', null, 'Size'))
          : null;
      content.replaceChildren(
        ...(header ? [header] : []),
        ...items.map((node) => {
          const path = joinPath(cwd, node.name);
          const image = icon(iconNameFor(node, (id) => os.apps.get(id)?.icon), view === 'grid' ? 48 : 20);
          return view === 'grid'
            ? h(
                'div',
                { class: 'explorer-item', draggable: 'true', title: node.name, dataset: { path, type: node.type } },
                image,
                h('span', { class: 'explorer-item-name' }, displayName(node)),
              )
            : h(
                'div',
                { class: 'explorer-item explorer-row', draggable: 'true', dataset: { path, type: node.type } },
                h('span', { class: 'explorer-item-name' }, image, displayName(node)),
                h('span', null, new Date(node.modified).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })),
                h('span', null, kindOf(node)),
                h('span', null, formatSize(node)),
              );
        }),
      );
      if (!items.length) content.append(h('div', { class: 'explorer-empty' }, 'This folder is empty'));
      select(selected && os.fs.exists(selected) ? selected : null);
    }

    // ---- interaction ----

    const itemFrom = (e: Event) => (e.target as Element).closest<HTMLElement>('.explorer-item');
    const open = (path: string) => (os.fs.isDir(path) ? navigate(path) : os.openPath(path));

    content.addEventListener('click', (e) => select(itemFrom(e)?.dataset.path ?? null));
    content.addEventListener('dblclick', (e) => {
      const el = itemFrom(e);
      if (el) open(el.dataset.path!);
    });
    content.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.metaKey) navigate(dirname(cwd));
      if (!selected) return;
      if (e.key === 'Enter') open(selected);
      else if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) deleteItem(os, selected);
      else if (e.key === 'F2') renameItem(os, selected);
    });

    onContextMenu(content, (e): MenuItem[] => {
      const el = itemFrom(e);
      if (el) {
        const path = el.dataset.path!;
        const isDir = el.dataset.type === 'dir';
        select(path);
        return [
          { label: 'Open', glyph: 'open', action: () => open(path) },
          isDir
            ? { label: 'Open in New Window', action: () => os.launch('explorer', { path }) }
            : { label: 'Open in Text Editor', action: () => os.launch('editor', { path }) },
          ...(isDir ? [{ label: 'Open in Terminal', action: () => os.launch('terminal', { path }) }] : []),
          { separator: true },
          { label: 'Rename', shortcut: 'F2', action: () => renameItem(os, path) },
          { label: 'Delete', glyph: 'trash', shortcut: 'Del', action: () => deleteItem(os, path) },
        ];
      }
      select(null);
      return [
        { label: 'New Folder', glyph: 'open', action: () => newFolder(os, cwd) },
        { label: 'New Text File', glyph: 'new', action: () => newTextFile(os, cwd) },
        { separator: true },
        { label: 'Open in Terminal', action: () => os.launch('terminal', { path: cwd }) },
        { label: view === 'grid' ? 'View as List' : 'View as Icons', glyph: view === 'grid' ? 'list' : 'grid', action: () => viewBtn.click() },
      ];
    });

    // Drag items onto folders (in the view or the sidebar) to move them.
    const dropTargetFrom = (e: Event) =>
      (e.target as Element).closest<HTMLElement>('.explorer-item[data-type="dir"], .explorer-place');
    const clearDropTargets = () => win.body.querySelectorAll('.is-drop-target').forEach((x) => x.classList.remove('is-drop-target'));

    content.addEventListener('dragstart', (e) => {
      const el = itemFrom(e);
      if (!el) return;
      e.dataTransfer!.setData(DRAG_TYPE, el.dataset.path!);
      e.dataTransfer!.effectAllowed = 'move';
    });
    for (const zone of [content, sidebar]) {
      zone.addEventListener('dragover', (e) => {
        if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        clearDropTargets();
        dropTargetFrom(e)?.classList.add('is-drop-target');
      });
      zone.addEventListener('dragleave', clearDropTargets);
      zone.addEventListener('drop', (e) => {
        const src = e.dataTransfer?.getData(DRAG_TYPE);
        clearDropTargets();
        if (!src) return;
        e.preventDefault();
        const target = dropTargetFrom(e)?.dataset.path ?? (zone === content ? cwd : null);
        if (target && target !== src) moveInto(os, src, target);
      });
    }

    const offFs = os.bus.on('fs:changed', (change) => {
      if (!os.fs.isDir(cwd)) {
        history = [HOME];
        historyIndex = 0;
        cwd = HOME;
        render();
      } else if (change.dirs.includes(cwd) || change.dirs.some((d) => PLACES.some((p) => p.path === d))) {
        render();
      }
    });
    win.onClose(offFs);

    render();
    content.focus();
  },
};
