import { HOME, type VirtualFS } from './vfs';

const SUNSET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#2b1055"/><stop offset="0.6" stop-color="#d53369"/><stop offset="1" stop-color="#ffb347"/>
</linearGradient></defs>
<rect width="480" height="320" fill="url(#sky)"/>
<circle cx="240" cy="230" r="70" fill="#ffd56b"/>
<path d="M0 240 L90 170 L170 230 L260 150 L360 235 L420 190 L480 225 L480 320 L0 320 Z" fill="#1d1135"/>
</svg>`;

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The filesystem every fresh session starts from. */
export function seedFilesystem(fs: VirtualFS): void {
  for (const dir of ['/bin', '/etc', '/tmp', `${HOME}/Desktop`, `${HOME}/Documents/Projects`, `${HOME}/Pictures`, `${HOME}/Downloads`]) {
    fs.mkdir(dir, { recursive: true });
  }

  fs.write('/etc/motd', 'Welcome to WebOS. Type `help` to see available commands.');
  fs.write('/etc/hostname', 'webos');

  // Desktop shortcuts: a `.app` file's content is the id of the app it launches.
  fs.write(`${HOME}/Desktop/Files.app`, 'explorer');
  fs.write(`${HOME}/Desktop/Terminal.app`, 'terminal');
  fs.write(
    `${HOME}/Desktop/Welcome.txt`,
    [
      'Welcome to WebOS!',
      '',
      'This is a desktop operating system simulated entirely in your browser.',
      '',
      'Things to try:',
      '  • Double-click icons on the desktop to open them.',
      '  • Right-click the desktop to create files and folders.',
      '  • Open Files to browse the folder structure; drag items onto folders to move them.',
      '  • Open the Terminal and type `help`.',
      '  • Change the look in Settings: Modern, Retro or macOS.',
      '',
      'Note: everything resets when you reload the page.',
    ].join('\n'),
  );

  fs.write(`${HOME}/Documents/notes.txt`, 'Meeting notes\n=============\n\n- Ship the window manager\n- Add more themes\n');
  fs.write(`${HOME}/Documents/todo.txt`, '[x] Build a virtual filesystem\n[x] Draggable windows\n[ ] Take over the world\n');
  fs.write(`${HOME}/Documents/Projects/ideas.md`, '# Ideas\n\n- An iOS-style home screen\n- Saving files between sessions\n- A music player\n');

  fs.write(`${HOME}/Pictures/sunset.svg`, svgDataUrl(SUNSET_SVG), 'image/svg+xml');
}
