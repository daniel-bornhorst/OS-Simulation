import type { OS } from '../core/os';
import { basename, dirname, FSError, joinPath } from '../core/vfs';
import { confirmDialog, promptDialog } from './dialog';

/** dataTransfer type used when dragging filesystem entries between views. */
export const DRAG_TYPE = 'application/x-webos-path';

export async function newFolder(os: OS, dir: string): Promise<string | undefined> {
  const name = await promptDialog('New Folder', 'Folder name:', os.fs.uniqueName(dir, 'New Folder'), 'Create');
  if (!name) return;
  const path = joinPath(dir, name);
  return os.tryFS(() => (os.fs.mkdir(path), path));
}

export async function newTextFile(os: OS, dir: string): Promise<string | undefined> {
  const name = await promptDialog('New Text File', 'File name:', os.fs.uniqueName(dir, 'Untitled.txt'), 'Create');
  if (!name) return;
  const path = joinPath(dir, name);
  return os.tryFS(() => {
    if (os.fs.exists(path)) throw new FSError(`"${name}" already exists`);
    os.fs.write(path, '');
    return path;
  });
}

export async function renameItem(os: OS, path: string): Promise<string | undefined> {
  const name = await promptDialog('Rename', 'New name:', basename(path), 'Rename');
  if (!name || name === basename(path)) return;
  return os.tryFS(() => os.fs.rename(path, name));
}

export async function deleteItem(os: OS, path: string): Promise<boolean> {
  const node = os.fs.stat(path);
  if (!node) return false;
  const what = node.type === 'dir' ? `the folder "${node.name}" and everything in it` : `"${node.name}"`;
  if (!(await confirmDialog('Delete', `Permanently delete ${what}?`, 'Delete', true))) return false;
  return os.tryFS(() => (os.fs.delete(path, { recursive: true }), true)) ?? false;
}

/** Move `src` into directory `dir`. No-op if it's already there. */
export function moveInto(os: OS, src: string, dir: string): string | undefined {
  if (dirname(src) === dir || src === dir) return src;
  return os.tryFS(() => os.fs.move(src, joinPath(dir, basename(src))));
}
