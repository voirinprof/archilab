import type { CityElement, Dir, Rotation } from './types.ts';
import type { Rect } from './rules.ts';
import { pathOf, shade, toScreen } from './iso.ts';
import type { Point } from './iso.ts';

/* Simple low-poly drawings of each shape. They only depend on the footprint, the road directions and the colour. */

const P = (x: number, y: number, z = 0): Point => toScreen(x, y, z);

function Box({ r, z0 = 0, h, color, inset = 0 }: { r: Rect; z0?: number; h: number; color: string; inset?: number }) {
  const x0 = r.x + inset, y0 = r.y + inset, x1 = r.x + r.w - inset, y1 = r.y + r.d - inset, z1 = z0 + h;
  return (
    <>
      <path d={pathOf([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)])} fill={shade(color, 0.84)} className="ic-edge" />
      <path d={pathOf([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)])} fill={shade(color, 0.68)} className="ic-edge" />
      <path d={pathOf([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)])} fill={color} className="ic-edge" />
    </>
  );
}

/** A rectangle drawn on the south face (x from a to b) or the east face (y from a to b) of a box. */
const southPanel = (r: Rect, a: number, b: number, z0: number, z1: number) => pathOf([P(a, r.y + r.d, z0), P(b, r.y + r.d, z0), P(b, r.y + r.d, z1), P(a, r.y + r.d, z1)]);
const eastPanel = (r: Rect, a: number, b: number, z0: number, z1: number) => pathOf([P(r.x + r.w, a, z0), P(r.x + r.w, b, z0), P(r.x + r.w, b, z1), P(r.x + r.w, a, z1)]);

function Windows({ r, inset, z0, z1, floors, color }: { r: Rect; inset: number; z0: number; z1: number; floors: number; color: string }) {
  const panels: string[] = [];
  const level = (z1 - z0) / floors;
  const south = { ...r, d: r.d - inset }, east = { ...r, w: r.w - inset };
  const columns = (length: number) => Math.max(1, Math.round((length - 2 * inset) / 0.45));
  for (let f = 0; f < floors; f++) {
    const a = z0 + (f + 0.3) * level, b = a + level * 0.4;
    const nx = columns(r.w), cw = (r.w - 2 * inset) / nx;
    for (let k = 0; k < nx; k++) panels.push(southPanel(south, r.x + inset + (k + 0.25) * cw, r.x + inset + (k + 0.7) * cw, a, b));
    const ny = columns(r.d), cd = (r.d - 2 * inset) / ny;
    for (let k = 0; k < ny; k++) panels.push(eastPanel(east, r.y + inset + (k + 0.25) * cd, r.y + inset + (k + 0.7) * cd, a, b));
  }
  return <path d={panels.join('')} fill={color} />;
}

function Crown({ cx, cy, z, size, color }: { cx: number; cy: number; z: number; size: number; color: string }) {
  const [tx, ty] = P(cx, cy, 0), [cxs, cys] = P(cx, cy, z);
  return (
    <>
      <line x1={tx} y1={ty} x2={tx} y2={cys + size * 0.5} className="ic-trunk" />
      <circle cx={cxs} cy={cys} r={size} fill={color} className="ic-edge" />
      <circle cx={cxs - size * 0.35} cy={cys - size * 0.35} r={size * 0.38} fill={shade(color, 1.35)} />
    </>
  );
}

