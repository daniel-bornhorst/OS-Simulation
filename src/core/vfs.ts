import type { FSNode, StorageAdapter } from './storage';

export const HOME = '/home/user';

export class FSError extends Error {}

export interface FSChange {
  /** Path that was created, modified or removed. */
  path: string;
  /** Directories whose listing changed. */
  dirs: string[];
}

const MIME_BY_EXT: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  js: 'text/javascript',
  ts: 'text/typescript',
  html: 'text/html',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  app: 'application/x-app',
};

export function extname(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function mimeFor(name: string): string {
  return MIME_BY_EXT[extname(name)] ?? 'application/octet-stream';
}

export function basename(path: string): string {
  if (path === '/') return '/';
  return path.slice(path.lastIndexOf('/') + 1);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

export function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

/** Resolve `path` against `cwd`, handling `~`, `.`, `..` and repeated slashes. */
export function resolvePath(cwd: string, path: string): string {
  if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
  const parts = path.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return '/' + parts.join('/');
}

function validateName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/')) {
    throw new FSError(`Invalid name: '${name}'`);
  }
}

export class VirtualFS {
  private nodes = new Map<string, FSNode>();
  private rootId: string;
  private nextId = 1;
  private listeners = new Set<(change: FSChange) => void>();

  constructor(private storage: StorageAdapter, seed?: (fs: VirtualFS) => void) {
    const stored = storage.load();
    if (stored && stored.length) {
      for (const node of stored) this.nodes.set(node.id, node);
      this.rootId = stored.find((n) => n.parentId === null)!.id;
      this.nextId = Math.max(...stored.map((n) => Number(n.id.slice(1)) || 0)) + 1;
    } else {
      this.rootId = this.newNode('', 'dir', null).id;
      seed?.(this);
    }
  }

