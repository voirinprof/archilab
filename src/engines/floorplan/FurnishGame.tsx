import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { RotateCw } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { FurnishActivity, OpeningSpec, PlacedFurniture, Plan, Rect } from './types.ts';
import { canPlaceFurniture, doorSwing, evaluateFurnish, footprint, footprints, initialFurniture, openingRect, passage, rotated, zoneClear, zonesOf } from './furniture.ts';
import type { Scene } from './furniture.ts';
import { clampPosition } from './rules.ts';
import { Feedback, NeedsList, PAD, PlanFrame, SCALE, colorsOf, formatNumber, px, ui } from './shared.tsx';

const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type Drag = { id: string; startX: number; startY: number; origin: PlacedFurniture };

/** Door gap with its leaf and swing arc, or a window, drawn on the outer wall. */
function Opening({ o, plan, scale }: { o: OpeningSpec; plan: Plan; scale: number }) {
  const p = (m: number) => px(m, scale);
  const wall = openingRect(o, plan);
  const [x1, y1, x2, y2] = [wall.x, wall.y, wall.x + wall.width, wall.y + wall.depth].map(p);
  if (o.kind === 'window') {
    return (
      <g className="fp-window">
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="fp-window-frame" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="fp-window-glass" />
      </g>
    );
  }
  const vertical = o.side === 'west' || o.side === 'east';
  const along = vertical ? [0, 1] : [1, 0];
  const inward = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] }[o.side];
  const r = o.width * scale;
  const leaf = [x1 + inward[0] * r, y1 + inward[1] * r];
  const sweep = inward[0] * along[1] - inward[1] * along[0] > 0 ? 1 : 0;
  return (
    <g className="fp-entrance">
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="fp-wall-gap" />
      <path d={`M${x1} ${y1}L${leaf[0]} ${leaf[1]}A${r} ${r} 0 0 ${sweep} ${x2} ${y2}`} />
    </g>
  );
}