/** Ground part of an element: road surface, crosswalk stripes, lawns. Drawn before every volume. */
export function FlatArt({ el, r, dirs }: { el: CityElement; r: Rect; dirs: Dir[] }) {
  const ground = pathOf([P(r.x, r.y), P(r.x + r.w, r.y), P(r.x + r.w, r.y + r.d), P(r.x, r.y + r.d)]);
  const cx = r.x + 0.5, cy = r.y + 0.5;
  const mid: Record<Dir, Point> = { n: P(cx, r.y), e: P(r.x + 1, cy), s: P(cx, r.y + 1), w: P(r.x, cy) };
  const centre = P(cx, cy);
  switch (el.shape) {
    case 'road':
    case 'crosswalk': {
      const along = dirs.includes('n') || dirs.includes('s');
      const stripes = el.shape === 'crosswalk'
        ? [0.18, 0.4, 0.62].map(o => along
          ? pathOf([P(r.x + o, r.y + 0.2), P(r.x + o + 0.16, r.y + 0.2), P(r.x + o + 0.16, r.y + 0.8), P(r.x + o, r.y + 0.8)])
          : pathOf([P(r.x + 0.2, r.y + o), P(r.x + 0.8, r.y + o), P(r.x + 0.8, r.y + o + 0.16), P(r.x + 0.2, r.y + o + 0.16)])).join('')
        : '';
      return (
        <>
          <path d={ground} fill={el.color} className="ic-road" />
          {el.shape === 'road' && <path d={dirs.map(d => `M${centre.join(' ')}L${mid[d].join(' ')}`).join('')} className="ic-lane" />}
          {el.shape === 'road' && dirs.length > 2 && <path d={pathOf([P(cx - 0.12, cy - 0.12), P(cx + 0.12, cy - 0.12), P(cx + 0.12, cy + 0.12), P(cx - 0.12, cy + 0.12)])} className="ic-junction" />}
          {stripes && <path d={stripes} className="ic-stripes" />}
        </>
      );
    }
    case 'park': {
      const path = `M${P(r.x + r.w / 2, r.y + 0.1).join(' ')}L${P(r.x + r.w / 2, r.y + r.d - 0.1).join(' ')}M${P(r.x + 0.1, r.y + r.d / 2).join(' ')}L${P(r.x + r.w - 0.1, r.y + r.d / 2).join(' ')}`;
      return <><path d={ground} fill={el.color} className="ic-edge" /><path d={path} className="ic-path" /></>;
    }
    case 'green': {
      const tufts = [[0.3, 0.35], [0.65, 0.3], [0.45, 0.7], [0.75, 0.68]].map(([a, b]) => { const [x, y] = P(r.x + a, r.y + b); return `M${x - 3} ${y}l3 -5l3 5`; }).join('');
      return <><path d={ground} fill={el.color} className="ic-edge" /><path d={tufts} className="ic-tuft" stroke={shade(el.color, 0.7)} /></>;
    }
    default:
      return null;
  }
}

/** Soft shadow cast towards the east on the ground. */
export function ShadowArt({ el, r }: { el: CityElement; r: Rect }) {
  const h = el.height ?? 0;
  if (!h || el.kind === 'signal') return null;
  if (el.kind === 'tree') {
    const [x, y] = P(r.x + 0.62, r.y + 0.5);
    return <ellipse cx={x} cy={y} rx={14} ry={6} className="ic-shadow" />;
  }
  const s = Math.min(0.9, h * 0.35);
  return <path d={pathOf([P(r.x + r.w, r.y), P(r.x + r.w + s, r.y + s * 0.3), P(r.x + r.w + s, r.y + r.d + s * 0.3), P(r.x + r.w, r.y + r.d)])} className="ic-shadow" />;
}

