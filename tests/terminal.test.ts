import { describe, expect, it } from 'vitest';
import { TerminalSession, tokenize } from '../src/apps/terminal/session';
import { seedFilesystem } from '../src/core/seed';
import { MemoryAdapter } from '../src/core/storage';
import { HOME, VirtualFS } from '../src/core/vfs';

const setup = () => {
  const fs = new VirtualFS(new MemoryAdapter(), seedFilesystem);
  const opened: string[] = [];
  let theme = 'modern';
  const term = new TerminalSession(fs, {
    open: (p) => opened.push(p),
    themes: () => ['modern', 'retro', 'mac'],
    setTheme: (t) => (theme = t),
  });
  return { fs, term, opened, theme: () => theme, run: (line: string) => term.run(line).output };
};

describe('tokenize', () => {
  it('splits on whitespace and respects quotes and escapes', () => {
    expect(tokenize(`echo "hello world" 'a b' c\\ d`).map((t) => t.text)).toEqual(['echo', 'hello world', 'a b', 'c d']);
  });
  it('recognises redirection operators even without spaces', () => {
    expect(tokenize('echo hi>>out.txt').map((t) => [t.text, !!t.op])).toEqual([
      ['echo', false],
      ['hi', false],
      ['>>', true],
      ['out.txt', false],
    ]);
  });
});

describe('TerminalSession', () => {
  it('starts in home with a ~ prompt', () => {
    const { term, run } = setup();
    expect(term.prompt).toBe('user@webos:~$');
    expect(run('pwd')).toBe(HOME);
  });

  it('navigates with cd and reports errors', () => {
    const { term, run } = setup();
    run('cd Documents/Projects');
    expect(term.prompt).toBe('user@webos:~/Documents/Projects$');
    run('cd ..');
    expect(term.cwd).toBe(`${HOME}/Documents`);
    expect(run('cd nowhere')).toBe('cd: nowhere: No such file or directory');
    expect(run('cd notes.txt')).toBe('cd: notes.txt: Not a directory');
    run('cd');
    expect(term.cwd).toBe(HOME);
  });

  it('lists directories', () => {
    const { run } = setup();
    expect(run('ls')).toBe('Desktop/  Documents/  Downloads/  Music/  Pictures/  Videos/');
    expect(run('ls -l Documents')).toMatch(/^d .*Projects\/\n- .*notes\.txt\n- .*todo\.txt$/);
  });

  it('creates, writes, appends and reads files', () => {
    const { run, fs } = setup();
    run('mkdir -p a/b');
    run('echo hello > a/b/f.txt');
    run('echo world >> a/b/f.txt');
    expect(run('cat a/b/f.txt')).toBe('hello\nworld\n');
    run('touch empty.txt');
    expect(fs.read(`${HOME}/empty.txt`)).toBe('');
  });

  it('moves, copies and removes', () => {
    const { run, fs } = setup();
    run('cp Documents/notes.txt notes-copy.txt');
    expect(fs.exists(`${HOME}/notes-copy.txt`)).toBe(true);
    run('mv notes-copy.txt Downloads');
    expect(fs.exists(`${HOME}/Downloads/notes-copy.txt`)).toBe(true);
    expect(run('rm Documents')).toBe("rm: cannot remove 'Documents': Is a directory");
    expect(run('cp Documents docs2')).toMatch(/-r not specified/);
    run('cp -r Documents docs2');
    expect(fs.exists(`${HOME}/docs2/Projects/ideas.md`)).toBe(true);
    run('rm -r docs2');
    expect(fs.exists(`${HOME}/docs2`)).toBe(false);
  });

  it('expands globs', () => {
    const { run, fs } = setup();
    run('rm Documents/*.txt');
    expect(fs.list(`${HOME}/Documents`).map((n) => n.name)).toEqual(['Projects']);
    expect(run('echo "*.txt"')).toBe('*.txt');
  });

  it('refuses to delete the current directory', () => {
    const { run, fs } = setup();
    run('cd Documents');
    expect(run('rm -r ../Documents')).toMatch(/refusing/);
    expect(fs.exists(`${HOME}/Documents`)).toBe(true);
  });

  it('opens files and switches themes via hooks', () => {
    const { run, opened, theme } = setup();
    run('open Desktop/Welcome.txt');
    expect(opened).toEqual([`${HOME}/Desktop/Welcome.txt`]);
    expect(run('theme retro')).toBe('Theme changed to retro.');
    expect(theme()).toBe('retro');
    expect(run('theme bogus')).toMatch(/unknown theme/);
  });

  it('reports unknown commands and supports clear', () => {
    const { term, run } = setup();
    expect(run('frobnicate')).toBe('frobnicate: command not found');
    expect(term.run('clear').clear).toBe(true);
  });

  it('tab-completes commands and paths', () => {
    const { term } = setup();
    expect(term.complete('ec').line).toBe('echo ');
    expect(term.complete('cd Doc').line).toBe('cd Documents/');
    const ambiguous = term.complete('cd D');
    expect(ambiguous.line).toBe('cd D');
    expect(ambiguous.matches).toEqual(['Desktop/', 'Documents/', 'Downloads/']);
    expect(term.complete('cat Documents/no').line).toBe('cat Documents/notes.txt ');
  });
});
