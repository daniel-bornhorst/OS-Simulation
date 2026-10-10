import { createTaskbarShell } from '../taskbarShell';
import './style.css';

export const modernShell = createTaskbarShell({
  id: 'modern',
  label: 'Modern',
  description: 'Clean, rounded windows with a centred taskbar. Follows your system light/dark setting.',
  taskbarHeight: 48,
  startMenu: 'grid',
});