/** Raised part of an element, drawn in painter's order. */
export function VolumeArt({ el, r, rotation }: { el: CityElement; r: Rect; rotation: Rotation }) {
  const h = el.height ?? 1;
  switch (el.shape) {
    case 'house': {
      const i = 0.14, x0 = r.x + i, y0 = r.y + i, x1 = r.x + r.w - i, y1 = r.y + r.d - i, z = h, apex = P((x0 + x1) / 2, (y0 + y1) / 2, h + 0.55);
      const e = 0.06, roof = (a: Point, b: Point) => pathOf([a, b, apex]);
      const [ex0, ey0, ex1, ey1] = [x0 - e, y0 - e, x1 + e, y1 + e];
      // the door faces the street side given by the rotation, when that side is visible
      const doorSouth = rotation === 0 || rotation === 270;
      return (
        <>
          <Box r={r} h={h} color="#f2e7d1" inset={i} />
          {doorSouth
            ? <path d={southPanel({ ...r, d: r.d - i }, r.x + 0.42, r.x + 0.6, 0, 0.5)} fill="#9a5b45" />
            : <path d={eastPanel({ ...r, w: r.w - i }, r.y + 0.42, r.y + 0.6, 0, 0.5)} fill="#9a5b45" />}
          <path d={doorSouth ? eastPanel({ ...r, w: r.w - i }, r.y + 0.35, r.y + 0.62, 0.3, 0.6) : southPanel({ ...r, d: r.d - i }, r.x + 0.35, r.x + 0.62, 0.3, 0.6)} fill="#a8d3e0" />
          <path d={roof(P(ex0, ey0, z), P(ex1, ey0, z))} fill={shade(el.color, 1.1)} className="ic-edge" />
          <path d={roof(P(ex0, ey0, z), P(ex0, ey1, z))} fill={el.color} className="ic-edge" />
          <path d={roof(P(ex1, ey0, z), P(ex1, ey1, z))} fill={shade(el.color, 0.72)} className="ic-edge" />
          <path d={roof(P(ex0, ey1, z), P(ex1, ey1, z))} fill={shade(el.color, 0.88)} className="ic-edge" />
        </>
      );
    }
    case 'apartment': {
      const i = 0.1;
      return (
        <>
          <Box r={r} h={h} color={el.color} inset={i} />
          <Windows r={r} inset={i} z0={0.1} z1={h - 0.1} floors={Math.max(2, Math.round(h * 1.6))} color="#e9f3f6" />
          <Box r={{ x: r.x + 0.3, y: r.y + 0.3, w: 0.4, d: 0.4 }} z0={h} h={0.18} color={shade(el.color, 0.8)} />
        </>
      );
    }
    case 'school': {
      const i = 0.1, [fx, fy] = P(r.x + i + 0.15, r.y + i + 0.15, h), [tx, ty] = P(r.x + i + 0.15, r.y + i + 0.15, h + 0.9);
      return (
        <>
          <Box r={r} h={h} color={el.color} inset={i} />
          <Windows r={r} inset={i} z0={0.1} z1={h - 0.15} floors={2} color="#fff8e6" />
          <Box r={{ x: r.x + r.w / 2 - 0.35, y: r.y + r.d / 2 - 0.35, w: 0.7, d: 0.7 }} z0={h} h={0.3} color={shade(el.color, 0.85)} />
          <line x1={fx} y1={fy} x2={tx} y2={ty} className="ic-pole" />
          <path d={`M${tx} ${ty}l16 4l-16 5Z`} fill="#c2553b" />
        </>
      );
    }
    case 'shop': {
      const i = 0.1, top = h - 0.25;
      return (
        <>
          <Box r={r} h={h} color="#f7f3ea" inset={i} />
          <path d={southPanel({ ...r, d: r.d - i }, r.x + i + 0.08, r.x + r.w - i - 0.08, 0.05, top - 0.1)} fill="#a8d3e0" />
          <path d={eastPanel({ ...r, w: r.w - i }, r.y + i + 0.08, r.y + r.d - i - 0.08, 0.05, top - 0.1)} fill="#8fc2d2" />
          <path d={pathOf([P(r.x + i, r.y + r.d - i + 0.18, top - 0.12), P(r.x + r.w - i + 0.18, r.y + r.d - i + 0.18, top - 0.12), P(r.x + r.w - i, r.y + r.d - i, top + 0.1), P(r.x + i, r.y + r.d - i, top + 0.1)])} fill={el.color} className="ic-edge" />
          <path d={pathOf([P(r.x + r.w - i + 0.18, r.y + i, top - 0.12), P(r.x + r.w - i + 0.18, r.y + r.d - i + 0.18, top - 0.12), P(r.x + r.w - i, r.y + r.d - i, top + 0.1), P(r.x + r.w - i, r.y + i, top + 0.1)])} fill={shade(el.color, 0.8)} className="ic-edge" />
        </>
      );
    }
    case 'park':
      return (
        <>
          {[[0.3, 0.3], [r.w - 0.3, 0.45], [0.45, r.d - 0.3], [r.w - 0.35, r.d - 0.3]].map(([a, b], k) => <Crown key={k} cx={r.x + a} cy={r.y + b} z={0.55} size={8} color={shade(el.color, 0.75)} />)}
        </>
      );
    case 'tree':
      return <Crown cx={r.x + 0.5} cy={r.y + 0.5} z={h} size={13} color={el.color} />;
    case 'signal':
      return (
        <>
          {[[0.14, 0.14], [0.86, 0.86]].map(([a, b], k) => {
            const [x0, y0] = P(r.x + a, r.y + b, 0), [x1, y1] = P(r.x + a, r.y + b, h);
            return (
              <g key={k}>
                <line x1={x0} y1={y0} x2={x1} y2={y1} className="ic-pole" />
                <rect x={x1 - 4} y={y1 - 16} width={8} height={18} rx={2} fill={el.color} />
                <circle cx={x1} cy={y1 - 12} r={2.2} fill="#ef4444" /><circle cx={x1} cy={y1 - 7} r={2.2} fill="#f5b83d" /><circle cx={x1} cy={y1 - 2} r={2.2} fill="#34c06a" />
              </g>
            );
          })}
        </>
      );
    default:
      return null;
  }
}

/** True when the element has something to draw in the volume pass. */
export const hasVolume = (el: CityElement) => ['house', 'apartment', 'school', 'shop', 'park', 'tree', 'signal'].includes(el.shape);
