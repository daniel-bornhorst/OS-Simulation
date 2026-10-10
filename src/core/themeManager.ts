import type { Shell } from '../shells/shell';
import type { OS } from './os';

export class ThemeManager {
  private shells = new Map<string, Shell>();
  private current: Shell | null = null;

  constructor(
    private os: OS,
    private root: HTMLElement,
  ) {}

  register(shell: Shell): void {
    this.shells.set(shell.id, shell);
  }

  list(): Shell[] {
    return [...this.shells.values()];
  }

  get active(): string | null {
    return this.current?.id ?? null;
  }

  /** Swap shells. Open windows stay open and are re-chromed for the new look. */
  set(id: string): void {
    const shell = this.shells.get(id);
    if (!shell) throw new Error(`Unknown theme: ${id}`);
    if (shell === this.current) return;
    this.current?.unmount();
    this.root.replaceChildren();
    document.documentElement.dataset.theme = shell.id;
    this.current = shell;
    shell.mount(this.root, this.os);
    this.os.wm.setInsets(shell.insets);
    this.os.wm.setChrome(shell.chrome);
    this.os.bus.emit('theme:changed', { theme: shell.id });
  }
}
