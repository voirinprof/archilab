import type { Heights } from './types.ts';

const COS30 = Math.cos(Math.PI / 6);
const SIDE_ORDER = ['north', 'east', 'south', 'west'] as const;
type SideName = (typeof SIDE_ORDER)[number];

type Props = {
  /** Already rotated to the current point of view. */
  heights: Heights;
  ghost?: Heights;
  maxHeight: number;
  /** Quarter turns applied to the building, used to place the compass letters. */
  turns: number;
  sideLabels: Record<SideName, string>;
  label: string;
  cube?: number;
};

type Face = { key: string; points: [number, number, number][]; kind: 'top' | 'left' | 'right' };

/** Visible faces of every block, in back-to-front order (painter's algorithm). */
function faces(h: Heights): Face[] {
  const depth = h.length, width = h[0].length;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < depth ? h[y][x] : 0);
  const cubes: [number, number, number][] = [];
  for (let y = 0; y < depth; y++) for (let x = 0; x < width; x++) for (let z = 0; z < h[y][x]; z++) cubes.push([x, y, z]);
  cubes.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[2] - b[2]);
  const out: Face[] = [];
  for (const [u, v, z] of cubes) {
    const k = `${u}:${v}:${z}`;
    if (z + 1 >= h[v][u]) out.push({ key: `t${k}`, kind: 'top', points: [[u, v, z + 1], [u + 1, v, z + 1], [u + 1, v + 1, z + 1], [u, v + 1, z + 1]] });
    if (at(u, v + 1) <= z) out.push({ key: `l${k}`, kind: 'left', points: [[u, v + 1, z], [u + 1, v + 1, z], [u + 1, v + 1, z + 1], [u, v + 1, z + 1]] });
    if (at(u + 1, v) <= z) out.push({ key: `r${k}`, kind: 'right', points: [[u + 1, v, z], [u + 1, v + 1, z], [u + 1, v + 1, z + 1], [u + 1, v, z + 1]] });
  }
  return out;
}

/** Isometric drawing of stacked blocks on a ground grid, with N/E/S/W letters on the ground edges. */
export function Isometric({ heights, ghost, maxHeight, turns, sideLabels, label, cube = 34 }: Props) {
  const depth = heights.length, width = heights[0].length;
  const project = ([u, v, z]: [number, number, number]) => [(u - v) * COS30 * cube, (u + v) * 0.5 * cube - z * cube] as const;
  const path = (pts: [number, number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${project(p).join(' ')}`).join('') + 'Z';
  const pad = 28;
  const minX = -depth * COS30 * cube - pad, maxX = width * COS30 * cube + pad;
  const minY = -maxHeight * cube - pad, maxY = (width + depth) * 0.5 * cube + pad;

  // ground edge midpoints, before rotation: north edge v=0, east u=width, south v=depth, west u=0
  const edges: Record<SideName, [number, number, number]> = {
    north: [width / 2, -0.6, 0], east: [width + 0.6, depth / 2, 0], south: [width / 2, depth + 0.6, 0], west: [-0.6, depth / 2, 0],
  };
  const sideAt = (position: SideName): SideName => SIDE_ORDER[(SIDE_ORDER.indexOf(position) - turns + 400) % 4];

  const ground: string[] = [];
  for (let i = 0; i <= width; i++) ground.push(`M${project([i, 0, 0]).join(' ')}L${project([i, depth, 0]).join(' ')}`);
  for (let j = 0; j <= depth; j++) ground.push(`M${project([0, j, 0]).join(' ')}L${project([width, j, 0]).join(' ')}`);

  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="iso-svg" role="img" aria-label={label}>
      <path d={path([[0, 0, 0], [width, 0, 0], [width, depth, 0], [0, depth, 0]])} className="iso-ground" />
      <path d={ground.join('')} className="iso-grid" />
      {SIDE_ORDER.map(position => {
        const [x, y] = project(edges[position]);
        return <text key={position} x={x} y={y + 4} textAnchor="middle" className="iso-side">{sideLabels[sideAt(position)]}</text>;
      })}
      {faces(heights).map(f => <path key={f.key} d={path(f.points)} className={`iso-face ${f.kind}`} />)}
      {ghost && faces(ghost).map(f => <path key={`g${f.key}`} d={path(f.points)} className="iso-ghost" />)}
    </svg>
  );
}
