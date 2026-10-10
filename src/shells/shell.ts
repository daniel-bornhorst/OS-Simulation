import type { OS } from '../core/os';
import type { Insets, WindowChrome } from '../core/windowManager';

/**
 * A shell is the swappable "look" of the OS: desktop, launcher, taskbar/dock and
 * window chrome. Apps never depend on which shell is active.
 */
export interface Shell {
  id: string;
  label: string;
  description: string;
  /** Screen edges the shell occupies; windows maximize and drag within the rest. */
  insets: Insets;
  chrome: WindowChrome;
  mount(root: HTMLElement, os: OS): void;
  unmount(): void;
}
