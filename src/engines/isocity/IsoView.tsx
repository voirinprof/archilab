import type { KeyboardEvent, PointerEvent } from 'react';
import type { Placed } from './types.ts';
import type { Cell, Issue, Scenario } from './rules.ts';
import { elementOf, footprint, isOverlay, roadDirs, rotateDirs } from './rules.ts';
import { drawOrder, fromScreen, pathOf, toScreen, UNIT_Z } from './iso.ts';
import { FlatArt, hasVolume, ShadowArt, VolumeArt } from './Art.tsx';

export const columnName = (x: number) => String.fromCharCode(65 + x);

type Props = {
  sc: Scenario;
  city: Placed[];
  ghost: { cand: Omit<Placed, 'uid'>; ok: boolean } | null;
  selected: number | null;
  cursor: Cell | null;
  hover: Cell | null;
  issues: Issue[];
  label: string;
  onCellDown: (cell: Cell, e: PointerEvent) => void;
  onCellHover: (cell: Cell | null) => void;
  onKeyDown: (e: KeyboardEvent) => void;
};

const diamond = (x: number, y: number, w = 1, d = 1) => pathOf([toScreen(x, y), toScreen(x + w, y), toScreen(x + w, y + d), toScreen(x, y + d)]);

/** Fixed isometric view of the city grid. Cells are picked from the pointer position on the ground, so tall buildings never hide a cell. */
export function IsoView({ sc, city, ghost, selected, cursor, hover, issues, label, onCellDown, onCellHover, onKeyDown }: Props) {
  const { width, depth } = sc.grid;
  const pad = 30;
  const maxH = Math.max(1, ...sc.elements.map(e => (e.height ?? 0) + 0.9));
  const minX = -depth * 32 - pad, maxX = width * 32 + pad, minY = -maxH * UNIT_Z - pad, maxY = (width + depth) * 16 + pad;

  const cellFrom = (e: PointerEvent<SVGSVGElement>): Cell | null => {
    const svg = e.currentTarget, ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const [gx, gy] = fromScreen(p.x, p.y);
    const x = Math.floor(gx), y = Math.floor(gy);
    return x >= 0 && y >= 0 && x < width && y < depth ? [x, y] : null;
  };

  const items = city.map(p => ({ p, el: elementOf(sc, p.element), ...footprintBox(sc, p) }));
  const flats = items.filter(i => !isOverlay(i.el));
  const volumes = drawOrder(items.filter(i => hasVolume(i.el)), (a, b) => Number(isOverlay(a.el)) - Number(isOverlay(b.el)));
  const ghostEl = ghost && elementOf(sc, ghost.cand.element);
  const ghostRect = ghost && footprint(ghostEl!, ghost.cand);
  const ghostDirs = ghost ? rotateDirs(ghostEl!.connections ?? [], ghost.cand.rotation) : [];
  const sel = items.find(i => i.p.uid === selected);

  const grid: string[] = [];
  for (let i = 0; i <= width; i++) grid.push(`M${toScreen(i, 0).join(' ')}L${toScreen(i, depth).join(' ')}`);
  for (let j = 0; j <= depth; j++) grid.push(`M${toScreen(0, j).join(' ')}L${toScreen(width, j).join(' ')}`);

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="ic-svg"
      role="application"
      aria-label={label}
      tabIndex={0}
      onPointerDown={e => { const c = cellFrom(e); if (c) onCellDown(c, e); }}
      onPointerMove={e => onCellHover(cellFrom(e))}
      onPointerLeave={() => onCellHover(null)}
      onKeyDown={onKeyDown}
    >
      <path d={diamond(0, 0, width, depth)} className="ic-ground" />
      <path d={grid.join('')} className="ic-grid" />
      {Array.from({ length: width }, (_, x) => { const [sx, sy] = toScreen(x + 0.5, -0.55); return <text key={`c${x}`} x={sx} y={sy} className="ic-coord" textAnchor="middle">{columnName(x)}</text>; })}
      {Array.from({ length: depth }, (_, y) => { const [sx, sy] = toScreen(-0.55, y + 0.5); return <text key={`r${y}`} x={sx} y={sy + 4} className="ic-coord" textAnchor="middle">{y + 1}</text>; })}
      {flats.map(i => <g key={`f${i.p.uid}`}><FlatArt el={i.el} r={i} dirs={i.el.kind === 'road' ? roadDirs(sc, i.p) : []} /></g>)}
      {items.map(i => <ShadowArt key={`s${i.p.uid}`} el={i.el} r={i} />)}
      {volumes.map(i => <g key={`v${i.p.uid}`} className={i.p.uid === selected ? 'ic-selected' : undefined}><VolumeArt el={i.el} r={i} rotation={i.p.rotation} /></g>)}
      {issues.map(({ x, y, kind }) => <path key={`i${x},${y}`} d={diamond(x + 0.08, y + 0.08, 0.84, 0.84)} className={`ic-issue ${kind}`} />)}
      {sel && <path d={diamond(sel.x, sel.y, sel.w, sel.d)} className="ic-select" />}
      {ghost && ghostRect && (
        <g className={`ic-ghost ${ghost.ok ? 'ok' : 'bad'}`}>
          <FlatArt el={ghostEl!} r={ghostRect} dirs={ghostDirs} />
          {hasVolume(ghostEl!) && <VolumeArt el={ghostEl!} r={ghostRect} rotation={ghost.cand.rotation} />}
          <path d={diamond(ghostRect.x, ghostRect.y, ghostRect.w, ghostRect.d)} className="ic-ghost-outline" />
        </g>
      )}
      {hover && !ghost && <path d={diamond(hover[0], hover[1])} className="ic-hover" />}
      {cursor && <path d={diamond(cursor[0], cursor[1])} className="ic-cursor" />}
    </svg>
  );
}

function footprintBox(sc: Scenario, p: Placed) {
  const r = footprint(elementOf(sc, p.element), p);
  return { x: r.x, y: r.y, w: r.w, d: r.d };
}
