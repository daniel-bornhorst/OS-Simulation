import { FSError, HOME, joinPath, resolvePath, type VirtualFS } from '../../core/vfs';

/** Things the terminal can ask the rest of the OS to do. All optional so tests can run headless. */
export interface TerminalHooks {
  open?(path: string): void;
  launch?(appId: string): boolean;
  themes?(): string[];
  setTheme?(id: string): void;
}

export interface RunResult {
  output: string;
  /** The screen should be cleared before printing `output`. */
  clear?: boolean;
}

interface Token {
  text: string;
  /** Unquoted operator such as `>` or `>>`. */
  op?: boolean;
  /** Contained quotes, so glob characters are literal. */
  quoted?: boolean;
}

class CommandError extends Error {}

const USER = 'user';
const HOST = 'webos';

const HELP = `Available commands:
  ls [-la] [path…]      list directory contents
  cd [path]             change directory (default: ~)
  pwd                   print working directory
  tree [path]           show a directory tree
  cat file…             print file contents
  echo text…            print text (use > or >> to write to a file)
  touch file…           create empty files
  mkdir [-p] dir…       create directories
  rm [-r] path…         remove files (and directories with -r)
  rmdir dir…            remove empty directories
  mv src… dest          move or rename
  cp [-r] src… dest     copy
  open path             open a file or folder in its app
  theme [name]          show or change the desktop theme
  clear                 clear the screen
  history               show command history
  whoami, hostname, date, uname`;

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let current = '';
  let inToken = false;
  let quoted = false;
  let quote: '"' | "'" | null = null;

  const push = () => {
    if (inToken) tokens.push({ text: current, quoted: quoted || undefined });
    current = '';
    inToken = false;
    quoted = false;
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < line.length) current += line[++i];
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
      quoted = true;
    } else if (ch === '\\' && i + 1 < line.length) {
      current += line[++i];
      inToken = true;
    } else if (/\s/.test(ch)) {
      push();
    } else if (ch === '>') {
      push();
      const append = line[i + 1] === '>';
      if (append) i++;
      tokens.push({ text: append ? '>>' : '>', op: true });
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (quote) throw new CommandError('unterminated quote');
  push();
  return tokens;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes}` : `${(bytes / 1024).toFixed(1)}K`;
}

export class TerminalSession {
  cwd = HOME;
  readonly history: string[] = [];

  constructor(
    private fs: VirtualFS,
    private hooks: TerminalHooks = {},
  ) {}

  /** Path with the home directory shortened to `~`. */
  displayPath(path = this.cwd): string {
    if (path === HOME) return '~';
    return path.startsWith(HOME + '/') ? '~' + path.slice(HOME.length) : path;
  }

  get prompt(): string {
    return `${USER}@${HOST}:${this.displayPath()}$`;
  }

  run(line: string): RunResult {
    const trimmed = line.trim();
    if (!trimmed) return { output: '' };
    this.history.push(trimmed);

    let tokens: Token[];
    try {
      tokens = tokenize(trimmed);
    } catch (err) {
      return { output: `sh: ${(err as Error).message}` };
    }

    // Split off a trailing redirection: `cmd args > file` or `cmd args >> file`.
    let redirect: { path: string; append: boolean } | null = null;
    const opIndex = tokens.findIndex((t) => t.op);
    if (opIndex !== -1) {
      const target = tokens[opIndex + 1];
      if (!target || target.op) return { output: 'sh: syntax error: expected a file after redirection' };
      redirect = { path: this.resolve(target.text), append: tokens[opIndex].text === '>>' };
      tokens = [...tokens.slice(0, opIndex), ...tokens.slice(opIndex + 2)];
    }

    const [cmdToken, ...argTokens] = tokens;
    if (!cmdToken) return { output: '' };
    const cmd = cmdToken.text;
    const args = argTokens.flatMap((t) => this.expandGlob(t));

    let result: RunResult;
    try {
      result = this.exec(cmd, args);
    } catch (err) {
      if (err instanceof CommandError || err instanceof FSError) return { output: `${cmd}: ${err.message}` };
      throw err;
    }

    if (redirect) {
      try {
        const text = result.output ? result.output + '\n' : '';
        const existing = redirect.append && this.fs.exists(redirect.path) ? this.fs.read(redirect.path) : '';
        this.fs.write(redirect.path, existing + text);
      } catch (err) {
        return { output: `sh: ${(err as Error).message}` };
      }
      return { output: '' };
    }
    return result;
  }

  /** Tab completion of the last word: command names first, then paths. */
  complete(line: string): { line: string; matches: string[] } {
    const start = line.lastIndexOf(' ') + 1;
    const word = line.slice(start);
    const head = line.slice(0, start);

    let candidates: { name: string; dir: boolean }[];
    let prefix: string;
    let partial: string;
    if (!head.trim()) {
      prefix = '';
      partial = word;
      candidates = COMMANDS.map((name) => ({ name, dir: false }));
    } else {
      const slash = word.lastIndexOf('/');
      prefix = word.slice(0, slash + 1);
      partial = word.slice(slash + 1);
      const dir = this.resolve(prefix || '.');
      if (!this.fs.isDir(dir)) return { line, matches: [] };
      candidates = this.fs.list(dir).map((n) => ({ name: n.name, dir: n.type === 'dir' }));
    }

    const matches = candidates.filter((c) => c.name.startsWith(partial));
    if (matches.length === 1) {
      const m = matches[0];
      const escaped = m.name.replace(/ /g, '\\ ');
      return { line: head + prefix + escaped + (m.dir ? '/' : ' '), matches: [] };
    }
    if (matches.length > 1) {
      let common = matches[0].name;
      for (const m of matches) while (!m.name.startsWith(common)) common = common.slice(0, -1);
      return {
        line: head + prefix + common.replace(/ /g, '\\ '),
        matches: matches.map((m) => m.name + (m.dir ? '/' : '')),
      };
    }
    return { line, matches: [] };
  }

  // ---- internals -----------------------------------------------------------

  private resolve(path: string): string {
    return resolvePath(this.cwd, path);
  }

  /** Expand `*` / `?` in the last path segment of an unquoted argument. */
  private expandGlob(token: Token): string[] {
    if (token.quoted || !/[*?]/.test(token.text)) return [token.text];
    const slash = token.text.lastIndexOf('/');
    const dirPart = token.text.slice(0, slash + 1);
    const re = globToRegExp(token.text.slice(slash + 1));
    const dir = this.resolve(dirPart || '.');
    if (!this.fs.isDir(dir)) return [token.text];
    const matches = this.fs
      .list(dir)
      .filter((n) => re.test(n.name) && !n.name.startsWith('.'))
      .map((n) => dirPart + n.name);
    return matches.length ? matches : [token.text];
  }

  private parseFlags(args: string[], allowed: string): { flags: Set<string>; rest: string[] } {
    const flags = new Set<string>();
    const rest: string[] = [];
    for (const arg of args) {
      if (arg.startsWith('-') && arg.length > 1 && !rest.length) {
        for (const f of arg.slice(1)) {
          if (!allowed.includes(f)) throw new CommandError(`invalid option -- '${f}'`);
          flags.add(f);
        }
      } else rest.push(arg);
    }
    return { flags, rest };
  }

  private requireArgs(args: string[], min: number, usage: string): void {
    if (args.length < min) throw new CommandError(`missing operand\nUsage: ${usage}`);
  }

  private exec(cmd: string, args: string[]): RunResult {
    const out = (output: string): RunResult => ({ output });
    switch (cmd) {
      case 'help':
        return out(HELP);

      case 'pwd':
        return out(this.cwd);

      case 'cd': {
        const target = this.resolve(args[0] ?? '~');
        if (!this.fs.exists(target)) throw new CommandError(`${args[0]}: No such file or directory`);
        if (!this.fs.isDir(target)) throw new CommandError(`${args[0]}: Not a directory`);
        this.cwd = target;
        return out('');
      }

      case 'ls': {
        const { flags, rest } = this.parseFlags(args, 'la');
        const paths = rest.length ? rest : ['.'];
        const sections = paths.map((p) => {
          const path = this.resolve(p);
          const node = this.fs.stat(path);
          if (!node) throw new CommandError(`cannot access '${p}': No such file or directory`);
          const entries = node.type === 'dir' ? this.fs.list(path) : [node];
          const visible = entries.filter((n) => flags.has('a') || !n.name.startsWith('.'));
          const body = flags.has('l')
            ? visible
                .map((n) => {
                  const size = n.type === 'dir' ? '-' : formatSize((n.content ?? '').length);
                  const date = new Date(n.modified).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                  return `${n.type === 'dir' ? 'd' : '-'}  ${size.padStart(7)}  ${date}  ${n.name}${n.type === 'dir' ? '/' : ''}`;
                })
                .join('\n')
            : visible.map((n) => n.name + (n.type === 'dir' ? '/' : '')).join('  ');
          return paths.length > 1 && node.type === 'dir' ? `${p}:\n${body}` : body;
        });
        return out(sections.filter(Boolean).join('\n\n'));
      }

      case 'tree': {
        const root = this.resolve(args[0] ?? '.');
        if (!this.fs.isDir(root)) throw new CommandError(`${args[0] ?? '.'}: Not a directory`);
        const lines = [args[0] ?? '.'];
        let dirs = 0;
        let files = 0;
        const walk = (path: string, indent: string) => {
          const entries = this.fs.list(path);
          entries.forEach((n, i) => {
            const last = i === entries.length - 1;
            lines.push(`${indent}${last ? '└── ' : '├── '}${n.name}`);
            if (n.type === 'dir') {
              dirs++;
              walk(joinPath(path, n.name), indent + (last ? '    ' : '│   '));
            } else files++;
          });
        };
        walk(root, '');
        lines.push('', `${dirs} directories, ${files} files`);
        return out(lines.join('\n'));
      }

      case 'cat': {
        this.requireArgs(args, 1, 'cat file…');
        return out(
          args
            .map((p) => {
              const node = this.fs.stat(this.resolve(p));
              if (node?.url !== undefined || /^(image|audio|video)\//.test(node?.mime ?? '')) {
                throw new CommandError(`${p}: binary file (try: open ${p})`);
              }
              return this.fs.read(this.resolve(p));
            })
            .join('\n'),
        );
      }

      case 'echo':
        return out(args.join(' '));

      case 'touch':
        this.requireArgs(args, 1, 'touch file…');
        args.forEach((p) => this.fs.touch(this.resolve(p)));
        return out('');

      case 'mkdir': {
        const { flags, rest } = this.parseFlags(args, 'p');
        this.requireArgs(rest, 1, 'mkdir [-p] dir…');
        rest.forEach((p) => this.fs.mkdir(this.resolve(p), { recursive: flags.has('p') }));
        return out('');
      }

      case 'rm': {
        const { flags, rest } = this.parseFlags(args, 'rfR');
        this.requireArgs(rest, 1, 'rm [-r] path…');
        const recursive = flags.has('r') || flags.has('R');
        const errors: string[] = [];
        for (const p of rest) {
          const path = this.resolve(p);
          if (!this.fs.exists(path)) {
            if (!flags.has('f')) errors.push(`rm: cannot remove '${p}': No such file or directory`);
            continue;
          }
          if (this.fs.isDir(path) && !recursive) {
            errors.push(`rm: cannot remove '${p}': Is a directory`);
            continue;
          }
          if (path === '/' || this.cwd === path || this.cwd.startsWith(path + '/')) {
            errors.push(`rm: refusing to remove '${p}'`);
            continue;
          }
          this.fs.delete(path, { recursive: true });
        }
        return out(errors.join('\n'));
      }

      case 'rmdir':
        this.requireArgs(args, 1, 'rmdir dir…');
        for (const p of args) {
          const path = this.resolve(p);
          if (!this.fs.isDir(path)) throw new CommandError(`failed to remove '${p}': Not a directory`);
          this.fs.delete(path);
        }
        return out('');

      case 'mv':
      case 'cp': {
        const { flags, rest } = this.parseFlags(args, cmd === 'cp' ? 'rR' : '');
        this.requireArgs(rest, 2, `${cmd} src… dest`);
        const dest = this.resolve(rest[rest.length - 1]);
        const sources = rest.slice(0, -1);
        if (sources.length > 1 && !this.fs.isDir(dest)) {
          throw new CommandError(`target '${rest[rest.length - 1]}' is not a directory`);
        }
        for (const s of sources) {
          const src = this.resolve(s);
          if (cmd === 'mv') this.fs.move(src, dest);
          else {
            if (this.fs.isDir(src) && !flags.has('r') && !flags.has('R')) {
              throw new CommandError(`-r not specified; omitting directory '${s}'`);
            }
            this.fs.copy(src, dest);
          }
        }
        // Keep the shell somewhere valid if we just moved the directory we're in.
        if (!this.fs.isDir(this.cwd)) this.cwd = HOME;
        return out('');
      }

      case 'open': {
        this.requireArgs(args, 1, 'open path');
        const path = this.resolve(args[0]);
        if (!this.fs.exists(path)) {
          if (this.hooks.launch?.(args[0])) return out('');
          throw new CommandError(`${args[0]}: No such file or directory`);
        }
        this.hooks.open?.(path);
        return out('');
      }

      case 'theme': {
        const themes = this.hooks.themes?.() ?? [];
        if (!args[0]) return out(`Available themes: ${themes.join(', ')}\nUsage: theme <name>`);
        if (!themes.includes(args[0])) throw new CommandError(`unknown theme '${args[0]}'. Try: ${themes.join(', ')}`);
        this.hooks.setTheme?.(args[0]);
        return out(`Theme changed to ${args[0]}.`);
      }

      case 'clear':
        return { output: '', clear: true };

      case 'history':
        return out(this.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n'));

      case 'whoami':
        return out(USER);
      case 'hostname':
        return out(HOST);
      case 'date':
        return out(new Date().toString());
      case 'uname':
        return out('WebOS');

      default:
        throw new CommandError('command not found');
    }
  }
}

const COMMANDS = [
  'cat', 'cd', 'clear', 'cp', 'date', 'echo', 'help', 'history', 'hostname', 'ls', 'mkdir', 'mv', 'open',
  'pwd', 'rm', 'rmdir', 'theme', 'touch', 'tree', 'uname', 'whoami',
];
