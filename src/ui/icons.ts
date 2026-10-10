import type { FSNode } from '../core/storage';
import { extname } from '../core/vfs';
import { fromHTML } from './dom';

/** Full-colour icons for apps and files, drawn on a 48×48 grid. */
const ICONS: Record<string, string> = {
  folder: `
    <path d="M4 12a4 4 0 0 1 4-4h10l4 4h18a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#e8a33d"/>
    <path d="M4 18a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#ffc857"/>`,
  file: `
    <path d="M12 4h17l9 9v29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#f4f6fa" stroke="#9aa5b8" stroke-width="1.5"/>
    <path d="M29 4v9h9" fill="#dfe4ee" stroke="#9aa5b8" stroke-width="1.5" stroke-linejoin="round"/>`,
  text: `
    <path d="M12 4h17l9 9v29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#f4f6fa" stroke="#9aa5b8" stroke-width="1.5"/>
    <path d="M29 4v9h9" fill="#dfe4ee" stroke="#9aa5b8" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M16 20h16M16 25h16M16 30h16M16 35h10" stroke="#6b7a93" stroke-width="2" stroke-linecap="round"/>`,
  image: `
    <rect x="5" y="8" width="38" height="32" rx="4" fill="#4f9cf5"/>
    <circle cx="16" cy="18" r="4" fill="#ffe28a"/>
    <path d="M5 34l11-11 8 8 6-6 13 13v2a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#2f6fd0"/>`,
  app: `
    <rect x="6" y="6" width="36" height="36" rx="9" fill="#7c8597"/>
    <rect x="15" y="15" width="18" height="18" rx="4" fill="#fff" opacity=".9"/>`,
  explorer: `
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#2f80ed"/>
    <path d="M11 17a3 3 0 0 1 3-3h7l3 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z" fill="#ffc857"/>
    <path d="M11 21h26v11a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z" fill="#ffdb7d"/>`,
  editor: `
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#f2f4f7"/>
    <rect x="4.5" y="4.5" width="39" height="39" rx="9.5" fill="none" stroke="#c4cad6"/>
    <path d="M13 15h22M13 21h22M13 27h16M13 33h12" stroke="#5b6b85" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M31 36l9-9 3 3-9 9h-3z" fill="#f5a623"/>`,
  terminal: `
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#1f2430"/>
    <path d="M13 17l7 6-7 6" fill="none" stroke="#5af78e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M23 31h12" stroke="#e6e6e6" stroke-width="3" stroke-linecap="round"/>`,
  calculator: `
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#3a3f4b"/>
    <rect x="10" y="10" width="28" height="9" rx="2" fill="#a8e6a1"/>
    <g fill="#e9ebf0"><rect x="10" y="23" width="7" height="6" rx="1.5"/><rect x="20.5" y="23" width="7" height="6" rx="1.5"/>
    <rect x="10" y="32" width="7" height="6" rx="1.5"/><rect x="20.5" y="32" width="7" height="6" rx="1.5"/></g>
    <rect x="31" y="23" width="7" height="15" rx="1.5" fill="#ff9f0a"/>`,
  paint: `
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#fff4e0"/>
    <path d="M24 9c-9 0-16 6-16 14 0 7 5 9 9 9 3 0 3 3 3 4 0 2 2 3 4 3 9 0 16-7 16-15 0-9-7-15-16-15z" fill="#f2f2f2" stroke="#c9b28a" stroke-width="1.5"/>
    <circle cx="16" cy="21" r="3" fill="#e74c3c"/><circle cx="23" cy="15" r="3" fill="#f1c40f"/>
    <circle cx="31" cy="17" r="3" fill="#2ecc71"/><circle cx="33" cy="25" r="3" fill="#3498db"/>`,
  settings: `
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#8e8e93"/>
    <path d="M24 12l2.6.4.9 3 2.4 1.3 2.9-1.2 1.9 1.9-1.2 2.9 1.3 2.4 3 .9.4 2.6-.4 2.6-3 .9-1.3 2.4 1.2 2.9-1.9 1.9-2.9-1.2-2.4 1.3-.9 3-2.6.4-2.6-.4-.9-3-2.4-1.3-2.9 1.2-1.9-1.9 1.2-2.9-1.3-2.4-3-.9L12 24l.4-2.6 3-.9 1.3-2.4-1.2-2.9 1.9-1.9 2.9 1.2 2.4-1.3.9-3z" fill="#e5e5ea"/>
    <circle cx="24" cy="24" r="5" fill="#8e8e93"/>`,
};

/** Single-colour UI glyphs drawn on a 24×24 grid using `currentColor`. */
const GLYPHS: Record<string, string> = {
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  minimize: `<path d="M6 12h12"/>`,
  maximize: `<rect x="6" y="6" width="12" height="12" rx="1"/>`,
  back: `<path d="M15 5l-7 7 7 7"/>`,
  forward: `<path d="M9 5l7 7-7 7"/>`,
  up: `<path d="M12 19V6M6 11l6-6 6 6"/>`,
  grid: `<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>`,
  list: `<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>`,
  search: `<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>`,
  power: `<path d="M12 3v9M6.3 7a8 8 0 1 0 11.4 0"/>`,
  home: `<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>`,
  desktop: `<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>`,
  documents: `<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>`,
  pictures: `<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 17l5-5 4 4 3-3 6 6"/>`,
  downloads: `<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>`,
  drive: `<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5 13l2-8h10l2 8M17 16.5h.01"/>`,
  brush: `<path d="M18 3l3 3-9 9-3-3zM9 12c-3 0-4 2-4 4s-1 3-2 3c2 2 8 2 9-3"/>`,
  eraser: `<path d="M8 20h12M4 15l9-9 6 6-8 8H8z"/>`,
  line: `<path d="M5 19L19 5"/>`,
  rect: `<rect x="4" y="6" width="16" height="12" rx="1"/>`,
  ellipse: `<ellipse cx="12" cy="12" rx="8" ry="6"/>`,
  fill: `<path d="M5 11l7-7 7 7-7 7zM19 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z"/>`,
  save: `<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>`,
  new: `<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>`,
  open: `<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
  trash: `<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`,
  logo: `<path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="currentColor" stroke="none"/>`,
};

function svg(body: string, viewBox: number, size: number, extra = ''): Element {
  return fromHTML(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBox} ${viewBox}" ${extra}>${body}</svg>`,
  );
}

export function icon(name: string, size = 32): Element {
  return svg(ICONS[name] ?? ICONS.app, 48, size, 'class="icon"');
}

export function glyph(name: string, size = 16): Element {
  return svg(
    GLYPHS[name] ?? '',
    24,
    size,
    'class="glyph" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
  );
}

/** Icon key for a filesystem entry. `appIcon` resolves `.app` shortcuts. */
export function iconNameFor(node: FSNode, appIcon: (appId: string) => string | undefined): string {
  if (node.type === 'dir') return 'folder';
  const ext = extname(node.name);
  if (ext === 'app') return appIcon((node.content ?? '').trim()) ?? 'app';
  if (node.mime?.startsWith('image/')) return 'image';
  if (['txt', 'md', 'json', 'js', 'ts', 'html', 'css', ''].includes(ext) || node.mime?.startsWith('text/')) return 'text';
  return 'file';
}

/** Display name: `.app` shortcuts hide their extension. */
export function displayName(node: FSNode): string {
  return extname(node.name) === 'app' ? node.name.slice(0, -4) : node.name;
}
