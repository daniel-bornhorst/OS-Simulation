export type NodeType = 'dir' | 'file';

export interface FSNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  mime?: string;
  content?: string;
  created: number;
  modified: number;
}

/**
 * Where the filesystem lives between sessions. `load` returns null when there is
 * nothing stored yet, in which case the filesystem is seeded from scratch.
 */
export interface StorageAdapter {
  load(): FSNode[] | null;
  save(nodes: FSNode[]): void;
}

/** Keeps nothing: every page load starts from the seed filesystem. */
export class MemoryAdapter implements StorageAdapter {
  load(): FSNode[] | null {
    return null;
  }
  save(): void {}
}
