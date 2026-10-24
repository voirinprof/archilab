import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { FloorplanActivity, PlacedRoom, Rect, RoomSpec } from './types.ts';
import { area, canPlace, clamp, clampPosition, evaluate, hasValidSize, initialLayout, sizeBounds } from './rules.ts';
import { Feedback, NeedsList, PAD, PlanFrame, RoomLabel, SCALE, colorsOf, px, ui } from './shared.tsx';

const HANDLE = 22;
const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type Drag = { id: string; mode: 'move' | 'resize'; startX: number; startY: number; origin: Rect };

/** Layout mode: the player moves and resizes rooms inside the plan. */
export function LayoutGame({ game, lang }: { game: FloorplanActivity; lang: Lang }) {
  const t = ui[lang];
  const { plan, rooms } = game.parameters;
  const [layout, setLayout] = useState<PlacedRoom[]>(() => initialLayout(rooms));
  const [selected, setSelected] = useState<string>(rooms[0].id);
  const [ghost, setGhost] = useState<Rect | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);

  const specOf = (id: string): RoomSpec => rooms.find(r => r.id === id)!;
  const rectOf = (id: string): PlacedRoom => layout.find(r => r.id === id)!;
  const result = evaluate(game.constraints, layout, plan);
  const roomsArea = layout.reduce((sum, r) => sum + area(r), 0);

  function place(id: string, rect: Rect): boolean {
    if (!hasValidSize(rect, specOf(id)) || !canPlace(layout, id, rect, plan)) return false;
    setLayout(current => current.map(r => (r.id === id ? { ...r, ...rect } : r)));
    setChecked(false);
    return true;
  }

  function tryPlace(id: string, rect: Rect) {
    setBlocked(!place(id, rect));
  }

  function reset() {
    setLayout(initialLayout(rooms));
    setSelected(rooms[0].id);
    setGhost(null);
    setBlocked(false);
    setChecked(false);
    setHint(-1);
  }

  function toMetres(e: PointerEvent): { x: number; y: number } | null {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: (p.x - PAD) / SCALE, y: (p.y - PAD) / SCALE };
  }

  function startDrag(e: PointerEvent, id: string, mode: Drag['mode']) {
    const p = toMetres(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(id);
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { id, mode, startX: p.x, startY: p.y, origin: rectOf(id) };
  }

  function moveDrag(e: PointerEvent) {
    const d = drag.current;
    const p = d && toMetres(e);
    if (!d || !p) return;
    const dx = Math.round(p.x - d.startX);
    const dy = Math.round(p.y - d.startY);
    const o = d.origin;
    const spec = specOf(d.id);
    const w = sizeBounds(spec, 'width'), h = sizeBounds(spec, 'depth');
    const candidate: Rect = d.mode === 'move'
      ? clampPosition({ ...o, x: o.x + dx, y: o.y + dy }, plan)
      : {
          ...o,
          width: clamp(o.width + dx, { min: w.min, max: Math.min(w.max, plan.width - o.x) }),
          depth: clamp(o.depth + dy, { min: h.min, max: Math.min(h.max, plan.depth - o.y) }),
        };
    const current = rectOf(d.id);
    if (candidate.x === current.x && candidate.y === current.y && candidate.width === current.width && candidate.depth === current.depth) {
      setGhost(null);
      return;
    }
    const ok = place(d.id, candidate);
    setGhost(ok ? null : candidate);
    setBlocked(!ok);
  }

  function endDrag() {
    drag.current = null;
    setGhost(null);
  }

  function onKey(e: KeyboardEvent, id: string) {
    const delta = arrows[e.key];
    if (!delta) return;
    e.preventDefault();
    const r = rectOf(id);
    const [dx, dy] = delta;
    tryPlace(id, e.shiftKey ? { ...r, width: r.width + dx, depth: r.depth + dy } : { ...r, x: r.x + dx, y: r.y + dy });
  }

  const sel = rectOf(selected);
  const selSpec = specOf(selected);

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.layoutHelp}</p>
        <div className="drawing">
          <PlanFrame plan={plan} lang={lang} svgRef={svgRef} className="draggable" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <rect x={px(0)} y={px(0)} width={plan.width * SCALE} height={plan.depth * SCALE} fill="none" stroke="#37545b" strokeWidth="6" />
            {layout.map(r => {
              const spec = specOf(r.id);
              const colors = colorsOf(spec);
              const isSel = r.id === selected;
              const x = px(r.x), y = px(r.y), w = r.width * SCALE, h = r.depth * SCALE;
              return (
                <g
                  key={r.id}
                  className={`fp-room${isSel ? ' selected' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${spec.label[lang]}, ${r.width} m × ${r.depth} m, ${area(r)} m²`}
                  onPointerDown={e => startDrag(e, r.id, 'move')}
                  onFocus={() => setSelected(r.id)}
                  onKeyDown={e => onKey(e, r.id)}
                >
                  <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx="4" fill={colors.fill} stroke={isSel ? '#142e37' : colors.stroke} strokeWidth={isSel ? 3.5 : 2} />
                  <RoomLabel rect={r} label={spec.label[lang]} detail={`${area(r)} m²`} />
                  {isSel && (
                    <path
                      className="fp-handle"
                      d={`M${x + w - 3} ${y + h - 3 - HANDLE}V${y + h - 3}H${x + w - 3 - HANDLE}Z`}
                      onPointerDown={e => startDrag(e, r.id, 'resize')}
                    />
                  )}
                </g>
              );
            })}
            {ghost && <rect x={px(ghost.x) + 2} y={px(ghost.y) + 2} width={ghost.width * SCALE - 4} height={ghost.depth * SCALE - 4} rx="4" className="fp-ghost" />}
          </PlanFrame>
        </div>
        <div className="metrics three">
          <div><small>{t.home}</small><strong>{plan.width * plan.depth} m²</strong></div>
          <div><small>{t.rooms}</small><strong>{roomsArea} m²</strong></div>
          <div><small>{t.free}</small><strong>{plan.width * plan.depth - roomsArea} m²</strong></div>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.design}</h2>
        <div className="room-chips" role="group" aria-label={t.selected}>
          {rooms.map(room => (
            <button key={room.id} className={room.id === selected ? 'active' : ''} aria-pressed={room.id === selected} onClick={() => setSelected(room.id)}>
              <span style={{ background: colorsOf(room).fill }} />{room.label[lang]}
            </button>
          ))}
        </div>
        <div className="room-editor">
          <div className="control-label"><span>{selSpec.label[lang]}</span><strong>{area(sel)} m²</strong></div>
          {(['width', 'depth'] as const).map(k => {
            const bounds = sizeBounds(selSpec, k);
            return (
              <div className="stepper" key={k}>
                <span>{t[k]}</span>
                <button aria-label={`${t.less} (${t[k].toLowerCase()})`} disabled={sel[k] <= bounds.min} onClick={() => tryPlace(selected, { ...sel, [k]: sel[k] - 1 })}><Minus size={16} /></button>
                <strong>{sel[k]} m</strong>
                <button aria-label={`${t.more} (${t[k].toLowerCase()})`} disabled={sel[k] >= bounds.max} onClick={() => tryPlace(selected, { ...sel, [k]: sel[k] + 1 })}><Plus size={16} /></button>
              </div>
            );
          })}
        </div>
        {blocked && <div className="note warn" role="status">{t.blocked}</div>}
        <NeedsList
          lang={lang}
          items={[
            { label: t.inside, ok: result.inside },
            { label: t.noOverlap, ok: result.noOverlap },
            ...game.constraints.map((c, i) => ({ label: c.label[lang], ok: result.constraints[i] })),
          ]}
        />
        <Feedback
          game={game}
          lang={lang}
          solved={result.solved}
          checked={checked}
          onCheck={() => setChecked(true)}
          hint={hint}
          onHint={() => setHint(h => Math.min(h + 1, game.hints[lang].length - 1))}
          onReset={reset}
        />
      </aside>
    </div>
  );
}
