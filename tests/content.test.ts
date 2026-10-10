import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/core/content';
import { seedFilesystem } from '../src/core/seed';
import { MemoryAdapter } from '../src/core/storage';
import { HOME, VirtualFS } from '../src/core/vfs';

describe('loadContent', () => {
  const fs = new VirtualFS(new MemoryAdapter(), seedFilesystem);
  const count = loadContent(fs);

  it('adds files from content/ at the same paths', () => {
    expect(count).toBeGreaterThan(0);
    expect(fs.exists(`${HOME}/Music/Sample Tone.mp3`)).toBe(true);
    expect(fs.exists(`${HOME}/Videos/Test Pattern.mp4`)).toBe(true);
    expect(fs.exists(`${HOME}/Pictures/Mandelbrot.jpg`)).toBe(true);
  });

  it('inlines text files and references media by URL', () => {
    expect(fs.read(`${HOME}/Documents/From the content folder.txt`)).toContain('content/ folder');
    expect(fs.stat(`${HOME}/Music/Sample Tone.mp3`)?.mime).toBe('audio/mpeg');
    expect(fs.source(`${HOME}/Music/Sample Tone.mp3`)).toMatch(/Sample%20Tone\.mp3|Sample Tone\.mp3/);
  });

  it('skips files directly in content/', () => {
    expect(fs.exists('/README.md')).toBe(false);
  });
});
