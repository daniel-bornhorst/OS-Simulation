import { dirname, type VirtualFS } from './vfs';

/*
 * Files in the repo's `content/` folder are added to the filesystem at boot, at the
 * same path: `content/home/user/Pictures/beach.jpg` → `/home/user/Pictures/beach.jpg`.
 *
 * Text files are inlined so they can be edited. Everything else (photos, audio,
 * video…) is bundled by Vite as a separate asset and referenced by URL.
 *
 * Files directly in content/ (like its README) are docs, not OS files: the patterns
 * require at least one subfolder, so they're skipped. import.meta.glob needs literal patterns, so the
 * text extension list appears twice.
 */

const textFiles = import.meta.glob<string>('/content/*/**/*.{txt,md,json,csv,log,html,css,js,ts,app}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const binaryFiles = import.meta.glob<string>(
  ['/content/*/**/*', '!/content/**/*.{txt,md,json,csv,log,html,css,js,ts,app}'],
  { query: '?url', import: 'default', eager: true },
);

const toFsPath = (key: string) => key.slice('/content'.length);

/** Copy everything under `content/` into `fs`. Returns the number of files added. */
export function loadContent(fs: VirtualFS): number {
  let count = 0;
  const add = (key: string, write: (path: string) => void) => {
    const path = toFsPath(key);
    fs.mkdir(dirname(path), { recursive: true });
    write(path);
    count++;
  };
  for (const [key, text] of Object.entries(textFiles)) add(key, (path) => fs.write(path, text));
  for (const [key, url] of Object.entries(binaryFiles)) add(key, (path) => fs.writeUrl(path, url));
  return count;
}