/** Furnish mode: fixed-size furniture is moved and rotated; each piece needs its usage zone and a way to reach it. */
export function FurnishGame({ game, lang }: { game: FurnishActivity; lang: Lang }) {
  const t = ui[lang];
  const { plan, step, items, openings } = game.parameters;
  const scale = game.parameters.scale ?? SCALE;
  const p = (m: number) => px(m, scale);
  const movable = items.filter(i => !i.fixed);

  const [placed, setPlaced] = useState<PlacedFurniture[]>(() => initialFurniture(items));
  const [selected, setSelected] = useState(movable[0].id);
  const [ghost, setGhost] = useState<Rect | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);

  const scene: Scene = { plan, step, items, openings, placed };
  const specOf = (id: string) => items.find(i => i.id === id)!;
  const placedOf = (id: string) => placed.find(f => f.id === id)!;
  const result = evaluateFurnish(game.constraints, scene);
  const passageRule = game.constraints.find(c => c.type === 'min_passage');
  const walk = passageRule?.type === 'min_passage' ? passage(scene, passageRule.from, passageRule.to, passageRule.width) : null;
  const unreachable = (id: string) => !!walk && passageRule?.type === 'min_passage' && passageRule.to.includes(id) && !walk.reached.has(id);
  const revealAt = game.parameters.reveal_passage_hint;
  const showWalk = walk && revealAt !== undefined && hint + 1 >= revealAt;
  const footprintArea = (fixed: boolean) => footprints(scene).filter(f => !!specOf(f.id).fixed === fixed).reduce((sum, f) => sum + f.rect.width * f.rect.depth, 0);
  const furnitureArea = footprintArea(false);
  const freeArea = plan.width * plan.depth - furnitureArea - footprintArea(true);

  function place(candidate: PlacedFurniture): boolean {
    if (!canPlaceFurniture(scene, candidate)) return false;
    setPlaced(current => current.map(f => (f.id === candidate.id ? candidate : f)));
    setChecked(false);
    return true;
  }

  function tryPlace(candidate: PlacedFurniture) {
    setBlocked(!place(candidate));
  }

  function rotate(id: string) {
    tryPlace(rotated(specOf(id), placedOf(id), step));
  }

  function reset() {
    setPlaced(initialFurniture(items));
    setSelected(movable[0].id);
    setGhost(null);
    setBlocked(false);
    setChecked(false);
    setHint(-1);
  }

  function toMetres(e: PointerEvent): { x: number; y: number } | null {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: (pt.x - PAD) / scale, y: (pt.y - PAD) / scale };
  }

  function startDrag(e: PointerEvent, id: string) {
    const pt = toMetres(e);
    if (!pt) return;
    e.preventDefault();
    setSelected(id);
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { id, startX: pt.x, startY: pt.y, origin: placedOf(id) };
  }

  function moveDrag(e: PointerEvent) {
    const d = drag.current;
    const pt = d && toMetres(e);
    if (!d || !pt) return;
    const snap = (v: number) => Math.round(v / step) * step;
    const o = d.origin;
    const size = footprint(specOf(d.id), o);
    const target = clampPosition({ ...size, x: o.x + snap(pt.x - d.startX), y: o.y + snap(pt.y - d.startY) }, plan);
    const current = placedOf(d.id);
    if (target.x === current.x && target.y === current.y) {
      setGhost(null);
      return;
    }
    const ok = place({ ...o, x: target.x, y: target.y });
    setGhost(ok ? null : target);
    setBlocked(!ok);
  }

  function endDrag() {
    drag.current = null;
    setGhost(null);
  }

  function onKey(e: KeyboardEvent, id: string) {
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      rotate(id);
      return;
    }
    const delta = arrows[e.key];
    if (!delta) return;
    e.preventDefault();
    const f = placedOf(id);
    tryPlace({ ...f, x: f.x + delta[0] * step, y: f.y + delta[1] * step });
  }

  const sel = specOf(selected);
  const selRect = footprint(sel, placedOf(selected));
  const metres = (v: number) => `${formatNumber(v, lang)} m`;

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.furnishHelp}</p>
        <div className="drawing">
          <PlanFrame plan={plan} lang={lang} svgRef={svgRef} scale={scale} gridStep={step} className="draggable furnish" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <defs>
              {(['ok', 'bad'] as const).map(kind => (
                <pattern key={kind} id={`fp-hatch-${kind}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" className={`fp-hatch-line ${kind}`} />
                </pattern>
              ))}
            </defs>
            {showWalk && walk.cells.map((c, i) => <rect key={i} x={p(c.x)} y={p(c.y)} width={c.width * scale} height={c.depth * scale} className="fp-walk" />)}
            {[...openings.map(o => o.id), ...items.map(i => i.id)].flatMap(id =>
              zonesOf(scene, id).map((z, i) => (
                <rect key={`${id}-${i}`} x={p(z.x)} y={p(z.y)} width={z.width * scale} height={z.depth * scale} className={`fp-usage ${zoneClear(scene, id, z) ? 'ok' : 'bad'}`} />
              )))}
            <rect x={p(0)} y={p(0)} width={plan.width * scale} height={plan.depth * scale} fill="none" stroke="#37545b" strokeWidth="6" />
            {openings.map(o => <Opening key={o.id} o={o} plan={plan} scale={scale} />)}
            {placed.map(f => {
              const spec = specOf(f.id);
              const r = footprint(spec, f);
              const colors = colorsOf(spec);
              const isSel = f.id === selected;
              const x = p(r.x), y = p(r.y), w = r.width * scale, h = r.depth * scale;
              const label = spec.label[lang];
              // narrow, tall pieces (a wardrobe turned sideways, a kitchen counter) get a vertical label
              const vertical = w < 60 && h > w;
              const cx = x + w / 2, cy = y + h / 2;
              const shape = (
                <>
                  <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={spec.fixed ? 2 : 6} fill={colors.fill} stroke={isSel ? '#142e37' : colors.stroke} strokeWidth={isSel ? 3.5 : 2} />
                  <text x={cx} y={cy + 4} transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined} textAnchor="middle" className="fp-label" fontSize={Math.min(w, h) < 50 ? 11 : 13}>{label}</text>
                  {unreachable(f.id) && <text x={x + w - 6} y={y + 17} textAnchor="end" className="fp-warn">⚠</text>}
                </>
              );
              if (spec.fixed) return <g key={f.id} className="fp-fixture">{shape}</g>;
              return (
                <g
                  key={f.id}
                  className={`fp-room${isSel ? ' selected' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${label}, ${metres(r.width)} × ${metres(r.depth)}${unreachable(f.id) ? `, ${t.unreachable}` : ''}`}
                  onPointerDown={e => startDrag(e, f.id)}
                  onFocus={() => setSelected(f.id)}
                  onKeyDown={e => onKey(e, f.id)}
                >
                  {shape}
                </g>
              );
            })}
            {openings.map(o => ({ o, swing: doorSwing(o, plan) })).filter(d => d.swing).map(({ o, swing }) => (
              <text key={o.id} x={p(swing!.x + swing!.width / 2)} y={p(swing!.y + swing!.depth / 2) + 4} textAnchor="middle" className="fp-door-label">{o.label[lang]}</text>
            ))}
            {ghost && <rect x={p(ghost.x) + 2} y={p(ghost.y) + 2} width={ghost.width * scale - 4} height={ghost.depth * scale - 4} rx="6" className="fp-ghost" />}
          </PlanFrame>
        </div>
        <div className="metrics three">
          <div><small>{t.studio}</small><strong>{formatNumber(plan.width * plan.depth, lang)} m²</strong></div>
          <div><small>{t.furniture}</small><strong>{formatNumber(furnitureArea, lang)} m²</strong></div>
          <div><small>{t.freeFloor}</small><strong>{formatNumber(freeArea, lang)} m²</strong></div>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.furnishTitle}</h2>
        <div className="room-chips" role="group" aria-label={t.selected}>
          {movable.map(item => (
            <button key={item.id} className={item.id === selected ? 'active' : ''} aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>
              <span style={{ background: colorsOf(item).fill }} />{item.label[lang]}{unreachable(item.id) && ' ⚠'}
            </button>
          ))}
        </div>
        <div className="room-editor">
          <div className="control-label"><span>{sel.label[lang]}</span><strong>{metres(selRect.width)} × {metres(selRect.depth)}</strong></div>
          <button className="subtle full rotate-button" onClick={() => rotate(selected)}><RotateCw size={17} />{t.rotate}</button>
        </div>
        {blocked && <div className="note warn" role="status">{t.blockedFurniture}</div>}
        <NeedsList lang={lang} items={game.constraints.map((c, i) => ({ label: c.label[lang], ok: result.constraints[i] }))} />
        <Feedback
          game={game}
          lang={lang}
          solved={result.solved}
          checked={checked}
          onCheck={() => { setChecked(true); setBlocked(false); }}
          hint={hint}
          onHint={() => setHint(h => Math.min(h + 1, game.hints[lang].length - 1))}
          onReset={reset}
        />
      </aside>
    </div>
  );
}
