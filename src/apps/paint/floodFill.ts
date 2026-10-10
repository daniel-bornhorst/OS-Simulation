function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** Fill the contiguous region of similar colour around (x, y). */
export function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string, tolerance = 32): void {
  const { width, height } = ctx.canvas;
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const fill = hexToRgba(hex);
  const start = (y * width + x) * 4;
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  if (target.every((v, i) => Math.abs(v - fill[i]) <= 1)) return;

  const matches = (i: number) =>
    Math.abs(data[i] - target[0]) <= tolerance &&
    Math.abs(data[i + 1] - target[1]) <= tolerance &&
    Math.abs(data[i + 2] - target[2]) <= tolerance &&
    Math.abs(data[i + 3] - target[3]) <= tolerance;
  const visited = new Uint8Array(width * height);
  const stack = [x, y];

  // Scanline fill: walk each row segment, queueing the rows above and below.
  while (stack.length) {
    const sy = stack.pop()!;
    let sx = stack.pop()!;
    while (sx > 0 && !visited[sy * width + sx - 1] && matches((sy * width + sx - 1) * 4)) sx--;
    let spanUp = false;
    let spanDown = false;
    for (; sx < width; sx++) {
      const p = sy * width + sx;
      if (visited[p] || !matches(p * 4)) break;
      visited[p] = 1;
      data.set(fill, p * 4);
      if (sy > 0) {
        const up = p - width;
        const ok = !visited[up] && matches(up * 4);
        if (ok && !spanUp) stack.push(sx, sy - 1);
        spanUp = ok;
      }
      if (sy < height - 1) {
        const down = p + width;
        const ok = !visited[down] && matches(down * 4);
        if (ok && !spanDown) stack.push(sx, sy + 1);
        spanDown = ok;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}
