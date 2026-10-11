/** Frost around the edges of the table, heaviest in the corners, like a frosted window. Drawn once per size. */
export function drawFrost(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Seeded, so the frost keeps its shape when the table is resized.
  const random = seeded(20251225);
  const s = Math.min(w, h);
  const reach = s * 0.3;

  // Each edge: its length, where a point `along` it and `depth` in from it is, and how deep the frost
  // starts (the bottom holds a little more, like a window sill).
  const edges = [
    {length: w, base: 5, at: (along: number, depth: number) => [along, depth]},
    {length: w, base: 9, at: (along: number, depth: number) => [along, h - depth]},
    {length: h, base: 5, at: (along: number, depth: number) => [depth, along]},
    {length: h, base: 5, at: (along: number, depth: number) => [w - depth, along]},
  ];
  const depth = (along: number, length: number, base: number, phase: number) => {
    const corner = Math.max(0, 1 - Math.min(along, length - along) / reach) ** 2 * s * 0.17;
    // Deeper frost gets bigger lumps, so the corners don't trace a smooth curve.
    const wobble = Math.sin(along / 23 + phase) * (2.5 + corner * 0.18) + Math.sin(along / 7.3 + phase * 3) * (1.2 + corner * 0.06);
    return Math.max(1, base + corner + wobble);
  };

  // Stacked bands, each shallower and denser toward the frame, with ragged inner edges.
  ctx.save();
  ctx.filter = 'blur(1.5px)';
  for (const [i, scale] of [1.25, 0.8, 0.45].entries()) {
    ctx.fillStyle = `rgba(232, 240, 248, ${0.2 + i * 0.08})`;
    for (const edge of edges) {
      const phase = random() * 10;
      ctx.beginPath();
      ctx.moveTo(...edge.at(0, 0) as [number, number]);
      for (let along = 0; along <= edge.length; along += 4) {
        ctx.lineTo(...edge.at(along, depth(along, edge.length, edge.base, phase) * scale) as [number, number]);
      }
      ctx.lineTo(...edge.at(edge.length, 0) as [number, number]);
      ctx.fill();
    }
  }
  ctx.restore();

  // Grain: ice speckles, thicker near the frame.
  for (const edge of edges) {
    for (let i = 0; i < edge.length * 1.6; i++) {
      const along = random() * edge.length;
      const d = depth(along, edge.length, edge.base, 0) * 1.4 * random() ** 1.8;
      const [x, y] = edge.at(along, d);
      ctx.fillStyle = `rgba(245, 250, 255, ${0.15 + random() * 0.45})`;
      ctx.fillRect(x, y, 0.6 + random() * 1.2, 0.6 + random() * 1.2);
    }
  }

  // Feathery crystals: fans from each corner, and a few small ones creeping in from the edges.
  ctx.strokeStyle = 'rgba(240, 247, 255, 0.4)';
  ctx.lineCap = 'round';
  const corners: [number, number, number][] = [[0, 0, 45], [w, 0, 135], [w, h, 225], [0, h, 315]];
  for (const [x, y, inward] of corners) {
    for (let i = 0; i < 5; i++) {
      fern(ctx, random, x, y, inward + (i - 2) * 17 + (random() - 0.5) * 8, s * (0.1 + random() * 0.1), 2);
    }
  }
  for (const edge of edges) {
    for (let along = reach; along < edge.length - reach; along += 70 + random() * 90) {
      const [x, y] = edge.at(along, 0);
      const [ix, iy] = edge.at(along, 1);
      const inward = Math.atan2(iy - y, ix - x) * 180 / Math.PI;
      fern(ctx, random, x, y, inward + (random() - 0.5) * 50, 12 + random() * 22, 1);
    }
  }
}

/** A crystal: a slightly bent spine with side branches that are smaller crystals of their own. */
function fern(ctx: CanvasRenderingContext2D, random: () => number, x: number, y: number, degrees: number,
              length: number, depth: number): void {
  const steps = 6;
  let angle = degrees * Math.PI / 180;
  const bend = (random() - 0.5) * 0.12;
  ctx.lineWidth = 0.5 + depth * 0.35;
  for (let i = 0; i < steps; i++) {
    const step = length / steps;
    const nx = x + Math.cos(angle) * step;
    const ny = y + Math.sin(angle) * step;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    if (depth > 0 && i > 0) {
      const side = length * (0.42 - i * 0.05);
      for (const turn of [-1, 1]) {
        if (random() < 0.85) {
          fern(ctx, random, nx, ny, (angle * 180 / Math.PI) + turn * (45 + random() * 20), side, depth - 1);
          ctx.lineWidth = 0.5 + depth * 0.35;
        }
      }
    }
    x = nx;
    y = ny;
    angle += bend;
  }
}

/** A small seeded random number generator (mulberry32). */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