  onChange(listener: (change: FSChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- queries -------------------------------------------------------------

  exists(path: string): boolean {
    return this.lookup(path) !== null;
  }

  stat(path: string): FSNode | null {
    const node = this.lookup(path);
    return node ? { ...node } : null;
  }

  isDir(path: string): boolean {
    return this.lookup(path)?.type === 'dir';
  }

  /** Children of a directory: folders first, then files, each alphabetical. */
  list(path: string): FSNode[] {
    const dir = this.requireDir(path);
    return this.children(dir.id)
      .map((n) => ({ ...n }))
      .sort((a, b) =>
        a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
  }

  read(path: string): string {
    const node = this.require(path);
    if (node.type === 'dir') throw new FSError(`${path}: Is a directory`);
    return node.content ?? '';
  }

  /** Returns `base`, or `base (2)`, `base (3)`… — whichever is free in `dir`. */
  uniqueName(dir: string, base: string): string {
    const ext = extname(base);
    const stem = ext ? base.slice(0, -(ext.length + 1)) : base;
    let name = base;
    for (let i = 2; this.exists(joinPath(dir, name)); i++) {
      name = ext ? `${stem} (${i}).${ext}` : `${stem} (${i})`;
    }
    return name;
  }

  // ---- mutations -----------------------------------------------------------

  /** Write a file, creating it if needed. The parent directory must exist. */
  write(path: string, content: string, mime?: string): void {
    path = resolvePath('/', path);
    const existing = this.lookup(path);
    if (existing) {
      if (existing.type === 'dir') throw new FSError(`${path}: Is a directory`);
      existing.content = content;
      existing.modified = Date.now();
      if (mime) existing.mime = mime;
    } else {
      const parent = this.requireDir(dirname(path));
      const name = basename(path);
      validateName(name);
      const node = this.newNode(name, 'file', parent.id);
      node.content = content;
      node.mime = mime ?? mimeFor(name);
    }
    this.changed(path, [dirname(path)]);
  }

  /** Create an empty file, or bump the modified time of an existing one. */
  touch(path: string): void {
    path = resolvePath('/', path);
    const existing = this.lookup(path);
    if (existing) {
      existing.modified = Date.now();
      this.changed(path, [dirname(path)]);
    } else {
      this.write(path, '');
    }
  }

  mkdir(path: string, opts: { recursive?: boolean } = {}): void {
    path = resolvePath('/', path);
    const existing = this.lookup(path);
    if (existing) {
      if (opts.recursive && existing.type === 'dir') return;
      throw new FSError(`${path}: File exists`);
    }
    const parentPath = dirname(path);
    if (opts.recursive && !this.exists(parentPath)) this.mkdir(parentPath, opts);
    const parent = this.requireDir(parentPath);
    const name = basename(path);
    validateName(name);
    this.newNode(name, 'dir', parent.id);
    this.changed(path, [parentPath]);
  }

  delete(path: string, opts: { recursive?: boolean } = {}): void {
    path = resolvePath('/', path);
    const node = this.require(path);
    if (node.id === this.rootId) throw new FSError(`Cannot delete /`);
    if (node.type === 'dir' && this.children(node.id).length && !opts.recursive) {
      throw new FSError(`${path}: Directory not empty`);
    }
    const remove = (n: FSNode) => {
      for (const child of this.children(n.id)) remove(child);
      this.nodes.delete(n.id);
    };
    remove(node);
    this.changed(path, [dirname(path)]);
  }

  rename(path: string, newName: string): string {
    validateName(newName);
    path = resolvePath('/', path);
    return this.move(path, joinPath(dirname(path), newName));
  }

  /**
   * Move `src` to `dest`. If `dest` is an existing directory, `src` is moved
   * inside it (like `mv`). Returns the new path.
   */
  move(src: string, dest: string): string {
    src = resolvePath('/', src);
    dest = resolvePath('/', dest);
    const node = this.require(src);
    if (node.id === this.rootId) throw new FSError(`Cannot move /`);
    const target = this.resolveDestination(src, dest);
    if (target === src) return src;
    if (target.startsWith(src + '/')) {
      throw new FSError(`Cannot move '${src}' into itself`);
    }
    if (this.exists(target)) throw new FSError(`${target}: File exists`);
    const parent = this.requireDir(dirname(target));
    const name = basename(target);
    validateName(name);
    node.parentId = parent.id;
    node.name = name;
    node.modified = Date.now();
    if (node.type === 'file' && !node.mime?.startsWith('image/')) node.mime = mimeFor(name);
    this.changed(target, [dirname(src), dirname(target)]);
    return target;
  }

  /** Copy `src` to `dest` (same destination rules as `move`). Returns the new path. */
  copy(src: string, dest: string): string {
    src = resolvePath('/', src);
    dest = resolvePath('/', dest);
    const node = this.require(src);
    const target = this.resolveDestination(src, dest);
    if (target === src || target.startsWith(src + '/')) {
      throw new FSError(`Cannot copy '${src}' into itself`);
    }
    if (this.exists(target)) throw new FSError(`${target}: File exists`);
    const parent = this.requireDir(dirname(target));
    const name = basename(target);
    validateName(name);
    const clone = (n: FSNode, parentId: string, newName: string) => {
      const copy = this.newNode(newName, n.type, parentId);
      copy.content = n.content;
      copy.mime = n.mime;
      for (const child of this.children(n.id)) clone(child, copy.id, child.name);
    };
    clone(node, parent.id, name);
    this.changed(target, [dirname(target)]);
    return target;
  }

  /** Current path of a node by id, or null if it no longer exists. */
  pathOf(id: string): string | null {
    if (!this.nodes.has(id)) return null;
    const parts: string[] = [];
    for (let node = this.nodes.get(id); node && node.parentId !== null; node = this.nodes.get(node.parentId)) {
      parts.unshift(node.name);
    }
    return '/' + parts.join('/');
  }

  // ---- internals -----------------------------------------------------------

  private resolveDestination(src: string, dest: string): string {
    return this.isDir(dest) ? joinPath(dest, basename(src)) : dest;
  }

  private lookup(path: string): FSNode | null {
    let node = this.nodes.get(this.rootId)!;
    for (const part of resolvePath('/', path).split('/').filter(Boolean)) {
      const child = node.type === 'dir' ? this.children(node.id).find((c) => c.name === part) : undefined;
      if (!child) return null;
      node = child;
    }
    return node;
  }

  private require(path: string): FSNode {
    const node = this.lookup(path);
    if (!node) throw new FSError(`${path}: No such file or directory`);
    return node;
  }

  private requireDir(path: string): FSNode {
    const node = this.require(path);
    if (node.type !== 'dir') throw new FSError(`${path}: Not a directory`);
    return node;
  }

  private children(id: string): FSNode[] {
    return [...this.nodes.values()].filter((n) => n.parentId === id);
  }

  private newNode(name: string, type: FSNode['type'], parentId: string | null): FSNode {
    const now = Date.now();
    const node: FSNode = { id: `n${this.nextId++}`, name, type, parentId, created: now, modified: now };
    this.nodes.set(node.id, node);
    return node;
  }

  private changed(path: string, dirs: string[]): void {
    this.storage.save([...this.nodes.values()]);
    const change = { path, dirs };
    for (const listener of this.listeners) listener(change);
  }
}
