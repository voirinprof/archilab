import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { ContextSpec, DimensionLine, FloorplanActivity, PlacedRoom, Rect, RoomSpec } from './types.ts';
import { area, buildableZone, canPlace, clamp, clampPosition, contextRects, coverage, dimensionLines, evaluate, hasValidSize, initialLayout, sizeBounds } from './rules.ts';
import { Feedback, NeedsList, PAD, PlanFrame, RoomLabel, SCALE, colorsOf, formatNumber, px, ui } from './shared.tsx';

const HANDLE = 22;
const TREE_CROWN = 2.5; // drawn crown radius in metres; distances are measured to the trunk
const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type Drag = { id: string; mode: 'move' | 'resize'; startX: number; startY: number; origin: Rect };

/** Smallest rectangle holding the plan and every context element. */
function extentOf(plan: { width: number; depth: number }, context: Rect[]): Rect {
  const rects = [{ x: 0, y: 0, width: plan.width, depth: plan.depth }, ...context];
  const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
  const x1 = Math.max(...rects.map(r => r.x + r.width)), y1 = Math.max(...rects.map(r => r.y + r.depth));
  return { x: x0, y: y0, width: x1 - x0, depth: y1 - y0 };
}

function ContextShape({ item, lang, scale }: { item: ContextSpec; lang: Lang; scale: number }) {
  const p = (m: number) => px(m, scale);
  const r = item.rect;
  if (item.kind === 'tree') {
    const cx = p(r.x + r.width / 2), cy = p(r.y + r.depth / 2);
    return (
      <g className="fp-tree">
        <circle cx={cx} cy={cy} r={TREE_CROWN * scale} />
        <rect x={p(r.x)} y={p(r.y)} width={r.width * scale} height={r.depth * scale} rx="3" className="fp-trunk" />
        <text x={cx + TREE_CROWN * scale + 4} y={cy + 4} className="fp-context-label">{item.label[lang]}</text>
      </g>
    );
  }
  return (
    <g className={item.kind === 'street' ? 'fp-street' : 'fp-neighbour'}>
      <rect x={p(r.x)} y={p(r.y)} width={r.width * scale} height={r.depth * scale} />
      <text x={p(r.x + r.width / 2)} y={p(r.y + r.depth / 2) + 4} textAnchor="middle" className="fp-context-label">{item.label[lang]}</text>
    </g>
  );
}

function DimensionMark({ line, lang, scale }: { line: DimensionLine; lang: Lang; scale: number }) {
  const [x1, y1] = line.from.map(m => px(m, scale)), [x2, y2] = line.to.map(m => px(m, scale));
  const length = Math.hypot(x2 - x1, y2 - y1);
  // unit vector perpendicular to the line, for the end ticks and the label offset;
  // distance labels go on the other side so they don't hide a setback measured along the same line
  const side = line.kind === 'distance' ? -1 : 1;
  const nx = length ? -(y2 - y1) / length : 0, ny = length ? (x2 - x1) / length : -1;
  const tick = (x: number, y: number) => <line x1={x - nx * 5} y1={y - ny * 5} x2={x + nx * 5} y2={y + ny * 5} />;
  return (
    <g className={`fp-dimension ${line.ok ? 'ok' : 'bad'}`}>
      {length > 0 && <><line x1={x1} y1={y1} x2={x2} y2={y2} />{tick(x1, y1)}{tick(x2, y2)}</>}
      <text x={(x1 + x2) / 2 + side * nx * 10} y={(y1 + y2) / 2 + side * ny * 10 + 4} textAnchor="middle">{formatNumber(line.value, lang)} m</text>
    </g>
  );
}

