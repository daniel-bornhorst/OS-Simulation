import { extname } from './vfs';
import type { OS } from './os';
import type { WindowHandle } from './windowManager';

export interface AppArgs {
  /** File or folder the app was opened with. */
  path?: string;
}

export interface AppContext {
  os: OS;
  win: WindowHandle;
  args: AppArgs;
}

export interface AppDefinition {
  id: string;
  name: string;
  /** Key into the icon set in `ui/icons.ts`. */
  icon: string;
  /** File extensions (without the dot) this app opens by default. */
  fileTypes?: string[];
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  /** Only one window at a time; launching again focuses it. */
  singleInstance?: boolean;
  /** Hide from launchers (start menu, dock). */
  hidden?: boolean;
  /** Render the app into `ctx.win.body`. */
  launch(ctx: AppContext): void;
}

export class AppRegistry {
  private apps = new Map<string, AppDefinition>();

  register(app: AppDefinition): void {
    this.apps.set(app.id, app);
  }

  get(id: string): AppDefinition | undefined {
    return this.apps.get(id);
  }

  all(): AppDefinition[] {
    return [...this.apps.values()];
  }

  launchable(): AppDefinition[] {
    return this.all().filter((a) => !a.hidden);
  }

  forFile(name: string): AppDefinition | undefined {
    const ext = extname(name);
    return this.all().find((a) => a.fileTypes?.includes(ext));
  }
}
