import './styles/tokens.css';
import './styles/base.css';

import { calculatorApp } from './apps/calculator';
import { editorApp } from './apps/editor';
import { explorerApp } from './apps/explorer';
import { paintApp } from './apps/paint';
import { settingsApp } from './apps/settings';
import { terminalApp } from './apps/terminal';
import { OS } from './core/os';
import { seedFilesystem } from './core/seed';
import { MemoryAdapter } from './core/storage';
import { macShell } from './shells/mac';
import { modernShell } from './shells/modern';
import { retroShell } from './shells/retro';

// Swap MemoryAdapter for a persistent adapter to keep files between reloads.
const os = new OS(document.getElementById('os')!, new MemoryAdapter(), seedFilesystem);

for (const app of [explorerApp, editorApp, terminalApp, calculatorApp, paintApp, settingsApp]) {
  os.apps.register(app);
}
for (const shell of [modernShell, retroShell, macShell]) {
  os.themes.register(shell);
}

// `?theme=retro` in the URL picks the starting theme.
const requested = new URLSearchParams(location.search).get('theme');
os.themes.set(os.themes.list().some((s) => s.id === requested) ? requested! : 'modern');

// Handy for poking around from the browser console.
(window as unknown as { webos: OS }).webos = os;
