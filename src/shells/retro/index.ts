import { createTaskbarShell } from '../taskbarShell';
import './style.css';

export const retroShell = createTaskbarShell({
  id: 'retro',
  label: 'Retro',
  description: 'Beveled grey windows and a classic Start button, straight out of the 90s.',
  taskbarHeight: 30,
  startMenu: 'list',
  startLabel: 'Start',
  brand: 'WebOS 95',
});
