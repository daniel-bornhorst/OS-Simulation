import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../src/core/storage';
import { FSError, HOME, resolvePath, VirtualFS } from '../src/core/vfs';
import { seedFilesystem } from '../src/core/seed';

const freshFS = () => new VirtualFS(new MemoryAdapter(), seedFilesystem);

describe('resolvePath', () => {
  it('handles absolute, relative, dot segments and home', () => {
    expect(resolvePath('/a/b', 'c')).toBe('/a/b/c');
    expect(resolvePath('/a/b', '../c')).toBe('/a/c');
    expect(resolvePath('/a/b', '/x//y/./z/')).toBe('/x/y/z');
    expect(resolvePath('/', '../..')).toBe('/');
    expect(resolvePath('/tmp', '~')).toBe(HOME);
    expect(resolvePath('/tmp', '~/Documents')).toBe(`${HOME}/Documents`);
  });
});

describe('VirtualFS', () => {
  it('is seeded with a home folder structure', () => {
    const fs = freshFS();
    expect(fs.list(HOME).map((n) => n.name)).toEqual(['Desktop', 'Documents', 'Downloads', 'Pictures']);
    expect(fs.read(`${HOME}/Desktop/Welcome.txt`)).toContain('Welcome to WebOS');
  });

  it('creates, reads and overwrites files', () => {
    const fs = freshFS();
    fs.write('/tmp/a.txt', 'one');
    expect(fs.read('/tmp/a.txt')).toBe('one');
    fs.write('/tmp/a.txt', 'two');
    expect(fs.read('/tmp/a.txt')).toBe('two');
    expect(fs.stat('/tmp/a.txt')?.mime).toBe('text/plain');
  });

  it('refuses to write into a missing directory', () => {
    const fs = freshFS();
    expect(() => fs.write('/nope/a.txt', 'x')).toThrow(FSError);
  });

  it('mkdir -p creates intermediate directories', () => {
    const fs = freshFS();
    expect(() => fs.mkdir('/a/b/c')).toThrow(/No such file/);
    fs.mkdir('/a/b/c', { recursive: true });
    expect(fs.isDir('/a/b/c')).toBe(true);
    expect(() => fs.mkdir('/a/b/c')).toThrow(/File exists/);
  });

  it('lists folders first, then files, alphabetically', () => {
    const fs = freshFS();
    fs.mkdir('/tmp/z');
    fs.write('/tmp/b.txt', '');
    fs.write('/tmp/a.txt', '');
    fs.mkdir('/tmp/y');
    expect(fs.list('/tmp').map((n) => n.name)).toEqual(['y', 'z', 'a.txt', 'b.txt']);
  });

  it('deletes files and requires recursive for non-empty folders', () => {
    const fs = freshFS();
    expect(() => fs.delete(`${HOME}/Documents`)).toThrow(/not empty/);
    fs.delete(`${HOME}/Documents`, { recursive: true });
    expect(fs.exists(`${HOME}/Documents`)).toBe(false);
    expect(fs.exists(`${HOME}/Documents/notes.txt`)).toBe(false);
    expect(() => fs.delete('/')).toThrow(FSError);
  });

  it('renames and moves, including into an existing directory', () => {
    const fs = freshFS();
    fs.write('/tmp/a.txt', 'hi');
    expect(fs.rename('/tmp/a.txt', 'b.txt')).toBe('/tmp/b.txt');
    expect(fs.move('/tmp/b.txt', HOME)).toBe(`${HOME}/b.txt`);
    expect(fs.read(`${HOME}/b.txt`)).toBe('hi');
    expect(fs.exists('/tmp/b.txt')).toBe(false);
  });

  it('will not move a folder into itself or over an existing entry', () => {
    const fs = freshFS();
    expect(() => fs.move(`${HOME}/Documents`, `${HOME}/Documents/Projects`)).toThrow(/into itself/);
    fs.write('/tmp/notes.txt', '');
    expect(() => fs.move('/tmp/notes.txt', `${HOME}/Documents/notes.txt`)).toThrow(/File exists/);
  });

  it('copies folders recursively', () => {
    const fs = freshFS();
    fs.copy(`${HOME}/Documents`, '/tmp/backup');
    expect(fs.read('/tmp/backup/Projects/ideas.md')).toContain('# Ideas');
    fs.write('/tmp/backup/notes.txt', 'changed');
    expect(fs.read(`${HOME}/Documents/notes.txt`)).not.toBe('changed');
  });

  it('suggests unique names', () => {
    const fs = freshFS();
    expect(fs.uniqueName('/tmp', 'New Folder')).toBe('New Folder');
    fs.mkdir('/tmp/New Folder');
    expect(fs.uniqueName('/tmp', 'New Folder')).toBe('New Folder (2)');
    fs.write('/tmp/Untitled.txt', '');
    expect(fs.uniqueName('/tmp', 'Untitled.txt')).toBe('Untitled (2).txt');
  });

  it('tracks node paths by id across moves', () => {
    const fs = freshFS();
    fs.write('/tmp/a.txt', '');
    const id = fs.stat('/tmp/a.txt')!.id;
    fs.move('/tmp/a.txt', `${HOME}/z.txt`);
    expect(fs.pathOf(id)).toBe(`${HOME}/z.txt`);
    fs.delete(`${HOME}/z.txt`);
    expect(fs.pathOf(id)).toBeNull();
  });

  it('notifies listeners with the affected directories', () => {
    const fs = freshFS();
    const changes: string[][] = [];
    fs.onChange((c) => changes.push(c.dirs));
    fs.write('/tmp/a.txt', '');
    fs.move('/tmp/a.txt', HOME);
    expect(changes).toEqual([['/tmp'], ['/tmp', HOME]]);
  });

  it('loads from a storage adapter instead of seeding', () => {
    const saved: unknown[] = [];
    const adapter = { load: () => null, save: (nodes: unknown[]) => saved.splice(0, saved.length, ...nodes) };
    const fs = new VirtualFS(adapter, seedFilesystem);
    fs.write('/tmp/persisted.txt', 'yes');
    const restored = new VirtualFS({ load: () => saved as never, save: () => {} });
    expect(restored.read('/tmp/persisted.txt')).toBe('yes');
    restored.write('/tmp/new.txt', 'ids do not collide');
    expect(restored.read('/tmp/persisted.txt')).toBe('yes');
  });
});
