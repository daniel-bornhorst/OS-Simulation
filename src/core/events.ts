import type { FSChange } from './vfs';

export type OSEvents = {
  'fs:changed': FSChange;
  /** Any window opened, closed, focused, moved between states or retitled. */
  'windows:changed': void;
  'theme:changed': { theme: string };
  'settings:changed': void;
};