/** Layout mode: the player moves and resizes rooms inside the plan (a home, or a building on its lot). */
export function LayoutGame({ game, lang }: { game: FloorplanActivity; lang: Lang }) {
  const t = ui[lang];
  const { plan, rooms } = game.parameters;
  const scale = game.parameters.scale ?? SCALE;
  const site = game.parameters.boundary === 'lot';
  const contextItems = game.parameters.context ?? [];
  const context = contextRects(contextItems);
  const p = (m: number) => px(m, scale);

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
  const result = evaluate(game.constraints, layout, plan, { context });
  const roomsArea = layout.reduce((sum, r) => sum + area(r), 0);
  const dimensions = dimensionLines(game.constraints, layout, plan, context);
  const revealAt = game.parameters.reveal_zone_hint;
  const zone = revealAt !== undefined && hint + 1 >= revealAt ? buildableZone(game.constraints, selected, plan, context) : null;

  function place(id: string, rect: Rect): boolean {
    if (!hasValidSize(rect, specOf(id)) || !canPlace(layout, id, rect, plan, context)) return false;
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
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: (pt.x - PAD) / scale, y: (pt.y - PAD) / scale };
  }

  function startDrag(e: PointerEvent, id: string, mode: Drag['mode']) {
    const pt = toMetres(e);
    if (!pt) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(id);
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { id, mode, startX: pt.x, startY: pt.y, origin: rectOf(id) };
  }

  function moveDrag(e: PointerEvent) {
    const d = drag.current;
    const pt = d && toMetres(e);
    if (!d || !pt) return;
    const dx = Math.round(pt.x - d.startX);
    const dy = Math.round(pt.y - d.startY);
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
  const metrics = site
    ? [
        { label: t.lot, value: `${plan.width * plan.depth} m²` },
        { label: t.footprint, value: `${roomsArea} m²` },
        { label: t.coverage, value: `${formatNumber(coverage(layout, plan) * 100, lang)} %` },
      ]
    : [
        { label: t.home, value: `${plan.width * plan.depth} m²` },
        { label: t.rooms, value: `${roomsArea} m²` },
        { label: t.free, value: `${plan.width * plan.depth - roomsArea} m²` },
      ];
  const globalNeeds = site
    ? [{ label: t.onLot, ok: result.inside && result.noOverlap }]
    : [{ label: t.inside, ok: result.inside }, { label: t.noOverlap, ok: result.noOverlap }];

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{site ? t.siteHelp : t.layoutHelp}</p>
        <div className="drawing">
          <PlanFrame
            plan={plan}
            lang={lang}
            svgRef={svgRef}
            scale={scale}
            extent={extentOf(plan, context)}
            boundary={site ? 'lot' : 'wall'}
            className="draggable"
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {contextItems.map(item => <ContextShape key={item.id} item={item} lang={lang} scale={scale} />)}
            {site
              ? <rect x={p(0)} y={p(0)} width={plan.width * scale} height={plan.depth * scale} className="fp-lot-line" />
              : <rect x={p(0)} y={p(0)} width={plan.width * scale} height={plan.depth * scale} fill="none" stroke="#37545b" strokeWidth="6" />}
            {zone && (
              <g className="fp-zone" clipPath="url(#fp-plan-clip)">
                <clipPath id="fp-plan-clip"><rect x={p(0)} y={p(0)} width={plan.width * scale} height={plan.depth * scale} /></clipPath>
                {zone.halos.map(({ rect, radius }, i) => (
                  <rect key={i} x={p(rect.x - radius)} y={p(rect.y - radius)} width={(rect.width + 2 * radius) * scale} height={(rect.depth + 2 * radius) * scale} rx={radius * scale} className="fp-halo" />
                ))}
                <rect x={p(zone.zone.x)} y={p(zone.zone.y)} width={zone.zone.width * scale} height={zone.zone.depth * scale} className="fp-buildable" />
                <text x={p(zone.zone.x) + 6} y={p(zone.zone.y) + 15} className="fp-zone-label">{t.zone}</text>
              </g>
            )}
            {layout.map(r => {
              const spec = specOf(r.id);
              const colors = colorsOf(spec);
              const isSel = r.id === selected;
              const x = p(r.x), y = p(r.y), w = r.width * scale, h = r.depth * scale;
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
                  <RoomLabel rect={r} label={spec.label[lang]} detail={`${area(r)} m²`} scale={scale} />
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
            {dimensions.map((line, i) => <DimensionMark key={i} line={line} lang={lang} scale={scale} />)}
            {ghost && <rect x={p(ghost.x) + 2} y={p(ghost.y) + 2} width={ghost.width * scale - 4} height={ghost.depth * scale - 4} rx="4" className="fp-ghost" />}
          </PlanFrame>
        </div>
        <div className="metrics three">
          {metrics.map(m => <div key={m.label}><small>{m.label}</small><strong>{m.value}</strong></div>)}
        </div>
      </section>
      <aside className="controls">
        <h2>{site ? t.siteTitle : t.design}</h2>
        {rooms.length > 1 && (
          <div className="room-chips" role="group" aria-label={t.selected}>
            {rooms.map(room => (
              <button key={room.id} className={room.id === selected ? 'active' : ''} aria-pressed={room.id === selected} onClick={() => setSelected(room.id)}>
                <span style={{ background: colorsOf(room).fill }} />{room.label[lang]}
              </button>
            ))}
          </div>
        )}
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
        {blocked && <div className="note warn" role="status">{site ? t.blockedSite : t.blocked}</div>}
        <NeedsList lang={lang} items={[...globalNeeds, ...game.constraints.map((c, i) => ({ label: c.label[lang], ok: result.constraints[i] }))]} />
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
