import type { AppDefinition } from '../../core/appRegistry';
import { basename, dirname, extname, HOME, joinPath, resolvePath } from '../../core/vfs';
import { alertDialog, confirmDialog, promptDialog } from '../../ui/dialog';
import { h } from '../../ui/dom';
import { glyph } from '../../ui/icons';
import { floodFill } from './floodFill';
import './style.css';

type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'fill';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'brush', label: 'Brush (B)' },
  { id: 'eraser', label: 'Eraser (E)' },
  { id: 'line', label: 'Line (L)' },
  { id: 'rect', label: 'Rectangle (R)' },
  { id: 'ellipse', label: 'Ellipse (O)' },
  { id: 'fill', label: 'Fill (F)' },
];
const TOOL_KEYS: Record<string, Tool> = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', o: 'ellipse', f: 'fill' };

const SWATCHES = ['#000000', '#7f7f7f', '#ffffff', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#ff6fb5', '#8b5a2b'];
const BACKGROUND = '#ffffff';
const DEFAULT_SIZE = { width: 800, height: 500 };
const MAX_UNDO = 30;

export const paintApp: AppDefinition = {
  id: 'paint',
  name: 'Paint',
  icon: 'paint',
  fileTypes: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp'],
  defaultSize: { width: 820, height: 580 },
  minSize: { width: 480, height: 320 },

  launch({ os, win, args }) {
    let tool: Tool = 'brush';
    let color = '#000000';
    let size = 4;
    let path: string | null = null;
    let dirty = false;
    const undoStack: ImageData[] = [];

    const canvas = h('canvas', { class: 'paint-canvas', width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const colorInput = h('input', { type: 'color', class: 'paint-color', value: color, title: 'Colour' });
    const sizeInput = h('input', { type: 'range', min: 1, max: 48, value: size, class: 'paint-size', title: 'Brush size' });
    const sizeLabel = h('span', { class: 'paint-size-label' }, `${size}px`);
    const dims = h('span');
    const cursorPos = h('span', { class: 'paint-cursor' });

    const toolButtons = TOOLS.map((t) =>
      h('button', { class: 'btn btn-icon paint-tool', title: t.label, dataset: { tool: t.id }, onclick: () => setTool(t.id) }, glyph(t.id, 18)),
    );
    const swatches = SWATCHES.map((c) =>
      h('button', { class: 'paint-swatch', style: { background: c }, title: c, dataset: { color: c }, onclick: () => setColor(c) }),
    );

    const button = (label: string, glyphName: string | null, action: () => void, title = label) =>
      h('button', { class: 'btn btn-tool', title, onclick: action }, glyphName ? glyph(glyphName, 16) : null, h('span', null, label));

    const root = h(
      'div',
      { class: 'paint', tabindex: 0 },
      h(
        'div',
        { class: 'toolbar' },
        button('New', 'new', newImage),
        button('Save', 'save', () => save(), 'Save (Ctrl+S)'),
        button('Save As…', null, () => saveAs()),
        h('div', { class: 'toolbar-separator' }),
        ...toolButtons,
        h('div', { class: 'toolbar-separator' }),
        sizeInput,
        sizeLabel,
      ),
      h('div', { class: 'toolbar paint-palette' }, colorInput, ...swatches, h('button', { class: 'btn btn-tool', onclick: clearCanvas }, 'Clear')),
      h('div', { class: 'paint-stage' }, canvas),
      h('div', { class: 'statusbar' }, dims, cursorPos),
    );
    win.body.append(root);

    // ---- state helpers ----

    function setTool(t: Tool) {
      tool = t;
      toolButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.tool === t));
      canvas.dataset.tool = t;
    }

    function setColor(c: string) {
      color = c;
      colorInput.value = c;
      swatches.forEach((s) => s.classList.toggle('is-active', s.dataset.color === c));
    }

    function updateTitle() {
      win.setTitle(`${dirty ? '• ' : ''}${path ? basename(path) : 'Untitled'} — Paint`);
      dims.textContent = `${canvas.width} × ${canvas.height}px${path ? `  ·  ${path}` : ''}`;
    }

    function markDirty() {
      dirty = true;
      updateTitle();
    }

    function resetCanvas(width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, width, height);
    }

    function pushUndo() {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    }

    function undo() {
      const prev = undoStack.pop();
      if (!prev) return;
      if (prev.width !== canvas.width || prev.height !== canvas.height) resetCanvas(prev.width, prev.height);
      ctx.putImageData(prev, 0, 0);
      markDirty();
    }

    // ---- files ----

    const confirmDiscard = async () =>
      !dirty || confirmDialog('Unsaved changes', `Discard changes to ${path ? basename(path) : 'Untitled'}?`, 'Discard', true);

    async function newImage() {
      if (!(await confirmDiscard())) return;
      resetCanvas(DEFAULT_SIZE.width, DEFAULT_SIZE.height);
      undoStack.length = 0;
      path = null;
      dirty = false;
      updateTitle();
    }

    function clearCanvas() {
      pushUndo();
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      markDirty();
    }

    function load(p: string) {
      const data = os.tryFS(() => os.fs.source(p));
      if (data === undefined) return;
      if (!os.fs.stat(p)?.mime?.startsWith('image/') || !data) {
        alertDialog('Paint', `${basename(p)} is not an image Paint can open.`);
        return;
      }
      const img = new Image();
      img.onload = () => {
        resetCanvas(img.naturalWidth || DEFAULT_SIZE.width, img.naturalHeight || DEFAULT_SIZE.height);
        ctx.drawImage(img, 0, 0);
        undoStack.length = 0;
        path = p;
        dirty = false;
        updateTitle();
      };
      img.onerror = () => alertDialog('Paint', `Couldn't read ${basename(p)}.`);
      img.src = data;
    }

    async function saveAs(): Promise<boolean> {
      const dir = path ? dirname(path) : `${HOME}/Pictures`;
      const stem = path ? basename(path).replace(/\.[^.]+$/, '') : 'Untitled';
      const input = await promptDialog('Save As', 'Save PNG to path:', joinPath(dir, os.fs.uniqueName(dir, `${stem}.png`)), 'Save');
      if (!input) return false;
      let target = resolvePath(dir, input);
      if (extname(target) !== 'png') target += '.png';
      if (os.fs.exists(target) && !(await confirmDialog('Replace file', `${basename(target)} already exists. Replace it?`, 'Replace', true))) {
        return false;
      }
      path = target;
      return save();
    }

    async function save(): Promise<boolean> {
      // Everything is saved as PNG; other formats get a new name via Save As.
      if (!path || extname(path) !== 'png') return saveAs();
      const ok = os.tryFS(() => (os.fs.write(path!, canvas.toDataURL('image/png'), 'image/png'), true));
      if (ok) dirty = false;
      updateTitle();
      return !!ok;
    }

    // ---- drawing ----

    const toCanvas = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) * canvas.width) / rect.width,
        y: ((e.clientY - rect.top) * canvas.height) / rect.height,
      };
    };

    const stroke = () => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size;
      ctx.strokeStyle = tool === 'eraser' ? BACKGROUND : color;
    };

    const drawShape = (from: { x: number; y: number }, to: { x: number; y: number }, square: boolean) => {
      stroke();
      ctx.beginPath();
      let w = to.x - from.x;
      let hgt = to.y - from.y;
      if (square) {
        const s = Math.max(Math.abs(w), Math.abs(hgt));
        w = Math.sign(w || 1) * s;
        hgt = Math.sign(hgt || 1) * s;
      }
      if (tool === 'line') {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      } else if (tool === 'rect') {
        ctx.rect(from.x, from.y, w, hgt);
      } else if (tool === 'ellipse') {
        ctx.ellipse(from.x + w / 2, from.y + hgt / 2, Math.abs(w / 2), Math.abs(hgt / 2), 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const start = toCanvas(e);
      pushUndo();

      if (tool === 'fill') {
        floodFill(ctx, Math.floor(start.x), Math.floor(start.y), color);
        markDirty();
        return;
      }

      canvas.setPointerCapture(e.pointerId);
      const snapshot = undoStack[undoStack.length - 1];
      let last = start;

      if (tool === 'brush' || tool === 'eraser') {
        stroke();
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(start.x + 0.01, start.y);
        ctx.stroke();
      }

      const move = (ev: PointerEvent) => {
        const p = toCanvas(ev);
        if (tool === 'brush' || tool === 'eraser') {
          stroke();
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last = p;
        } else {
          ctx.putImageData(snapshot, 0, 0);
          drawShape(start, p, ev.shiftKey);
        }
      };
      const up = () => {
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
        markDirty();
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = toCanvas(e);
      cursorPos.textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}`;
    });
    canvas.addEventListener('pointerleave', () => (cursorPos.textContent = ''));

    colorInput.addEventListener('input', () => setColor(colorInput.value));
    sizeInput.addEventListener('input', () => {
      size = Number(sizeInput.value);
      sizeLabel.textContent = `${size}px`;
    });

    root.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (mod && e.key === 's') {
        e.preventDefault();
        e.shiftKey ? saveAs() : save();
      } else if (!mod && TOOL_KEYS[e.key]) {
        setTool(TOOL_KEYS[e.key]);
      }
    });

    win.onBeforeClose(confirmDiscard);

    resetCanvas(DEFAULT_SIZE.width, DEFAULT_SIZE.height);
    setTool('brush');
    setColor(color);
    updateTitle();
    if (args.path) load(args.path);
    root.focus();
  },
};
