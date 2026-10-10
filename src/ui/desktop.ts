import type { OS } from '../core/os';
import { HOME, basename, dirname, joinPath } from '../core/vfs';
import { onContextMenu, type MenuItem } from './contextMenu';
import { h } from './dom';
import { deleteItem, DRAG_TYPE, moveInto, newFolder, newTextFile, renameItem } from './fileActions';
import { displayName, icon, iconNameFor } from './icons';

export const DESKTOP_DIR = `${HOME}/Desktop`;

const CELL_W = 92;
const CELL_H = 100;
const PADDING = 12;

type Cell = { col: number; row: number };

/** Icon positions survive shell switches (but not reloads). Keyed by file name. */
const pinned = new Map<string, Cell>();

export interface DesktopOptions {
  /** Which side icons start filling from. */
  align?: 'left' | 'right';
}

/**
 * Render the contents of ~/Desktop as icons on `surface`, kept in sync with the
 * filesystem. Returns a cleanup function.
 */
export function mountDesktop(surface: HTMLElement, os: OS, opts: DesktopOptions = {}): () => void {
  const align = opts.align ?? 'left';
  const grid = h('div', { class: 'desktop-icons', tabindex: 0 });
  surface.append(grid);
  let selected: string | null = null;

  const rows = () => Math.max(1, Math.floor((grid.clientHeight - PADDING) / CELL_H));
  const cols = () => Math.max(1, Math.floor((grid.clientWidth - PADDING) / CELL_W));

  const place = (el: HTMLElement, cell: Cell) => {
    el.style.top = `${PADDING + cell.row * CELL_H}px`;
    el.style[align] = `${PADDING + cell.col * CELL_W}px`;
  };

  const cellAt = (clientX: number, clientY: number): Cell => {
    const rect = grid.getBoundingClientRect();
    const x = align === 'left' ? clientX - rect.left : rect.right - clientX;
    return {
      col: Math.max(0, Math.min(cols() - 1, Math.floor((x - PADDING) / CELL_W))),
      row: Math.max(0, Math.min(rows() - 1, Math.floor((clientY - rect.top - PADDING) / CELL_H))),
    };
  };

  const select = (path: string | null) => {
    selected = path;
    for (const el of grid.querySelectorAll<HTMLElement>('.desktop-icon')) {
      el.classList.toggle('is-selected', el.dataset.path === path);
    }
  };

  const render = () => {
    const items = os.fs.isDir(DESKTOP_DIR) ? os.fs.list(DESKTOP_DIR) : [];
    const names = new Set(items.map((n) => n.name));
    for (const name of pinned.keys()) if (!names.has(name)) pinned.delete(name);

    const taken = new Set([...pinned.values()].map((c) => `${c.col},${c.row}`));
    const nextFree = (() => {
      let i = 0;
      return (): Cell => {
        for (;; i++) {
          const cell = { col: Math.floor(i / rows()), row: i % rows() };
          if (!taken.has(`${cell.col},${cell.row}`)) {
            i++;
            return cell;
          }
        }
      };
    })();

    grid.replaceChildren(
      ...items.map((node) => {
        const path = joinPath(DESKTOP_DIR, node.name);
        const el = h(
          'div',
          {
            class: `desktop-icon${path === selected ? ' is-selected' : ''}`,
            draggable: 'true',
            dataset: { path, type: node.type },
            title: node.name,
          },
          h('div', { class: 'desktop-icon-image' }, icon(iconNameFor(node, (id) => os.apps.get(id)?.icon), 44)),
          h('div', { class: 'desktop-icon-label' }, displayName(node)),
        );
        // Pin auto-placed icons so new items fill free slots instead of reshuffling everything.
        let cell = pinned.get(node.name);
        if (!cell) pinned.set(node.name, (cell = nextFree()));
        place(el, cell);
        return el;
      }),
    );
  };

  // ---- interaction ---------------------------------------------------------

  const iconFrom = (e: Event) => (e.target as Element).closest<HTMLElement>('.desktop-icon');

  grid.addEventListener('pointerdown', (e) => {
    const el = iconFrom(e);
    select(el?.dataset.path ?? null);
  });
  grid.addEventListener('dblclick', (e) => {
    const el = iconFrom(e);
    if (el) os.openPath(el.dataset.path!);
  });
  grid.addEventListener('keydown', (e) => {
    if (!selected) return;
    if (e.key === 'Enter') os.openPath(selected);
    else if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) deleteItem(os, selected);
    else if (e.key === 'F2') renameItem(os, selected);
  });

  onContextMenu(grid, (e): MenuItem[] => {
    const el = iconFrom(e);
    if (el) {
      const path = el.dataset.path!;
      select(path);
      return [
        { label: 'Open', glyph: 'open', action: () => os.openPath(path) },
        ...(el.dataset.type === 'file' && !path.endsWith('.app')
          ? [{ label: 'Open in Text Editor', action: () => os.launch('editor', { path }) }]
          : []),
        { separator: true },
        { label: 'Rename', shortcut: 'F2', action: () => renameItem(os, path) },
        { label: 'Delete', glyph: 'trash', shortcut: 'Del', action: () => deleteItem(os, path) },
      ];
    }
    select(null);
    const cell = cellAt(e.clientX, e.clientY);
    const pinNew = (path?: string) => path && (pinned.set(basename(path), cell), render());
    return [
      { label: 'New Folder', glyph: 'open', action: () => newFolder(os, DESKTOP_DIR).then(pinNew) },
      { label: 'New Text File', glyph: 'new', action: () => newTextFile(os, DESKTOP_DIR).then(pinNew) },
      { separator: true },
      { label: 'Open Terminal', action: () => os.launch('terminal', { path: DESKTOP_DIR }) },
      { label: 'Open in Files', action: () => os.launch('explorer', { path: DESKTOP_DIR }) },
      { label: 'Clean Up Icons', action: () => (pinned.clear(), render()) },
      { separator: true },
      { label: 'Personalize…', glyph: 'pictures', action: () => os.launch('settings') },
    ];
  });

  // Dragging: reposition desktop icons, drop onto folders, or accept files from Files.
  grid.addEventListener('dragstart', (e) => {
    const el = iconFrom(e);
    if (!el) return;
    e.dataTransfer!.setData(DRAG_TYPE, el.dataset.path!);
    e.dataTransfer!.effectAllowed = 'move';
  });
  grid.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    const folder = iconFrom(e);
    grid.querySelectorAll('.is-drop-target').forEach((x) => x.classList.remove('is-drop-target'));
    if (folder?.dataset.type === 'dir') folder.classList.add('is-drop-target');
  });
  grid.addEventListener('dragleave', () => {
    grid.querySelectorAll('.is-drop-target').forEach((x) => x.classList.remove('is-drop-target'));
  });
  grid.addEventListener('drop', (e) => {
    const src = e.dataTransfer?.getData(DRAG_TYPE);
    if (!src) return;
    e.preventDefault();
    const target = iconFrom(e);
    if (target?.dataset.type === 'dir' && target.dataset.path !== src) {
      moveInto(os, src, target.dataset.path!);
      return;
    }
    const cell = cellAt(e.clientX, e.clientY);
    if (dirname(src) === DESKTOP_DIR) {
      pinned.set(basename(src), cell);
      render();
    } else if (moveInto(os, src, DESKTOP_DIR)) {
      pinned.set(basename(src), cell);
      render();
    }
  });

  const offFs = os.bus.on('fs:changed', (change) => {
    if (change.dirs.includes(DESKTOP_DIR) || `${DESKTOP_DIR}/`.startsWith(`${change.path}/`)) render();
  });
  const onResize = () => render();
  window.addEventListener('resize', onResize);
  // Wait a frame so the grid has its final size before laying out.
  requestAnimationFrame(render);

  return () => {
    offFs();
    window.removeEventListener('resize', onResize);
    grid.remove();
  };
}
