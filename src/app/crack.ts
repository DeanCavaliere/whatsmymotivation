export interface CrackPath {
  /** SVG path data, starting at or branching from the origin (0, 0). */
  d: string;
  /** Stroke width in pixels. */
  width: number;
}

/** A small seeded generator, so a day's crack looks the same on every reload. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Fissures branching out from (0, 0). `reach` is roughly how far the longest arm goes, in pixels.
 * Each arm wanders a little and may split into thinner branches, up to two levels deep.
 */
export function crackPaths(seed: string, reach: number, random: () => number = seededRandom(seed)): CrackPath[] {
  const paths: CrackPath[] = [];
  const grow = (x: number, y: number, angle: number, length: number, width: number, depth: number) => {
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const steps = 5 + Math.floor(random() * 5);
    for (let i = 0; i < steps; i++) {
      angle += (random() - 0.5) * 0.9;
      const segment = length / steps * (0.7 + random() * 0.6);
      x += Math.cos(angle) * segment;
      y += Math.sin(angle) * segment;
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (depth < 2 && random() < 0.32) {
        const turn = (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.6);
        grow(x, y, angle + turn, length * 0.45, width * 0.6, depth + 1);
      }
    }
    paths.push({d, width: +width.toFixed(2)});
  };
  const arms = 6;
  for (let i = 0; i < arms; i++) {
    const angle = i / arms * Math.PI * 2 + random() * 0.6;
    grow(0, 0, angle, reach * (0.5 + random() * 0.5), 3.5 - random() * 1.2, 0);
  }
  return paths;
}
